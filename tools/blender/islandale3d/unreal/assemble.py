"""The Blender side of the Unreal export (6F): weld a straight mass's walls, name every material slot for 6G, give each
group one mesh object with UV0 = UVMeters / tile, and write it as .glb. The naming and maths are in the pure modules."""
from __future__ import annotations

import pathlib

import bmesh
import bpy
from mathutils import Matrix, Vector

from ..staging import Ground
from ..uv import UV_MAP
from . import names, uvs

WELD_DIST = 0.0005            # m: as styling.WELD_DIST
UV0 = "UV0"
STANDIN_ROUGHNESS = 0.7
PREVIEW_PX = 512              # --preview-textures: one tile of each BC map, this size


def _as_list(v):
    return v.to_list() if hasattr(v, "to_list") else list(v)


def _straight_mass_indices(planner: dict) -> set:
    return {m.get("mi", i) for i, m in enumerate(planner.get("masses", [])) if m.get("wallEi") == "edge"}


def _outer_wall(it) -> bool:
    return it.part == "wall" and not it.props.get("interior") and not it.props.get("decor")


def join(objects: list, name: str | None = None):
    """Join objects into the first (bpy.ops.object.join keeps materials, UV maps by name and custom normals) and apply its
    transform, so the vertices are in site coordinates. Returns the joined object."""
    keep = objects[0]
    for ob in objects:
        if ob.data.users > 1:                     # glTF meshes shared between nodes: join must not edit the others
            ob.data = ob.data.copy()
    if len(objects) > 1:
        with bpy.context.temp_override(active_object=keep, object=keep, selected_objects=objects,
                                       selected_editable_objects=objects):
            bpy.ops.object.join()
    mw = keep.matrix_world.copy()                 # the glTF node hierarchy's world transform, baked into the vertices
    keep.parent = None
    keep.data.transform(mw)
    keep.matrix_world = Matrix.Identity(4)
    if name:
        keep.name = name
        keep.data.name = name
    return keep


def weld(me, dist: float = WELD_DIST) -> int:
    """Merge coincident vertices; returns how many went."""
    bm = bmesh.new()
    bm.from_mesh(me)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    gone = before - len(bm.verts)
    bm.to_mesh(me)
    bm.free()
    return gone


def weld_straight_walls(site) -> dict:
    """The lantern corner seam (6D): on a straight mass the export makes one wall mesh per outline edge, and displaced on
    their own they part at the corners. Join each straight mass's outer walls into one mesh per building and weld the
    corners. Returns {"<oid> m<mi>": walls joined}. Run wainscot_bases first: it measures each wall mesh on its own."""
    out, gone = {}, set()
    for oid, items in site.buildings().items():
        straight = _straight_mass_indices(site.objects.get(oid) or {})
        by_mass: dict = {}
        for it in items:
            if _outer_wall(it) and it.props.get("mi") in straight:
                by_mass.setdefault(it.props["mi"], []).append(it)
        for mi, walls in sorted(by_mass.items()):
            if len(walls) < 2:
                continue
            ob = join([w.ob for w in walls])
            merged = weld(ob.data)
            gone |= {id(w) for w in walls[1:]}
            out[f"{oid} m{mi}"] = {"walls": len(walls), "verts_welded": merged}
    site.items = [it for it in site.items if id(it) not in gone]
    return out


def _base_color(mat):
    """A glTF-imported material's base colour (linear), from its Principled BSDF."""
    if not mat or not mat.node_tree:
        return (0.5, 0.5, 0.5)
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return tuple(mat.diffuse_color[:3])
    return tuple(bsdf.inputs["Base Color"].default_value[:3])


class Slots:
    """Names every (mesh, material) pair for 6G, from what styling.dress built."""

    def __init__(self, sty, blends: dict, wall_base: dict):
        self.blends = blends
        self.wall_base = wall_base
        self.by_material = {}
        for tag, mat in sty.made.items():
            key, params = names.parse_tag(tag)
            self.by_material[mat.name] = names.set_slot({"material": key, "params": params} if params else key)
        self.info = {}                          # slot -> scene_doc info

    def resolve(self, item, mat, single: bool) -> str:
        if mat is not None and mat.name in self.by_material:
            slot, info = self.by_material[mat.name], {"kind": "set"}
        elif mat is not None and mat.get("is_blend"):
            upper, lower = (self.by_material.get(n) for n in _as_list(mat["is_blend"]))
            if mat.name == "M_Terrain":
                slot, info = names.TERRAIN_SLOT, {"kind": "terrain"}
            else:
                blend = names.wainscot_blend(upper, lower, self.blends)
                oid = item.props.get("oid")
                top = self.wall_base[oid] + self.blends[blend]["height_m"]
                slot, info = names.wainscot_slot(blend, oid), {"kind": "wainscot", "oid": oid, "top_z_m": top}
        else:                                   # keeps the app's colour: interiors, furniture, cars, ceilings
            colour = item.props.get("color") if single and item.props.get("color") else None
            srgb = names.color_hex(colour) if colour else names.color_hex(
                [names.linear_to_srgb(c) for c in _base_color(mat)])
            slot, info = names.planner_slot(srgb), {"kind": "color", "srgb": srgb}
        self.info.setdefault(slot, info)
        return slot


class Standins:
    """One plain material per slot, named the slot: a flat colour (a set's mean albedo, the app's colour), or with
    preview=True one tile of the set's BC map, so the files read right before 6G binds its own materials."""

    def __init__(self, textures: pathlib.Path, materials: dict, blends: dict, preview: bool, tmp: pathlib.Path):
        self.textures, self.materials, self.blends, self.preview, self.tmp = textures, materials, blends, preview, tmp
        self.made = {}

    def _set_for(self, slot: str, info: dict) -> str | None:
        if info["kind"] == "set":
            return slot
        if info["kind"] == "terrain":
            return self.blends[names.TERRAIN_SLOT]["upper"]
        if info["kind"] == "wainscot":
            return self.blends[slot.split("__")[0]]["upper"]
        return None

    def _mean_albedo(self, set_name: str):
        import numpy as np
        path = self.textures / set_name / "preview_BC.png"
        if not path.exists():
            return (0.5, 0.5, 0.5)
        img = bpy.data.images.load(str(path), check_existing=True)
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        srgb = px.reshape(-1, 4)[:, :3].mean(axis=0)
        return tuple(names.srgb_to_linear(c) for c in srgb)

    def _preview_image(self, set_name: str):
        src = self.textures / self.materials[set_name]["maps"]["BC"]
        img = bpy.data.images.load(str(src))
        img.scale(PREVIEW_PX, PREVIEW_PX)
        out = self.tmp / f"T_{set_name}_BC_{PREVIEW_PX}.png"
        img.filepath_raw = str(out)
        img.file_format = "PNG"
        img.save()
        return img

    def get(self, slot: str, info: dict):
        if slot in self.made:
            return self.made[slot]
        clash = bpy.data.materials.get(slot)
        if clash is not None:                     # e.g. a glTF material already called "water": the slot name must be exact
            clash.name = f"{slot}__src"
        mat = bpy.data.materials.new(slot)
        if mat.name != slot:
            raise RuntimeError(f"material {slot!r} came out as {mat.name!r}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Roughness"].default_value = STANDIN_ROUGHNESS
        set_name = self._set_for(slot, info)
        if set_name is None:
            h = names.color_hex(info["srgb"])
            rgb = [names.srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
            bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        else:
            metallic = self.materials[set_name].get("constants", {}).get("Metallic")
            if isinstance(metallic, (int, float)):
                bsdf.inputs["Metallic"].default_value = float(metallic)
            if self.preview:
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.image = self._preview_image(set_name)
                mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            else:
                bsdf.inputs["Base Color"].default_value = (*self._mean_albedo(set_name), 1.0)
        self.made[slot] = mat
        return mat


def restyle(ob, item, slots: Slots, standins: Standins) -> None:
    """Swap each of the object's materials for its slot's stand-in (single-user mesh first)."""
    if ob.data.users > 1:
        ob.data = ob.data.copy()
    mats = list(ob.data.materials) or [None]
    single = len(mats) == 1
    if not ob.data.materials:
        ob.data.materials.append(None)
    for i, mat in enumerate(mats):
        slot = slots.resolve(item, mat, single)
        ob.data.materials[i] = standins.get(slot, slots.info[slot])


def make_uv0(me, tiles_by_material_index: list[float]) -> dict:
    """UVMeters / tile, every island moved by whole tiles toward 0; UVMeters becomes the mesh's only UV map, named UV0."""
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.loops.layers.uv.get(UV_MAP)
    if layer is None:
        bm.free()
        raise ValueError(f"mesh {me.name} has no {UV_MAP} map: dress it (or apply_uv_meters) first")
    bm.verts.index_update()
    faces = list(bm.faces)
    face_verts = [[v.index for v in f.verts] for f in faces]
    face_uvs = [[uvs.scale(tuple(lp[layer].uv), tiles_by_material_index[f.material_index]) for lp in f.loops]
                for f in faces]
    shifts = uvs.island_shifts(face_verts, face_uvs)
    worst = 0.0
    for f, fu, (du, dv) in zip(faces, face_uvs, shifts):
        for lp, (u, v) in zip(f.loops, fu):
            lp[layer].uv = (u - du, v - dv)
            worst = max(worst, abs(u - du), abs(v - dv))
    bm.to_mesh(me)
    bm.free()
    for name in [lay.name for lay in me.uv_layers if lay.name != UV_MAP]:
        me.uv_layers.remove(me.uv_layers[name])
    me.uv_layers[UV_MAP].name = UV0
    me.uv_layers.active = me.uv_layers[UV0]
    me.uv_layers[UV0].active_render = True
    return {"islands": len(set(uvs.islands(face_verts))), "max_abs_uv": round(worst, 4)}


def triangles(me) -> int:
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def bounds(ob):
    pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return tuple(lo), tuple(hi)


def building_ground(site) -> dict:
    """oid -> its lowest point, its wall foot and the ground just outside its outer walls (min and max), in metres."""
    ground = Ground(site)
    out = {}
    for oid, items in site.buildings().items():
        pts = [it.ob.matrix_world @ v.co for it in items for v in it.ob.data.vertices]
        walls = [it.ob.matrix_world @ v.co for it in items if _outer_wall(it) for v in it.ob.data.vertices]
        if not pts:
            continue
        cx, cy = sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts)
        gz = []
        for p in walls[::max(1, len(walls) // 64)]:
            d = Vector((p.x - cx, p.y - cy))
            d = d.normalized() * 0.6 if d.length > 1e-6 else d
            z = ground.z(p.x + d.x, p.y + d.y)
            if z is not None:
                gz.append(z)
        out[oid] = {"lowest_z_m": round(min(p.z for p in pts), 4),
                    "wall_foot_z_m": round(min(p.z for p in walls), 4) if walls else None,
                    "ground_outside_walls_m": [round(min(gz), 4), round(max(gz), 4)] if gz else None}
    return out


def export_glb(ob, path: pathlib.Path) -> int:
    """Write one object as .glb (Y up, as Unreal's Interchange expects). Returns the file's size in bytes."""
    for o in list(bpy.context.selected_objects):
        if o is not None:
            o.select_set(False)
    ob.hide_set(False)
    ob.hide_viewport = False
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_vertex_color="NONE", export_cameras=False, export_lights=False, export_extras=False,
        export_animations=False, export_skins=False, export_morph=False)
    return path.stat().st_size
