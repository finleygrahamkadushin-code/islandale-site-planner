"""Render one material on a test cabin: a flat wall with a window, an outside corner and a curved corner like the prow's.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/swatch.py -- \
        --material ledgestone [--on walls|roof|ground] [--param "Seed=3"] [--true-displacement] [--tile-test] [--out x.png]

--on picks the surface that wears the material: the cabin's walls (default), a shed roof over it, or the ground round it;
each surface has a wide and a close view, written as <out>_wide.png and <out>_close.png (default out:
build/3d/swatches/<material>[_<on>].png). --param takes Name=value (a number, or a JSON list for colours) and may repeat.
--tile-test also renders the material's Base Color and Height flat over 2 x 2 tiles (<out>_tile_color.png, _tile_height.png)
and prints how far it is from repeating exactly every Tile metres (PERIODIC ... lines; mean under 0.01 means seamless).
The first render in a new process can take ~5 min while Cycles compiles Metal kernels; later ones take seconds."""
import argparse
import json
import math
import pathlib
import sys
import time

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import BUILD  # noqa: E402
from islandale3d.materials import build  # noqa: E402
from islandale3d.uv import apply_uv_meters  # noqa: E402

H = 2.8                                   # wall height (m)
ARC_C, ARC_R = (4.0, 2.5), 2.5            # the curved corner
WINDOW = (0, 1.2, 2.4, 0.9, 2.1)          # edge 0 (the front): u0, u1, v0, v1
REVEAL = 0.2                              # window reveal depth (m)
VIEWS = {"walls": {"wide": ((-4.2, -7.2, 1.8), (2.8, 1.0, 1.25), 35), "close": ((0.9, -1.9, 1.45), (1.9, 0.0, 1.2), 40)},
         "roof": {"wide": ((-5.0, -8.5, 6.8), (3.0, 2.2, 3.4), 35), "close": ((1.2, -2.6, 5.0), (2.4, 1.0, 3.6), 40)},
         "ground": {"wide": ((-4.0, -9.5, 2.2), (1.8, -2.5, 0.0), 35), "close": ((0.6, -4.0, 1.1), (1.2, -1.6, 0.0), 40)}}
ROOF_RISE = 2.0                           # the test shed roof climbs this much from the front eave to the back


def footprint():
    """CCW: front (faces -y), the curved corner, the east side, the back, the west side (faces -x)."""
    pts = [(0.0, 0.0), (4.0, 0.0)]
    for k in range(1, 13):
        a = math.radians(-90 + 90 * k / 12)
        pts.append((ARC_C[0] + ARC_R * math.cos(a), ARC_C[1] + ARC_R * math.sin(a)))
    return pts + [(6.5, 5.0), (0.0, 5.0)]


def cabin(fp):
    """Outer wall faces (with the window and its reveals) and a flat roof cap; returns (walls, roof)."""
    bm = bmesh.new()

    def quad(*pts):
        bm.faces.new([bm.verts.new(p) for p in pts])

    for i, a in enumerate(fp):
        b = fp[(i + 1) % len(fp)]
        A, B = Vector((*a, 0)), Vector((*b, 0))
        L = (B - A).length
        t = (B - A) / L
        out = Vector((t.y, -t.x, 0))                   # right of travel on a CCW outline
        P = lambda u, v, d=0.0: A + t * u + Vector((0, 0, v)) - out * d  # noqa: E731
        if i == WINDOW[0]:
            _, u0, u1, v0, v1 = WINDOW
            for ua, ub, va, vb in ((0, u0, 0, H), (u1, L, 0, H), (u0, u1, 0, v0), (u0, u1, v1, H)):
                quad(P(ua, va), P(ub, va), P(ub, vb), P(ua, vb))
            quad(P(u0, v0), P(u0, v0, REVEAL), P(u1, v0, REVEAL), P(u1, v0))        # sill
            quad(P(u1, v1), P(u1, v1, REVEAL), P(u0, v1, REVEAL), P(u0, v1))        # head
            quad(P(u0, v1), P(u0, v1, REVEAL), P(u0, v0, REVEAL), P(u0, v0))        # jambs
            quad(P(u1, v0), P(u1, v0, REVEAL), P(u1, v1, REVEAL), P(u1, v1))
        else:
            quad(P(0, 0), P(L, 0), P(L, H), P(0, H))
    me = bpy.data.meshes.new("SwatchWalls")
    bm.to_mesh(me)
    bm.free()
    walls = bpy.data.objects.new("SwatchWalls", me)
    bpy.context.collection.objects.link(walls)
    rme = bpy.data.meshes.new("SwatchRoof")
    rb = bmesh.new()
    rb.faces.new([rb.verts.new((x, y, H)) for x, y in fp])
    rb.to_mesh(rme)
    rb.free()
    roof = bpy.data.objects.new("SwatchRoof", rme)
    bpy.context.collection.objects.link(roof)
    return walls, roof


def shed_roof():
    """A shed roof over the cabin, low at the front so its slope faces the cameras, with a 0.6 m overhang."""
    me = bpy.data.meshes.new("SwatchShed")
    rb = bmesh.new()
    rb.faces.new([rb.verts.new(p) for p in ((-0.6, -0.6, H), (7.1, -0.6, H), (7.1, 5.6, H + ROOF_RISE), (-0.6, 5.6, H + ROOF_RISE))])
    rb.to_mesh(me)
    rb.free()
    ob = bpy.data.objects.new("SwatchShed", me)
    bpy.context.collection.objects.link(ob)
    return ob


def plain(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def stage(sun_elev=28.0, sun_az=118.0):
    """A sky for fill and a low sun raking across the front wall (azimuth clockwise from north), plus a ground plane."""
    sc = bpy.context.scene
    world = bpy.data.worlds.new("SwatchSky")
    sc.world = world
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for typ in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
        try:
            sky.sky_type = typ
            break
        except TypeError:
            continue
    sky.sun_disc = False
    sky.sun_elevation = math.radians(sun_elev)
    sky.sun_rotation = math.radians(sun_az)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.35
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4.0
    sun.data.angle = math.radians(0.6)
    az, el = math.radians(sun_az), math.radians(sun_elev)
    toward = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = (-toward).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    ground = bpy.data.objects.new("Ground", bpy.data.meshes.new("Ground"))
    gb = bmesh.new()
    bmesh.ops.create_grid(gb, x_segments=1, y_segments=1, size=20)
    gb.to_mesh(ground.data)
    gb.free()
    sc.collection.objects.link(ground)
    return ground


def camera(name, eye, look, lens):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    cam.location = eye
    cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    bpy.context.scene.collection.objects.link(cam)
    return cam


def render_setup(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.dicing_rate = 1.0
    sc.render.resolution_x, sc.render.resolution_y = res
    try:
        sc.view_settings.view_transform = "AgX"
    except TypeError:
        pass


def parse_params(pairs):
    params = {}
    for p in pairs:
        k, v = p.split("=", 1)
        params[k] = json.loads(v) if v[:1] in "[{-0123456789." else v
    return params


def tile_test(mat, out, res=1024):
    """Render the material's Base Color and Height (scaled by its relief) as flat emission over [0, 2 Tile]^2, then compare
    the image with itself shifted by one Tile in u and in v. A seamless material differs only by sampling noise."""
    import numpy as np
    g = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeGroup")
    if "Tile" not in g.inputs:
        print(f"PERIODIC {mat.name}: FAIL, the group has no Tile input")
        return
    T = g.inputs["Tile"].default_value
    relief = max(mat.get("is_relief_m", 0.0), 1e-6)
    me = bpy.data.meshes.new("TileTest")
    tb = bmesh.new()
    tb.faces.new([tb.verts.new(p) for p in ((0, 0, 0), (2 * T, 0, 0), (2 * T, 2 * T, 0), (0, 2 * T, 0))])
    tb.to_mesh(me)
    tb.free()
    plane = bpy.data.objects.new("TileTest", me)
    bpy.context.scene.collection.objects.link(plane)
    apply_uv_meters(plane)
    for o in bpy.context.scene.objects:
        o.hide_render = o is not plane and o.type == "MESH"
    tm = bpy.data.materials.new("TileTestMat")
    plane.data.materials.append(tm)
    nt = tm.node_tree
    nt.nodes.clear()
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMeters"
    gg = nt.nodes.new("ShaderNodeGroup")
    gg.node_tree = g.node_tree
    for s_in in g.inputs:
        if s_in.name != "Vector" and hasattr(s_in, "default_value"):
            gg.inputs[s_in.name].default_value = s_in.default_value
    nt.links.new(uv.outputs["UV"], gg.inputs["Vector"])
    em = nt.nodes.new("ShaderNodeEmission")
    mo = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], mo.inputs["Surface"])
    sc = bpy.context.scene
    sc.world = None
    cam = camera("TileCam", (T, T, 20.0), (T, T, 0.0), 50)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2 * T
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.view_settings.view_transform = "Standard"
    for chan in ("color", "height"):
        for l in list(nt.links):
            if l.to_node == em:
                nt.links.remove(l)
        if chan == "color":
            nt.links.new(gg.outputs["Base Color"], em.inputs["Color"])
        else:
            div = nt.nodes.new("ShaderNodeMath")
            div.operation = "DIVIDE"
            div.inputs[1].default_value = relief
            nt.links.new(gg.outputs["Height"], div.inputs[0])
            nt.links.new(div.outputs[0], em.inputs["Color"])
        path = out.with_name(f"{out.stem}_tile_{chan}.png")
        sc.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(str(path))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)[..., :3]
        h = res // 2
        du = np.abs(px[:h, :h] - px[:h, h:]).mean(axis=2)
        dv = np.abs(px[:h, :h] - px[h:, :h]).mean(axis=2)
        print(f"PERIODIC {mat.name} {chan}: Tile {T:g} m; shift u mean {du.mean():.4f} p99 {np.percentile(du, 99):.4f}; "
              f"shift v mean {dv.mean():.4f} p99 {np.percentile(dv, 99):.4f} -> {path}")


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--material", required=True)
    ap.add_argument("--on", default="walls", choices=["walls", "roof", "ground"])
    ap.add_argument("--param", action="append", default=[])
    ap.add_argument("--view", default="both", choices=["wide", "close", "both"])
    ap.add_argument("--true-displacement", action="store_true", help="adaptive subdivision on the surface (slower)")
    ap.add_argument("--tile-test", action="store_true")
    ap.add_argument("--res", default="1280x800")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    fp = footprint()
    walls, roof = cabin(fp)
    ground = stage()
    targets = {"walls": walls, "roof": shed_roof() if a.on == "roof" else roof, "ground": ground}
    if a.on == "roof":
        bpy.data.objects.remove(roof)
    apply_uv_meters(walls, outlines=[fp])
    for ob in (targets["roof"], ground):
        apply_uv_meters(ob)
    mat = build(a.material, **parse_params(a.param))
    fallback = {"walls": plain("Walls", (0.78, 0.76, 0.72), 0.8), "roof": plain("Roof", (0.16, 0.17, 0.18), 0.6),
                "ground": plain("Ground", (0.32, 0.33, 0.28), 0.95)}
    for k, ob in targets.items():
        ob.data.materials.append(mat if k == a.on else fallback[k])
    if a.true_displacement:
        sub = targets[a.on].modifiers.new("Adaptive", "SUBSURF")
        sub.subdivision_type = "SIMPLE"
        sub.use_adaptive_subdivision = True
    render_setup(tuple(int(x) for x in a.res.split("x")), a.samples)
    stem = a.material if a.on == "walls" else f"{a.material}_{a.on}"
    out = pathlib.Path(a.out) if a.out else BUILD / "swatches" / f"{stem}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    for v in (["wide", "close"] if a.view == "both" else [a.view]):
        bpy.context.scene.camera = camera(v, *VIEWS[a.on][v])
        path = out.with_name(f"{out.stem}_{v}{out.suffix}")
        bpy.context.scene.render.filepath = str(path)
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"SWATCH {a.material} {a.on} {v} -> {path} ({time.time() - t0:.1f}s)")
    if a.tile_test:
        tile_test(mat, out)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
