"""Check the Unreal export from the files themselves (6F check-in B, without Unreal): re-import every .glb into a clean
Blender scene, measure it against the app's own numbers, and render it from above and from every scene.json camera.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/verify_unreal_export.py -- \
        --scene build/3d/unreal/scene --app-glb build/3d/export/c-prow-lantern.glb --out <folder> [--no-renders]

Writes <out>/verify.json and PNGs; exits 1 if any check fails. The checks:
  files     each .glb is structurally valid (islandale3d/unreal/gltf.py), glTF 2.0 in metres with +Y up: its raw POSITION
            range, read as Blender (x, -z, y), matches scene.json's bounds; Unreal multiplies by 100 (cm)
  materials every material name is a 6E set, a blend or a planner colour, and the same set as the group's scene.json slots
  bounds    each re-imported group matches scene.json to 1 mm; the terrain covers the app's terrain grid
  north     each building's app position (manifest x east, n north) lies inside it; every footprint corner of its masses
            (manifest outlines) has building geometry within 5 cm, at the mass's floor level (base_z) and wall top
  ground    nothing hangs in the air: under the bottom of every support (the app's foundation, post and structure parts)
            there is, within 5 cm, the ground (terrain or earthworks) or other building geometry (a pier, a deck), and
            some supports stand on the ground; the lowest wall vertex is reported against the ground too
  sea       every sea vertex at the tide (scene.json), to 1 mm
  uv0       one 6 m tile per UV unit: on every triangle edge, |dUV| x 6 against its length in metres
  seam      the lantern's walls: at every outline corner the walls on either side share one vertex column"""
import argparse
import json
import math
import pathlib
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import importer  # noqa: E402
from islandale3d.unreal import gltf, names  # noqa: E402

BOUNDS_TOL_M = 0.001
CORNER_TOL_M = 0.05
GROUND_FLOAT_TOL_M = 0.05
TIDE_TOL_M = 0.001
UV_TOL = 0.01                 # |dUV| x tile within 1 % of the edge's length
UV_MIN_EDGE_M = 0.05          # shorter edges are skipped (float noise)
SEAM_TOL_MM = 0.5
SUPPORT_PARTS = ("foundation", "post", "structure")
RAY_TOP = 500.0


def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for d in list(coll):
            coll.remove(d)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), merge_vertices=False)
    return [o for o in bpy.data.objects if o not in before and o.type == "MESH"]


def world_points(ob):
    mw = ob.matrix_world
    return [mw @ v.co for v in ob.data.vertices]


def bbox(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return lo, hi


def check_files(scene, scene_dir, materials, blends):
    rows = []
    for g in scene["groups"]:
        r = gltf.validate((scene_dir / g["file"]).read_bytes())
        st = r["stats"]
        gl_lo, gl_hi = st["pos_min"], st["pos_max"]
        bl_lo = [gl_lo[0], -gl_hi[2], gl_lo[1]]          # glTF (x, y up, z = -north) read as Blender (x, -z, y)
        bl_hi = [gl_hi[0], -gl_lo[2], gl_hi[1]]
        err = max(abs(a - b) for a, b in zip(bl_lo + bl_hi, g["bounds_m"]["min"] + g["bounds_m"]["max"]))
        kinds, bad = {}, []
        for m in st["materials"]:
            try:
                kinds[m] = names.slot_kind(m, materials, blends)
            except KeyError:
                bad.append(m)
        row = {"group": g["group"], "problems": r["problems"], "triangles": st["triangles"],
               "triangles_scene_json": g["triangles"], "attributes": st["attributes"],
               "up_axis": "+Y (glTF); elevations %.2f..%.2f m" % (gl_lo[1], gl_hi[1]),
               "north_axis": "-Z (glTF); north edge at glTF z = %.2f" % gl_lo[2],
               "raw_bounds_vs_scene_json_m": round(err, 6), "materials": kinds, "unknown_materials": bad,
               "materials_match_slots": sorted(st["materials"]) == sorted(g["slots"]),
               "uv0_range": [st["uv_min"], st["uv_max"]]}
        row["ok"] = (not r["problems"] and err <= BOUNDS_TOL_M and not bad and row["materials_match_slots"]
                     and st["triangles"] == g["triangles"] and "TEXCOORD_1" not in st["attributes"])
        rows.append(row)
    return rows


def check_bounds(scene, obs, manifest):
    rows = []
    for g in scene["groups"]:
        lo, hi = bbox(world_points(obs[g["group"]]))
        err = max(abs(a - b) for a, b in zip(lo + hi, g["bounds_m"]["min"] + g["bounds_m"]["max"]))
        rows.append({"group": g["group"], "min_m": [round(v, 4) for v in lo], "max_m": [round(v, 4) for v in hi],
                     "error_m": round(err, 6), "ok": err <= BOUNDS_TOL_M})
    grid = manifest["site"]["grid"]
    gx = (grid["x0"], grid["x0"] + (grid["nx"] - 1) * grid["spacing"])
    gn = (grid["n0"], grid["n0"] + (grid["ny"] - 1) * grid["spacing"])
    lo, hi = bbox(world_points(obs["terrain"]))
    terrain = {"terrain_x_m": [round(lo[0], 3), round(hi[0], 3)], "terrain_y_m": [round(lo[1], 3), round(hi[1], 3)],
               "app_grid_x_m": list(gx), "app_grid_n_m": list(gn)}
    terrain["ok"] = (abs(lo[0] - gx[0]) <= grid["spacing"] and abs(hi[0] - gx[1]) <= grid["spacing"]
                     and abs(lo[1] - gn[0]) <= grid["spacing"] and abs(hi[1] - gn[1]) <= grid["spacing"])
    return rows, terrain


def _near(points, x, y, z, tol):
    return any(abs(px - x) <= tol and abs(py - y) <= tol and abs(pz - z) <= tol for px, py, pz in points)


def check_north(scene, obs, manifest):
    by_oid = {o["oid"]: o for o in manifest["objects"]}
    rows = []
    for g in scene["groups"]:
        b = g.get("building")
        if not b:
            continue
        o = by_oid[b["oid"]]
        pts = [tuple(p) for p in world_points(obs[g["group"]])]
        lo, hi = bbox(pts)
        inside = lo[0] <= o["x"] <= hi[0] and lo[1] <= o["n"] <= hi[1]
        walled = [m for m in o.get("masses", []) if m.get("outline") and m.get("wallEi") not in (None, "none")]
        corners = found_floor = found_top = 0
        for m in walled:
            for x, y in m["outline"]:
                corners += 1
                found_floor += _near(pts, x, y, m["base_z"], CORNER_TOL_M)
                found_top += _near(pts, x, y, m["base_z"] + m["height_m"], CORNER_TOL_M)
        rows.append({"group": g["group"], "app_position_m": [o["x"], o["n"]], "inside": inside,
                     "footprint_corners": corners, "corners_at_floor_level": found_floor, "corners_at_wall_top": found_top,
                     "floor_levels_m": [round(m["base_z"], 4) for m in walled],
                     "ok": inside and corners > 0 and found_floor == corners and found_top == corners})
    return rows


class Ground:
    """Straight-down rays onto the re-imported terrain and earthworks; the higher hit wins."""

    def __init__(self, obs):
        dg = bpy.context.evaluated_depsgraph_get()
        self.trees = [BVHTree.FromObject(ob, dg) for ob in obs]

    def z(self, x, y):
        best = None
        for t in self.trees:
            hit = t.ray_cast(Vector((x, y, RAY_TOP)), Vector((0, 0, -1)))
            if hit[0] is not None and (best is None or hit[0].z > best):
                best = hit[0].z
        return best


def app_supports(app_glb, manifest_path):
    """oid -> {"supports": [(part, lowest (x, y, z))], "walls_lowest": (x, y, z)} from the app's own export, whose meshes
    carry their part tags (the Unreal files join them)."""
    clean()
    site = importer.load(app_glb, manifest_path)
    out = {}
    for oid, items in site.buildings().items():
        sup, wall_low = [], None
        for it in items:
            pts = world_points(it.ob)
            if not pts:
                continue
            low = min(pts, key=lambda p: p.z)
            if it.part in SUPPORT_PARTS:
                lo, hi = bbox(pts)
                sup.append((it.part, tuple(low), lo, hi))
            if it.part == "wall" and not it.props.get("interior") and (wall_low is None or low.z < wall_low[2]):
                wall_low = tuple(low)
        out[oid] = {"supports": sup, "walls_lowest": wall_low}
    clean()
    return out


def check_ground(scene, obs, supports):
    """Nothing hangs in the air: below the bottom centre of every support part, within 5 cm, there is the ground (terrain or
    earthworks) or other building geometry (a pier under a post, a deck under a porch column), read from the Unreal file."""
    ground = Ground([obs["terrain"], obs["earthworks"]])
    dg = bpy.context.evaluated_depsgraph_get()
    rows = []
    for g in scene["groups"]:
        b = g.get("building")
        if not b:
            continue
        ob = obs[g["group"]]
        structure = [BVHTree.FromObject(ob, dg), BVHTree.FromObject(obs["site"], dg)]
        bpts = [tuple(p) for p in world_points(ob)]
        s = supports.get(b["oid"], {"supports": [], "walls_lowest": None})
        on_ground, on_structure, floating, missing, gaps = 0, 0, [], 0, []
        for part, (x, y, z), lo, hi in s["supports"]:
            if not _near(bpts, x, y, z, 0.002):
                missing += 1                     # the Unreal file must hold the app's support vertex
            cx, cy, bz = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]
            gz = ground.z(cx, cy)
            gap = None if gz is None else bz - gz
            if gap is not None:
                gaps.append(gap)
            if gap is not None and gap <= GROUND_FLOAT_TOL_M:
                on_ground += 1
                continue
            # a pier or deck under the post shows just outside its footprint, at its base: probe 2 cm out on each side,
            # from 1 cm above the base down to 5 cm below it (inside the footprint the post's own bottom face is in the way)
            probes = [(lo[0] - 0.02, cy), (hi[0] + 0.02, cy), (cx, lo[1] - 0.02), (cx, hi[1] + 0.02)]
            if any(t.ray_cast(Vector((px, py, bz + 0.01)), Vector((0, 0, -1)), 0.01 + GROUND_FLOAT_TOL_M)[0] is not None
                   for px, py in probes for t in structure):
                on_structure += 1
            else:
                floating.append({"part": part, "bottom_m": [round(cx, 3), round(cy, 3), round(bz, 3)],
                                 "above_ground_m": None if gap is None else round(gap, 3)})
        row = {"group": g["group"], "supports": len(s["supports"]),
               "support_vertices_in_unreal_file": len(s["supports"]) - missing,
               "on_ground": on_ground, "on_other_structure": on_structure, "floating": floating,
               "deepest_support_below_ground_m": round(min(gaps), 4) if gaps else None}
        if s["walls_lowest"]:
            wx, wy, wz = s["walls_lowest"]
            wgz = ground.z(wx, wy)
            row.update({"lowest_wall_z_m": round(wz, 4), "ground_under_lowest_wall_m": None if wgz is None else round(wgz, 4),
                        "lowest_wall_above_ground_m": None if wgz is None else round(wz - wgz, 4)})
        row["ok"] = bool(s["supports"]) and on_ground > 0 and not floating and missing == 0
        rows.append(row)
    return rows


def check_sea(scene, obs):
    want = scene["tide"]["m_navd88"]
    pts = world_points(obs["sea"])
    lo, hi = bbox(pts)
    return {"tide_m": want, "sea_z_m": [round(lo[2], 5), round(hi[2], 5)],
            "extent_m": [round(hi[0] - lo[0], 1), round(hi[1] - lo[1], 1)],
            "ok": all(abs(p.z - want) <= TIDE_TOL_M for p in pts)}


def check_uv0(scene, obs, tile=6.0):
    rows = []
    for g in scene["groups"]:
        me = obs[g["group"]].data
        uv = me.uv_layers[0].data
        ratios = []
        for poly in me.polygons:
            loops = list(poly.loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                pa, pb = me.vertices[me.loops[a].vertex_index].co, me.vertices[me.loops[b].vertex_index].co
                d = (pb - pa).length
                if d >= UV_MIN_EDGE_M:
                    ratios.append((uv[b].uv - uv[a].uv).length * tile / d)
        ratios.sort()
        n = len(ratios)
        within = sum(1 for r in ratios if abs(r - 1) <= UV_TOL)
        rows.append({"group": g["group"], "uv_maps": [lay.name for lay in me.uv_layers], "edges": n,
                     "median_metres_per_tile_ratio": round(ratios[n // 2], 5) if n else None,
                     "p05": round(ratios[n // 20], 4) if n else None, "p95": round(ratios[-1 - n // 20], 4) if n else None,
                     "share_within_1pct": round(within / n, 4) if n else None})
    return rows


def check_seam(scene, obs, manifest):
    """At each corner of the lantern's octagon, the wall vertices form one column: no two sit apart horizontally."""
    lantern = next(g for g in scene["groups"] if "lantern" in g["group"])
    o = next(o for o in manifest["objects"] if o["oid"] == lantern["building"]["oid"])
    mass = next(m for m in o["masses"] if m.get("wallEi") == "edge")
    wall_slot = "ledgestone_warm"
    me = obs[lantern["group"]].data
    idx = lantern["slot_index"][wall_slot]
    verts = {v for p in me.polygons if p.material_index == idx for v in p.vertices}
    pts = [me.vertices[v].co for v in verts]
    z0, z1 = mass["base_z"] - 0.01, mass["base_z"] + mass["height_m"] + 0.01
    rows = []
    for x, y in mass["outline"]:
        col = [p for p in pts if math.hypot(p.x - x, p.y - y) < 0.02 and z0 <= p.z <= z1]
        spread = max((math.hypot(a.x - b.x, a.y - b.y) for a in col for b in col), default=None)
        rows.append({"corner_m": [x, y], "wall_vertices_at_corner": len(col),
                     "max_spread_mm": None if spread is None else round(spread * 1000, 3)})
    ok = all(r["wall_vertices_at_corner"] > 0 and r["max_spread_mm"] is not None and r["max_spread_mm"] <= SEAM_TOL_MM
             for r in rows)
    return {"walls_slot": wall_slot, "corners": rows, "ok": ok}


def _sun_and_sky(scene):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.45, 0.62, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.6
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.5
    toward = Vector(scene["sun"]["toward_sun_blender"])
    sun.rotation_euler = (-toward).to_track_quat("-Z", "Y").to_euler()


def _render(cam, path, res):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return str(path)


def render_views(scene, out_dir, res=(1280, 720)):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    _sun_and_sky(scene)
    bs = [g["bounds_m"] for g in scene["groups"] if g.get("building")]
    lo = [min(b["min"][i] for b in bs) for i in range(3)]
    hi = [max(b["max"][i] for b in bs) for i in range(3)]
    top = bpy.data.objects.new("top", bpy.data.cameras.new("top"))
    sc.collection.objects.link(top)
    top.data.type, top.data.ortho_scale, top.data.clip_end = "ORTHO", max(hi[0] - lo[0], hi[1] - lo[1]) * 2.2, 2000
    top.location, top.rotation_euler = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 400), (0, 0, 0)   # straight down, north up
    files = [_render(top, out_dir / "blender_top_down_north_up.png", (1200, 1200))]
    for c in scene["cameras"]:
        cam = bpy.data.objects.new(c["name"], bpy.data.cameras.new(c["name"]))
        sc.collection.objects.link(cam)
        eye, aim = Vector(c["eye_m"]), Vector(c["aim_point_m"])
        cam.location = eye
        cam.rotation_euler = (aim - eye).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens, cam.data.sensor_width, cam.data.clip_end = c["focal_length_mm"], c["filmback_mm"][0], 5000
        files.append(_render(cam, out_dir / f"blender_cam_{names.slug(c['name'])}.png", res))
    return files


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True)
    ap.add_argument("--app-glb", required=True, help="the app's own export, whose meshes keep their part tags")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-renders", action="store_true")
    a = ap.parse_args(argv)
    scene_dir, out_dir = pathlib.Path(a.scene).resolve(), pathlib.Path(a.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = json.loads((scene_dir / "scene.json").read_text())
    mj = json.loads((scene_dir / scene["textures"]["materials_json"]).read_text())
    manifest_path = scene_dir / scene["source"]["manifest"]
    manifest = json.loads(manifest_path.read_text())
    report = {"units": "metres in every .glb (glTF 2.0); Unreal's Interchange multiplies by 100 into centimetres "
                       "(InterchangeGltfPrivate.h, GltfUnitConversionMultiplier = 100)",
              "unreal_axes": scene["frames"]["unreal"]}
    report["files"] = check_files(scene, scene_dir, mj["materials"], mj["blends"])
    supports = app_supports(a.app_glb, str(manifest_path))
    clean()
    obs = {}
    for g in scene["groups"]:
        got = import_glb(scene_dir / g["file"])
        if len(got) != 1:
            raise RuntimeError(f"{g['file']}: expected one mesh object, got {[o.name for o in got]}")
        obs[g["group"]] = got[0]
    bpy.context.view_layer.update()
    report["bounds"], report["terrain"] = check_bounds(scene, obs, manifest)
    report["north"] = check_north(scene, obs, manifest)
    report["ground"] = check_ground(scene, obs, supports)
    report["sea"] = check_sea(scene, obs)
    report["uv0"] = check_uv0(scene, obs)
    report["seam"] = check_seam(scene, obs, manifest)
    if not a.no_renders:
        report["renders"] = render_views(scene, out_dir)
    report["ok"] = (all(r["ok"] for r in report["files"]) and all(r["ok"] for r in report["bounds"])
                    and report["terrain"]["ok"] and all(r["ok"] for r in report["north"])
                    and all(r["ok"] for r in report["ground"]) and report["sea"]["ok"] and report["seam"]["ok"])
    (out_dir / "verify.json").write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(f"VERIFY ok={report['ok']} -> {out_dir / 'verify.json'}")
    if not report["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
