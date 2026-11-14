"""Export the dressed Islandale scene for Unreal (Phase 6F, PLAN-6F.md): one .glb per group and scene.json.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/export_unreal.py -- \
        --glb build/3d/export/c-prow-lantern.glb [--textures DIR] [--out DIR] [--styles tools/blender/styles.json] \
        [--season jun|sep|dec] [--hour 17] [--tide-ft 6.2] [--preview-textures]

Groups: terrain, sea, earthworks, site, trees and one per building, each a single mesh object SM_<Group> in site
coordinates (every actor goes at the origin), with one material slot per 6E texture set, blend or app colour, named so 6G
can bind it. UV0 = UVMeters / tile (6 m), each island moved by whole tiles toward 0. A straight mass's walls are welded
into one mesh per building (the lantern corner seam). Unreal reads the files as +X east, +Y south, Z up, centimetres.

--textures: 6E's bake folder (materials.json and the maps); by default the first build/3d/unreal/textures holding a
materials.json, in this checkout or the main one. --out: by default a scene/ folder beside it."""
import argparse
import datetime
import json
import pathlib
import subprocess
import sys
import tempfile
import time

import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import BUILD, ROOT  # noqa: E402
from islandale3d import importer, staging, styling  # noqa: E402
from islandale3d.bake.targets import blends as style_blends  # noqa: E402
from islandale3d.unreal import assemble, names, scene_doc  # noqa: E402

import build_scene  # noqa: E402  (tide_ft, FT, SEA_SIZE: the same sea and tide as the renders)

GROUP_ORDER = ("terrain", "sea", "earthworks", "site", "trees")


def _git(*args, cwd=ROOT):
    try:
        return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def find_textures(explicit=None) -> pathlib.Path:
    """6E's bake: --textures, else this checkout's build/3d/unreal/textures, else the main checkout's."""
    if explicit:
        cands = [pathlib.Path(explicit)]
    else:
        cands = [BUILD / "unreal" / "textures"]
        common = _git("rev-parse", "--path-format=absolute", "--git-common-dir")
        if common:
            cands.append(pathlib.Path(common).parent / "build" / "3d" / "unreal" / "textures")
    for c in cands:
        if (c / "materials.json").exists():
            return c.resolve()
    sys.exit(f"no 6E bake (materials.json) in {', '.join(map(str, cands))}; run bake_textures.py or pass --textures")


def group_items(site) -> dict:
    """group -> [Item], buildings named from the manifest."""
    out: dict = {}
    for it in site.items:
        name = None
        if it.kind == "building":
            name = (it.planner or {}).get("name") or it.props.get("objName") or f"Building {it.props.get('oid')}"
        g = names.group_for(it.kind, name)
        if g:
            out.setdefault(g, []).append(it)
    return out


def camera_entries(cams) -> list:
    bpy.context.view_layer.update()              # new cameras' matrix_world
    out = []
    for cam in cams:
        eye = cam.matrix_world.translation
        fwd = cam.matrix_world.to_3x3() @ Vector((0.0, 0.0, -1.0))
        out.append(scene_doc.camera(cam.name, tuple(eye), tuple(eye + fwd * 10.0), cam.data.lens))
    return out


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", required=True)
    ap.add_argument("--manifest")
    ap.add_argument("--textures")
    ap.add_argument("--out")
    ap.add_argument("--styles", default=str(ROOT / "tools" / "blender" / "styles.json"))
    ap.add_argument("--season", default="jun", choices=sorted(staging.DECLINATION))
    ap.add_argument("--hour", type=float, default=17.0)
    ap.add_argument("--tide-ft", type=float)
    ap.add_argument("--preview-textures", action="store_true")
    a = ap.parse_args(argv)
    t0 = time.time()

    textures = find_textures(a.textures)
    mj = json.loads((textures / "materials.json").read_text())
    materials, blends = mj["materials"], mj["blends"]
    styles = json.loads(pathlib.Path(a.styles).read_text())
    if style_blends(styles).keys() != blends.keys():
        sys.exit(f"styles.json's blends {sorted(style_blends(styles))} differ from the bake's {sorted(blends)}: re-bake")
    out = pathlib.Path(a.out) if a.out else textures.parent / "scene"
    out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="islandale-6f-"))

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    site = importer.load(a.glb, a.manifest)
    tris_export = sum(assemble.triangles(it.ob.data) for it in site.items if it.kind != "water")
    wall_base = styling.wainscot_bases(site)                 # before the weld: it measures each wall mesh on its own
    welds = assemble.weld_straight_walls(site)
    tris_in = sum(assemble.triangles(it.ob.data) for it in site.items if it.kind != "water")   # less any sliver the weld closed
    _report, sty = styling.dress(site, a.styles, wall_base=wall_base)
    tide_ft = build_scene.tide_ft(site.manifest, a.tide_ft)
    tide_m = tide_ft * build_scene.FT
    for it in site.items:
        if it.kind == "water":
            it.ob.hide_render = it.ob.hide_viewport = True
    sea_ob = staging.sea(tide_m, build_scene.SEA_SIZE, sty.material(sty.styles["site"]["water"]), site.collections["Water"])
    from islandale3d.uv import apply_uv_meters
    apply_uv_meters(sea_ob)

    az, el = staging.sun_angles(a.season, a.hour)
    cams_coll = importer._collection(bpy.data.collections["Islandale"], "Cameras")
    ground = staging.Ground(site)
    cams = [staging.aerial_camera(site, ground, tide_m, cams_coll)] + staging.building_cameras(site, ground, tide_m, cams_coll)
    stats = assemble.building_ground(site)

    slots = assemble.Slots(sty, blends, wall_base)
    standins = assemble.Standins(textures, materials, blends, a.preview_textures, tmp)
    groups = group_items(site)
    sea_item = importer.Item(ob=sea_ob, root="Water", props={"part": "sea"})
    groups["sea"] = [sea_item]
    restyle_items = [it for items in groups.values() for it in items]
    for it in restyle_items:
        assemble.restyle(it.ob, it, slots, standins)

    order = [g for g in GROUP_ORDER if g in groups] + sorted(g for g in groups if g not in GROUP_ORDER)
    group_docs, log, tris_out = [], {}, 0
    for g in order:
        items = groups[g]
        mesh = names.mesh_name(g)
        ob = assemble.join([it.ob for it in items], mesh)
        tiles = []
        for m in ob.data.materials:
            info = slots.info[m.name]
            set_name = standins._set_for(m.name, info)
            tiles.append(materials[set_name]["tile_m"] if set_name else 6.0)
        uvinfo = assemble.make_uv0(ob.data, tiles)
        tris = assemble.triangles(ob.data)
        if g != "sea":
            tris_out += tris
        lo, hi = assemble.bounds(ob)
        building = None
        if g.startswith("building_"):
            oid = items[0].props.get("oid")
            building = {"oid": oid, "name": (items[0].planner or {}).get("name"), **stats.get(oid, {})}
        path = out / f"{g}.glb"
        size = assemble.export_glb(ob, path)
        group_docs.append(scene_doc.group(g, path.name, mesh, tris, [m.name for m in ob.data.materials], lo, hi, building))
        log[g] = {"file": path.name, "bytes": size, "triangles": tris, "slots": len(ob.data.materials), **uvinfo}
        print(f"UNREAL {path.name}: {tris} triangles, {len(ob.data.materials)} slots, {size / 1e6:.2f} MB, "
              f"max |uv| {uvinfo['max_abs_uv']}")

    exag = site.manifest.get("exag", 1)
    mats_doc = {s: scene_doc.material(s, info, materials, blends, exag) for s, info in slots.info.items()}
    wains = {s: m for s, m in mats_doc.items() if m["kind"] == "wainscot"}
    doc = scene_doc.build(
        generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        git=_git("rev-parse", "--short", "HEAD"),
        source={"glb": str(pathlib.Path(a.glb).resolve()), "scheme": site.manifest.get("scene"),
                "export_commit": site.manifest.get("commit"), "exported_at": site.manifest.get("exportedAt"),
                "styles": str(pathlib.Path(a.styles).resolve())},
        textures={"folder": str(textures), "materials_json": str(textures / "materials.json"), "res": mj.get("res"),
                  "tile_m": mj.get("tile_m"), "git": mj.get("git"), "maps_relative_to": "folder"},
        exag=exag, tide_ft=tide_ft,
        sun_doc=scene_doc.sun(a.season, a.hour, az, el, site.manifest.get("sun")),
        cameras=camera_entries(cams), groups=group_docs, materials_doc=mats_doc,
        blends_doc=scene_doc.blends_section(wains, blends, exag),
        notes=["Place every group's static mesh at the origin with no rotation or scale: the vertices are in site coordinates.",
               "UV0 = UVMeters / tile_m, islands moved by whole tiles; turn on full-precision UVs (the terrain and sea span "
               "many tiles).",
               "The sea is one 6 km quad; its UV0 runs to +-500 tiles, so its water material should use world-aligned UVs.",
               "Walls of a straight mass are welded at the corners, but their normals stay split there (hard edges): "
               "Nanite displacement along split normals can still open a hairline at a corner."])
    problems = scene_doc.validate(doc, materials, blends)
    (out / "scene.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    total = sum(v["bytes"] for v in log.values())
    (out / "export_unreal.log.json").write_text(json.dumps(
        {"groups": log, "welds": welds, "triangles_export": tris_export, "triangles_in": tris_in, "triangles_out_without_sea": tris_out,
         "bytes": total, "seconds": round(time.time() - t0, 1), "problems": problems}, indent=2) + "\n")
    print(f"UNREAL wrote {len(log)} files ({total / 1e6:.1f} MB) and scene.json to {out} in {time.time() - t0:.1f}s; "
          f"triangles {tris_in} in, {tris_out} out (sea apart); welded {welds}")
    if tris_in != tris_out:
        problems.append(f"triangles: {tris_in} in the export, {tris_out} written")
    for p in problems:
        print(f"UNREAL PROBLEM {p}")
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
