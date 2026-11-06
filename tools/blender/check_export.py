"""Import an Islandale export (tools/export/export_scene.mjs) into an empty Blender and check it against its manifest.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/check_export.py -- \
        [--glb build/3d/export/c-prow-lantern.glb] [--manifest <glb>.manifest.json] [--json report.json]

Prints and checks: the import time; where the glTF extras land (object vs mesh-data custom properties); the node hierarchy; that every
planner object sits where the manifest says (x, n, floor x exag, rot); that every exterior wall mesh lies on its mass outline (runs
islandale3d.uv.apply_uv_meters with the manifest outline and counts the wall faces that followed it); that a straight wall's "ei" is the
outline edge carrying most of its face area; and the walls' height range against the mass base and height. Exits 1 when a check fails."""
import argparse
import json
import math
import pathlib
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import BUILD  # noqa: E402
from islandale3d.uv import MATCH_DIST, MATCH_PARALLEL, WALL_NZ, apply_uv_meters, outline_segments  # noqa: E402

POS_TOL = 1e-3          # m: object origin vs manifest
ROT_TOL = 0.01          # degrees
Z_TOL = 0.02            # m: wall bottom/top vs mass base/height
ON_LINE = 0.01          # m: an outer wall face this close to its outline segment lies on it
DEFAULT_GLB = BUILD / "export" / "c-prow-lantern.glb"


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="check_export.py")
    p.add_argument("--glb", type=pathlib.Path, default=DEFAULT_GLB)
    p.add_argument("--manifest", type=pathlib.Path)
    p.add_argument("--json", type=pathlib.Path, help="also write the report here")
    a = p.parse_args(argv)
    a.manifest = a.manifest or a.glb.with_suffix(".manifest.json")
    return a


def props(idb):
    return {k: idb[k] for k in idb.keys() if not k.startswith("_")}


def import_glb(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    t0 = time.time()
    bpy.ops.import_scene.gltf(filepath=str(path))
    return time.time() - t0


def extras_report():
    """Where extras land, on one object node and one wall mesh."""
    out = {"scene": props(bpy.context.scene)}
    for name in ("Terrain", "Earthworks", "Water", "Objects"):
        ob = bpy.data.objects.get(name)
        out[name] = {"type": ob.type if ob else None, "object_props": props(ob) if ob else None,
                     "data_props": props(ob.data) if ob and ob.data else None, "children": len(ob.children) if ob else 0}
    wall = next((o for o in bpy.data.objects if o.type == "MESH" and o.get("part") == "wall"), None)
    if wall:
        out["sample_wall"] = {"object": wall.name, "parent": wall.parent.name if wall.parent else None, "mesh": wall.data.name,
                              "object_props": props(wall), "data_props": props(wall.data),
                              "materials": [m.name for m in wall.data.materials]}
    return out


def check_positions(man, exag):
    rows, bad = [], 0
    for o in man["objects"]:
        ob = bpy.data.objects.get(o["node"])
        if not ob:
            rows.append({"node": o["node"], "missing": True}); bad += 1
            continue
        loc = ob.matrix_world.translation
        want = Vector((o["x"], o["n"], o["floor"] * exag))
        rot = math.degrees(ob.matrix_world.to_euler("XYZ").z)
        drot = (rot - o["rot"] + 180) % 360 - 180
        err = (loc - want).length
        ok = err < POS_TOL and abs(drot) < ROT_TOL
        bad += not ok
        rows.append({"node": o["node"], "err_m": round(err, 6), "drot_deg": round(drot, 4), "ok": ok})
    return rows, bad


def seg_index(segs, c, nh):
    """The index of the outline segment a wall face lies along (same test as uv._match), its distance, or (None, None)."""
    best, best_d = None, MATCH_DIST
    for i, (ax, ay, dx, dy, L, _) in enumerate(segs):
        if abs(nh[0] * dx + nh[1] * dy) > MATCH_PARALLEL:
            continue
        rx, ry = c[0] - ax, c[1] - ay
        t = rx * dx + ry * dy
        if t < -MATCH_DIST or t > L + MATCH_DIST:
            continue
        d = abs(rx * dy - ry * dx)
        if d < best_d:
            best, best_d = i, d
    return best, (best_d if best is not None else None)


def wall_faces(ob):
    """World-space (centre, horizontal unit normal, area) of every wall-like face (|n.z| < WALL_NZ)."""
    mw = ob.matrix_world
    nmat = mw.to_3x3().inverted_safe().transposed()
    scale = abs(mw.to_3x3().determinant()) ** (2 / 3)
    out = []
    for f in ob.data.polygons:
        n = (nmat @ f.normal).normalized()
        if abs(n.z) >= WALL_NZ:
            continue
        out.append((mw @ f.center, Vector((n.x, n.y)).normalized(), f.area * scale))
    return out


def ei_share(hits, faces, ei):
    """Which outline edge carries most of a wall mesh's matched face area, and the share of that area on edge ei.
    (A straight wall's end caps sit on the neighbouring edge's line at a square corner, so they match that edge: a majority test.)"""
    area = {}
    for (i, _), (_, _, a) in zip(hits, faces):
        if i is not None:
            area[i] = area.get(i, 0.0) + a
    if not area:
        return None, 0.0
    total = sum(area.values())
    return max(area, key=area.get), area.get(ei, 0.0) / total


def tag(ob, key):
    """A glTF extra, from the object or, failing that, its mesh data (Blender keeps both)."""
    v = ob.get(key)
    return ob.data.get(key) if v is None and ob.data else v


def check_walls(man):
    rows, total_faces, total_followed, bad = [], 0, 0, 0
    for o in man["objects"]:
        for mass in o.get("masses", []):
            if mass.get("wallEi", "none") == "none" or not mass.get("outline"):
                continue
            segs = outline_segments([mass["outline"]])
            meshes = [ob for ob in bpy.data.objects if ob.type == "MESH" and tag(ob, "oid") == o["oid"]
                      and tag(ob, "part") == "wall" and tag(ob, "mi") == mass["mi"] and not tag(ob, "interior")]
            if not meshes:                                  # a walled mass with no wall mesh is a failure, not a pass
                bad += 1
                rows.append({"object": o["node"], "mi": mass["mi"], "missing_walls": True, "ok": False})
                continue
            for ob in sorted(meshes, key=lambda b: tag(b, "k") or 0):
                faces = wall_faces(ob)
                followed = apply_uv_meters(ob, outlines=[mass["outline"]])
                hits = [seg_index(segs, c, nh) for c, nh, _ in faces]
                on_line = [d for i, d in hits if d is not None and d < ON_LINE]
                ei = tag(ob, "ei")
                ei_ok, share = None, None
                if mass["wallEi"] == "edge" and ei is not None:
                    top, share = ei_share(hits, faces, ei)
                    ei_ok = top == ei
                    share = round(share, 3)
                zs = [(ob.matrix_world @ v.co).z for v in ob.data.vertices]
                z0, z1 = min(zs), max(zs)
                z_ok = abs(z0 - mass["base_z"]) < Z_TOL and abs(z1 - (mass["base_z"] + mass["height_m"])) < Z_TOL
                is_decor = bool(tag(ob, "decor"))
                ok = followed > 0 and (ei_ok is not False) and (z_ok or is_decor)
                bad += not ok
                total_faces += len(faces)
                total_followed += followed
                rows.append({"mesh": ob.name, "ei": ei, "mode": mass["wallEi"], "decor": is_decor, "wall_faces": len(faces),
                             "followed": followed, "outer_on_outline": len(on_line), "ei_matches_outline_edge": ei_ok, "ei_area_share": share,
                             "z": [round(z0, 3), round(z1, 3)], "z_want": [mass["base_z"], round(mass["base_z"] + mass["height_m"], 3)], "ok": ok})
    return rows, total_faces, total_followed, bad


def main():
    a = args()
    man = json.loads(a.manifest.read_text())
    exag = man["exag"]
    secs = import_glb(a.glb)
    objs = list(bpy.data.objects)
    report = {
        "blender": bpy.app.version_string, "glb": str(a.glb), "import_s": round(secs, 2),
        "objects": len(objs), "mesh_objects": sum(o.type == "MESH" for o in objs), "empties": sum(o.type == "EMPTY" for o in objs),
        "materials": len(bpy.data.materials), "extras": extras_report(),
    }
    report["positions"], bad_pos = check_positions(man, exag)
    report["walls"], faces, followed, bad_walls = check_walls(man)
    patches = sum(1 for o in objs if o.type == "MESH" and tag(o, "part") == "earthworks")
    want_patches = (man.get("stats") or {}).get("terrainPatches")
    holes = want_patches is not None and patches != want_patches    # every patch fills a hole in the terrain
    report["terrain_patches"] = {"found": patches, "want": want_patches, "ok": not holes}
    report["summary"] = {"position_failures": bad_pos, "wall_mesh_failures": bad_walls, "wall_faces": faces, "wall_faces_followed": followed,
                         "wall_meshes": len(report["walls"])}
    text = json.dumps(report, indent=1, ensure_ascii=False)
    print(text)
    if a.json:
        a.json.write_text(text)
    sys.exit(1 if bad_pos or bad_walls or holes else 0)


if __name__ == "__main__":
    main()
