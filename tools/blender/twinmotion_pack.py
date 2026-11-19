"""Twinmotion pack: import the Unreal export's split .glbs, bind each baked 6E texture set as image maps, export one textured .glb.

Steps (the Twinmotion pack of Nov 19 2026):
  1. node tools/export/export_scene.mjs --plan PLAN.json --out EXPORT --port 5199
  2. Blender -b --factory-startup -P tools/blender/export_unreal.py -- --glb EXPORT/c-prow-lantern.glb --textures TEXTURES_6E --out SCENE_DIR --styles tools/blender/styles.json
  3. Blender -b --factory-startup -P tools/blender/twinmotion_pack.py -- SCENE_DIR TEXTURES_6E OUT_DIR 2048

A slot used by several cabins arrives once per .glb (Blender names the repeats slot.001, slot.002); they are merged into one textured material.
"""
import json
import pathlib
import sys

import bpy
import numpy as np

scene_dir, tex6e, out_dir, res = sys.argv[sys.argv.index("--") + 1:]
scene_dir, tex6e, out_dir, res = pathlib.Path(scene_dir), pathlib.Path(tex6e), pathlib.Path(out_dir), int(res)
tex_out = out_dir / "textures"
tex_out.mkdir(parents=True, exist_ok=True)
scene = json.loads((scene_dir / "scene.json").read_text())
mats6e = json.loads((tex6e / "materials.json").read_text())["materials"]

bpy.ops.wm.read_factory_settings(use_empty=True)
for f in sorted(scene_dir.glob("*.glb")):
    bpy.ops.import_scene.gltf(filepath=str(f))

_done = {}


def convert(set_key, kind):
    """One map at RES for Twinmotion: BC as JPEG, ORM PNG, N PNG flipped to OpenGL (green up)."""
    key = (set_key, kind)
    if key in _done:
        return _done[key]
    rel = mats6e[set_key].get("maps", {}).get(kind)
    if not rel:
        _done[key] = None
        return None
    img = bpy.data.images.load(str(tex6e / rel))
    img.colorspace_settings.name = "sRGB" if kind == "BC" else "Non-Color"
    img.scale(res, res)
    if kind == "N":
        px = np.empty(res * res * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px[1::4] = 1.0 - px[1::4]
        img.pixels.foreach_set(px)
    ext = "jpg" if kind == "BC" else "png"
    dst = tex_out / f"T_{set_key}_{kind}.{ext}"
    img.filepath_raw = str(dst)
    img.file_format = "JPEG" if ext == "jpg" else "PNG"
    img.save(quality=90)
    bpy.data.images.remove(img)
    out = bpy.data.images.load(str(dst))
    out.colorspace_settings.name = "sRGB" if kind == "BC" else "Non-Color"
    _done[key] = out
    return out


def set_for(slot):
    m = scene["materials"].get(slot)
    if not m:
        return None
    if m["kind"] == "set":
        return m["set"]
    if m["kind"] in ("wainscot", "terrain"):
        return m["upper"]
    return None


def tex(nt, uv, image):
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image
    nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
    return t


def build(mat, set_key):
    const = mats6e[set_key].get("constants", {})
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], outn.inputs["Surface"])
    uv = nt.nodes.new("ShaderNodeTexCoord")
    bc = convert(set_key, "BC")
    if bc:
        nt.links.new(tex(nt, uv, bc).outputs["Color"], bsdf.inputs["Base Color"])
    orm = convert(set_key, "ORM")
    if orm:
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex(nt, uv, orm).outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = convert(set_key, "N")
    if nmap:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tex(nt, uv, nmap).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    for name, sock in (("Metallic", "Metallic"), ("Roughness", "Roughness")):
        if name in const and not bsdf.inputs[sock].links:
            bsdf.inputs[sock].default_value = const[name]
    alpha = const.get("Alpha", 1.0) * (1.0 - const.get("Transmission", 0.0))
    if set_key.startswith("glass"):
        alpha = min(alpha, 0.35)
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"


import re

report = {}
merged = {}
first = {}
# each split .glb brings its own copy of a slot, which Blender renames slot.001, slot.002: one textured material per slot, shared
for mat in sorted(bpy.data.materials, key=lambda m: m.name):
    slot = re.sub(r"\.\d{3}$", "", mat.name)
    if slot in first:
        mat.user_remap(first[slot])
        merged[slot] = merged.get(slot, 0) + 1
        continue
    first[slot] = mat
    sk = set_for(slot)
    if sk and sk in mats6e:
        build(mat, sk)
        report[slot] = sk
for mat in [m for m in bpy.data.materials if m.users == 0]:
    bpy.data.materials.remove(mat)
print("TM merged duplicate slots:", json.dumps(merged))
print("TM textured slots:", len(report), json.dumps(report))
print("TM maps written:", sorted(p.name for p in tex_out.iterdir()))

glb = out_dir / "islandale_scheme_c_textured.glb"
bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_image_format="AUTO", export_yup=True)
print("TM wrote", glb, glb.stat().st_size)
