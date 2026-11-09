"""The Blender side of the Unreal bake: render a material group's outputs flat, as emission, into float images.

A plane spanning [-Tile, 2 Tile]^2 carries UVMeters = world (x, y); an orthographic camera looks straight down at the
square [s, s + Tile]^2 with ortho_scale = Tile on an N x N image, so pixel i covers [s + i T/N, s + (i+1) T/N] and its
centre is s + (i + 0.5) T/N: the first and last columns are neighbours across the wrap. No world, no lights, no bounces,
a 1-pixel box filter (each pixel is the average over its own square), view transform Standard, float EXR out."""
from __future__ import annotations

import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np

from ..uv import UV_MAP, apply_uv_meters

PLANE = "BakePlane"
CAMERA = "BakeCamera"
CAMERA_HEIGHT = 50.0

# Each pass packs up to three scalar outputs into R, G, B (None = a constant), or takes the colour output whole.
PASSES = {
    "color": ("Base Color",),
    "orm": ("AO", "Roughness", "Metallic"),
    "height": ("Height", "Alpha", "Transmission"),
}
PASS_DEFAULTS = {"AO": 1.0, "Alpha": 1.0, "Transmission": 0.0, "Roughness": 0.5, "Metallic": 0.0}


def group_node(mat: bpy.types.Material) -> bpy.types.ShaderNode:
    g = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeGroup"), None)
    if g is None:
        raise ValueError(f"{mat.name} has no material group node; is it from islandale3d.materials?")
    return g


def setup_scene(samples: int) -> None:
    """An empty scene set up for clean emission renders on the Metal GPU."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    sc = bpy.context.scene
    sc.world = None
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.cycles.pixel_filter_type = "BOX"
    sc.cycles.filter_width = 1.0
    sc.cycles.use_animated_seed = False
    sc.render.film_transparent = False
    sc.render.use_persistent_data = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    st = sc.render.image_settings
    st.file_format = "OPEN_EXR"
    st.color_depth = "32"
    st.exr_codec = "ZIP"
    st.color_mode = "RGBA"


def make_plane(tile: float) -> bpy.types.Object:
    me = bpy.data.meshes.new(PLANE)
    bm = bmesh.new()
    lo, hi = -tile, 2.0 * tile
    bm.faces.new([bm.verts.new(p) for p in ((lo, lo, 0.0), (hi, lo, 0.0), (hi, hi, 0.0), (lo, hi, 0.0))])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(PLANE, me)
    bpy.context.scene.collection.objects.link(ob)
    apply_uv_meters(ob)
    return ob


def make_camera(tile: float) -> bpy.types.Object:
    cam = bpy.data.objects.new(CAMERA, bpy.data.cameras.new(CAMERA))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = tile
    cam.data.clip_start, cam.data.clip_end = 1.0, CAMERA_HEIGHT * 2.0
    cam.data.sensor_fit = "HORIZONTAL"
    cam.rotation_euler = (0.0, 0.0, 0.0)               # looking down -Z, image x = world +x, image up = world +y
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def place_camera(cam: bpy.types.Object, tile: float, shift: float) -> None:
    cam.location = (shift + tile / 2.0, shift + tile / 2.0, CAMERA_HEIGHT)


class Baker:
    """Renders one material's passes. Reuses one plane, camera and evaluation material per material."""

    def __init__(self, mat: bpy.types.Material, samples: int):
        self.src = group_node(mat)
        self.tile = float(self.src.inputs["Tile"].default_value) if "Tile" in self.src.inputs else 6.0
        self.relief = max(float(mat.get("is_relief_m", 0.0)), 0.0)
        self.outputs = {s.name for s in self.src.outputs}
        self.samples = samples
        setup_scene(samples)
        self.plane = make_plane(self.tile)
        self.cam = make_camera(self.tile)
        self.eval_mat = bpy.data.materials.new(f"BakeEval_{mat.name}")
        self.plane.data.materials.append(self.eval_mat)
        self._build_eval()
        self.tmp = Path(tempfile.mkdtemp(prefix="isbake_"))

    def _build_eval(self) -> None:
        nt = self.eval_mat.node_tree
        nt.nodes.clear()
        n, lk = nt.nodes, nt.links
        uv = n.new("ShaderNodeUVMap")
        uv.uv_map = UV_MAP
        g = n.new("ShaderNodeGroup")
        g.node_tree = self.src.node_tree
        for s in self.src.inputs:
            if s.name != "Vector" and hasattr(s, "default_value"):
                g.inputs[s.name].default_value = s.default_value
        lk.new(uv.outputs["UV"], g.inputs["Vector"])
        self.g = g
        self.comb = n.new("ShaderNodeCombineColor")
        self.div = n.new("ShaderNodeMath")
        self.div.operation = "DIVIDE"
        self.div.inputs[1].default_value = self.relief if self.relief > 0 else 1.0
        self.em = n.new("ShaderNodeEmission")
        self.em.inputs["Strength"].default_value = 1.0
        out = n.new("ShaderNodeOutputMaterial")
        lk.new(self.em.outputs["Emission"], out.inputs["Surface"])

    def _wire(self, pass_name: str) -> list[str]:
        """Route the pass's outputs into the emission colour; returns which channels came from the material."""
        nt = self.eval_mat.node_tree
        for l in list(nt.links):
            if l.to_node in (self.em, self.comb, self.div):
                nt.links.remove(l)
        names = PASSES[pass_name]
        if pass_name == "color":
            nt.links.new(self.g.outputs["Base Color"], self.em.inputs["Color"])
            return ["Base Color"]
        live = []
        for i, name in enumerate(names):
            sock = self.comb.inputs[i]
            if name in self.outputs and not (name == "Height" and self.relief <= 0):
                src = self.g.outputs[name]
                if name == "Height":
                    nt.links.new(src, self.div.inputs[0])
                    src = self.div.outputs[0]
                nt.links.new(src, sock)
                live.append(name)
            else:
                sock.default_value = 0.0 if name == "Height" else PASS_DEFAULTS[name]
        nt.links.new(self.comb.outputs["Color"], self.em.inputs["Color"])
        return live

    def render(self, pass_name: str, res: int, shift: float = 0.0, seed: int = 0, samples: int | None = None
               ) -> tuple[np.ndarray, list[str]]:
        """One pass as float32 (res, res, 3), row 0 at v = shift (the bottom of the square)."""
        live = self._wire(pass_name)
        sc = bpy.context.scene
        sc.render.resolution_x = sc.render.resolution_y = res
        sc.render.resolution_percentage = 100
        sc.cycles.samples = samples or self.samples
        sc.cycles.seed = seed
        place_camera(self.cam, self.tile, shift)
        path = self.tmp / f"{pass_name}_{res}_{shift:g}_{seed}.exr"
        sc.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(str(path), check_existing=False)
        img.colorspace_settings.is_data = True
        buf = np.empty(res * res * 4, dtype=np.float32)
        img.pixels.foreach_get(buf)
        bpy.data.images.remove(img)
        path.unlink(missing_ok=True)
        return buf.reshape(res, res, 4)[..., :3].copy(), live

    def close(self) -> None:
        bpy.data.materials.remove(self.eval_mat)
        for ob in (self.plane, self.cam):
            data = ob.data
            bpy.data.objects.remove(ob)
            (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.cameras).remove(data)
        try:
            self.tmp.rmdir()
        except OSError:
            pass
