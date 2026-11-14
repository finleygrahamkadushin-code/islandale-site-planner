"""Check-in B for 6F: open the Unreal export in UE 5.8.4 and check north, ground contact and the tide; take screenshots.
Runs inside Unreal, in a throwaway project (never the real level 6G builds):

    UnrealEditor <Project>.uproject -unattended -nosplash \
        -ExecutePythonScript="tools/unreal/check_6f.py --scene <build/3d/unreal/scene> --out <folder> --quit"

(The full editor, not the -run=pythonscript commandlet: a commandlet has no level editor to place actors in, and doesn't
tick, so shaders never finish compiling. The script imports and checks at once, then waits on the editor's ticks.)

It imports every group's .glb with Interchange into /Game/Islandale6F, places each at the origin (the vertices are in site
coordinates), adds a sun, sky and fog from scene.json, saves the level, then checks:
  - each static mesh's bounds against scene.json (the files came through whole and unmoved);
  - north: each building's position in the app's manifest (x east, n north, metres) lands inside its mesh at (100x, -100n);
  - ground: straight down through each building's origin, the ground (terrain or the earthworks pads) is hit, and the
    building's lowest point is not above it (nor more than 4 m below: foundations go below grade);
  - the sea's Z equals the tide in centimetres.
Then it captures a top-down view (north up) and the view from every scene.json camera with a SceneCapture2D into PNGs.
Every Unreal call here was checked against the installed engine (tools/unreal/dump_api.py)."""
import argparse
import json
import pathlib
import sys
import time

import unreal

ROOT = "/Game/Islandale6F"
MESHES = f"{ROOT}/Meshes"
LEVEL = f"{ROOT}/Check6F_" + time.strftime("%Y%m%d_%H%M%S")   # a fresh level each run (throwaway project)
BOUNDS_TOL_CM = 2.0
GROUND_FLOAT_TOL_CM = 5.0        # a building's lowest point may sit at most this far above the terrain under it
GROUND_SINK_TOL_CM = 400.0       # ... and no deeper than this below it (foundations go below grade)
TIDE_TOL_CM = 0.5
SHOT_W, SHOT_H = 1920, 1080
TOP_W = 1600
CAPTURE_PASSES = 8               # repeated captures let Lumen and streaming settle
EXPOSURE_BIAS = 0.0              # manual exposure (a capture has no eye-adaptation history); sun 10 lux


def log(msg):
    unreal.log(f"CHECK6F {msg}")


def sub(cls):
    return unreal.get_editor_subsystem(cls)


def import_group(glb: pathlib.Path, dest: str):
    """One .glb into dest with the project's default Interchange pipelines (Nanite on, static meshes)."""
    mgr = unreal.InterchangeManager.get_interchange_manager_scripted()
    source = unreal.InterchangeManager.create_source_data(str(glb))
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    params.replace_existing = True
    return mgr.import_asset(dest, source, params)         # Array[Object] or None


def vec(v):
    return unreal.Vector(float(v[0]), float(v[1]), float(v[2]))


def rot(r):
    return unreal.Rotator(roll=float(r.get("roll", 0.0)), pitch=float(r["pitch"]), yaw=float(r["yaw"]))


def build_level(scene, meshes_by_group):
    les = sub(unreal.LevelEditorSubsystem)
    if not les.new_level(LEVEL):
        raise RuntimeError(f"could not create the level {LEVEL}")
    actors = sub(unreal.EditorActorSubsystem)
    placed = {}
    for g, mesh_path in meshes_by_group.items():
        mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
        a = actors.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
        a.set_actor_label(g)
        placed[g] = a
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 5000),
                                        rot(scene["sun"]["directional_light_rotation"]))
    sun.set_actor_label("Sun")
    sun.light_component.set_editor_property("atmosphere_sun_light", True)
    sun.light_component.set_editor_property("intensity", 10.0)
    actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 1000), unreal.Rotator(0, 0, 0))
    sky.light_component.set_editor_property("real_time_capture", True)
    actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    for c in scene["cameras"]:
        cam = actors.spawn_actor_from_class(unreal.CineCameraActor, vec(c["eye_cm"]), rot(c["rotation"]))
        cam.set_actor_label(f"CAM {c['name']}")
        comp = cam.get_cine_camera_component()
        fb = comp.filmback
        fb.sensor_width, fb.sensor_height = c["filmback_mm"]
        comp.set_editor_property("filmback", fb)
        comp.set_editor_property("current_focal_length", c["focal_length_mm"])
    les.save_current_level()
    return placed


def check_bounds(scene, meshes_by_group):
    rows = []
    for g in scene["groups"]:
        mesh = unreal.EditorAssetLibrary.load_asset(meshes_by_group[g["group"]])
        box = mesh.get_bounding_box()
        got_min, got_max = [box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z]
        err = max(abs(a - b) for a, b in zip(got_min + got_max, g["bounds_cm"]["min"] + g["bounds_cm"]["max"]))
        rows.append({"group": g["group"], "min_cm": [round(v, 2) for v in got_min], "max_cm": [round(v, 2) for v in got_max],
                     "triangles_nanite_fallback": mesh.get_num_triangles(0), "triangles_scene": g["triangles"],
                     "max_error_cm": round(err, 3), "ok": err <= BOUNDS_TOL_CM})
    return rows


def trace_down(world, x, y, ignore):
    hit = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(x, y, 100000.0), unreal.Vector(x, y, -100000.0),
                                                unreal.TraceTypeQuery.ECC_VISIBILITY, True, ignore,
                                                unreal.DrawDebugTrace.NONE, True)
    if hit is None:                      # line_trace_single returns None when nothing blocks
        return None
    points = [v for v in hit.to_tuple() if isinstance(v, unreal.Vector)]   # Location, ImpactPoint, ... (FHitResult order)
    return points[0].z if points else None


def check_north_and_ground(scene, manifest, placed):
    world = sub(unreal.UnrealEditorSubsystem).get_editor_world()
    by_oid = {o.get("oid"): o for o in manifest.get("objects", [])}
    rows = []
    ground_groups = ("terrain", "earthworks")       # the cut pads under the cabins are earthworks, not terrain
    ignore_all_but_ground = [a for g, a in placed.items() if g not in ground_groups]
    for g in scene["groups"]:
        b = g.get("building")
        if not b:
            continue
        o = by_oid[b["oid"]]
        x_cm, y_cm = o["x"] * 100.0, -o["n"] * 100.0
        lo, hi = g["bounds_cm"]["min"], g["bounds_cm"]["max"]
        inside = lo[0] <= x_cm <= hi[0] and lo[1] <= y_cm <= hi[1]
        ground = trace_down(world, x_cm, y_cm, ignore_all_but_ground)
        origin, extent = placed[g["group"]].get_actor_bounds(False)
        lowest = origin.z - extent.z
        row = {"group": g["group"], "app_xy_m": [o["x"], o["n"]], "ue_xy_cm": [x_cm, y_cm], "inside_mesh": inside,
               "ground_z_cm": None if ground is None else round(ground, 2), "lowest_z_cm": round(lowest, 2)}
        row["on_ground"] = ground is not None and (ground - GROUND_SINK_TOL_CM) <= lowest <= ground + GROUND_FLOAT_TOL_CM
        row["ok"] = inside and row["on_ground"]
        rows.append(row)
    return rows


def check_sea(scene, placed):
    origin, extent = placed["sea"].get_actor_bounds(False)
    z0, z1 = origin.z - extent.z, origin.z + extent.z
    want = scene["tide"]["ue_z_cm"]
    return {"sea_z_cm": [round(z0, 3), round(z1, 3)], "tide_cm": want,
            "ok": abs(z0 - want) <= TIDE_TOL_CM and abs(z1 - want) <= TIDE_TOL_CM}


def capture(world, out_dir: pathlib.Path, name, loc, rotation, fov=None, ortho_width=None, size=None, passes=CAPTURE_PASSES):
    """Render one view with a SceneCapture2D (final LDR colour, manual exposure) and write it as PNG."""
    out_dir.mkdir(parents=True, exist_ok=True)
    w, h = size or ((TOP_W, TOP_W) if ortho_width is not None else (SHOT_W, SHOT_H))
    rt = unreal.RenderingLibrary.create_render_target2d(world, w, h, unreal.TextureRenderTargetFormat.RTF_RGBA8)
    actors = sub(unreal.EditorActorSubsystem)
    cap = actors.spawn_actor_from_class(unreal.SceneCapture2D, loc, rotation)
    comp = cap.capture_component2d
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("texture_target", rt)
    comp.set_editor_property("capture_source", unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR)
    comp.set_editor_property("always_persist_rendering_state", True)
    pp = comp.get_editor_property("post_process_settings")
    pp.set_editor_property("override_auto_exposure_method", True)
    pp.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
    pp.set_editor_property("override_auto_exposure_apply_physical_camera_exposure", True)
    pp.set_editor_property("auto_exposure_apply_physical_camera_exposure", False)
    pp.set_editor_property("override_auto_exposure_bias", True)
    pp.set_editor_property("auto_exposure_bias", EXPOSURE_BIAS)
    comp.set_editor_property("post_process_settings", pp)
    comp.set_editor_property("post_process_blend_weight", 1.0)
    if ortho_width is not None:
        comp.set_editor_property("projection_type", unreal.CameraProjectionMode.ORTHOGRAPHIC)
        comp.set_editor_property("ortho_width", ortho_width)
    else:
        comp.set_editor_property("fov_angle", fov)
    for _ in range(passes):
        comp.capture_scene()
    unreal.RenderingLibrary.export_render_target(world, rt, str(out_dir), name)
    actors.destroy_actor(cap)
    return str(out_dir / name)


def shots(scene, out_dir):
    world = sub(unreal.UnrealEditorSubsystem).get_editor_world()
    lo = [min(g["bounds_cm"]["min"][i] for g in scene["groups"] if g["group"].startswith("building_")) for i in range(3)]
    hi = [max(g["bounds_cm"]["max"][i] for g in scene["groups"] if g["group"].startswith("building_")) for i in range(3)]
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    width = max(hi[0] - lo[0], hi[1] - lo[1]) * 2.2
    files = [capture(world, out_dir, "top_down_north_up.png", unreal.Vector(cx, cy, 20000.0),
                     unreal.Rotator(roll=0.0, pitch=-90.0, yaw=-90.0), ortho_width=width)]
    for c in scene["cameras"]:
        files.append(capture(world, out_dir, "cam_" + c["name"].lower().replace(" ", "_").replace("’", "") + ".png",
                             vec(c["eye_cm"]), rot(c["rotation"]), fov=c["horizontal_fov_deg"]))
    return files


PROBE_EVERY_S = 6.0               # editor mode: a small probe capture this often until the picture stops changing
PROBE_MIN_S, PROBE_MAX_S = 60.0, 1200.0
PROBE_STABLE = 3                 # this many probes in a row within PROBE_TOL of each other's file size
PROBE_TOL = 0.01


class Shooter:
    """Editor mode: shaders compile asynchronously while the editor ticks, so take a small probe capture every few seconds
    and shoot once the probe stops changing (no Python API reports the shader queue in 5.8.4)."""

    def __init__(self, scene, out_dir, report, quit_after):
        self.scene, self.out_dir, self.report, self.quit_after = scene, out_dir, report, quit_after
        self.t0 = time.time()
        self.last_probe = 0.0
        self.sizes = []
        unreal.EditorPythonScripting.set_keep_python_script_alive(True)   # else -ExecutePythonScript quits on return
        self.handle = unreal.register_slate_post_tick_callback(self.tick)

    def probe(self):
        world = sub(unreal.UnrealEditorSubsystem).get_editor_world()
        c = self.scene["cameras"][0]
        name = f"probe_{len(self.sizes):03d}.png"
        capture(world, self.out_dir / "probes", name, vec(c["eye_cm"]), rot(c["rotation"]), fov=c["horizontal_fov_deg"],
                size=(480, 270), passes=1)
        f = self.out_dir / "probes" / name
        self.sizes.append(f.stat().st_size if f.exists() else 0)

    def settled(self):
        last = self.sizes[-PROBE_STABLE:]
        return len(last) == PROBE_STABLE and min(last) > 0 and (max(last) - min(last)) <= PROBE_TOL * max(last)

    def tick(self, _dt):
        now = time.time() - self.t0
        if now - self.last_probe < PROBE_EVERY_S:
            return
        self.last_probe = now
        try:
            self.probe()
            ready = now >= PROBE_MIN_S and self.settled()
            if not ready and now < PROBE_MAX_S:
                return
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.report["shaders_settled"] = ready
            self.report["probe_sizes"] = self.sizes
            self.report["shots"] = shots(self.scene, self.out_dir)
        except Exception as e:  # noqa: BLE001 - report it and quit rather than hang the editor
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.report["shots_error"] = repr(e)
        finish(self.report, self.out_dir)
        unreal.EditorPythonScripting.set_keep_python_script_alive(False)
        if self.quit_after:
            unreal.SystemLibrary.quit_editor()


def finish(report, out_dir):
    report["ok"] = (all(r["ok"] for r in report["bounds"]) and all(r["ok"] for r in report["north_and_ground"])
                    and report["sea"]["ok"])
    report["seconds"] = round(time.time() - report["_t0"], 1)
    (out_dir / "check.json").write_text(json.dumps({k: v for k, v in report.items() if k != "_t0"}, indent=2))
    log(f"done ok={report['ok']} in {report['seconds']}s -> {out_dir / 'check.json'}")


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-import", action="store_true")
    ap.add_argument("--no-shots", action="store_true")
    ap.add_argument("--quit", action="store_true", help="editor mode: quit the editor when done")
    a = ap.parse_args(argv)
    scene_dir, out_dir = pathlib.Path(a.scene), pathlib.Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = json.loads((scene_dir / "scene.json").read_text())
    manifest = json.loads((scene_dir / scene["source"]["manifest"]).read_text())   # paths in scene.json are relative to it
    report = {"_t0": time.time(), "engine": unreal.SystemLibrary.get_engine_version(), "imports": {}}
    meshes_by_group = {}
    for g in scene["groups"]:
        dest = f"{MESHES}/{g['group']}"
        if not a.skip_import:
            imported = import_group(scene_dir / g["file"], dest)
            report["imports"][g["group"]] = {"objects": len(imported or [])}
        meshes = [p for p in unreal.EditorAssetLibrary.list_assets(dest, recursive=True, include_folder=False)
                  if isinstance(unreal.EditorAssetLibrary.load_asset(p), unreal.StaticMesh)]
        if len(meshes) != 1:
            raise RuntimeError(f"{g['group']}: expected one static mesh in {dest}, found {meshes}")
        meshes_by_group[g["group"]] = meshes[0].split(".")[0]
        log(f"imported {g['group']} -> {meshes_by_group[g['group']]}")
    placed = build_level(scene, meshes_by_group)
    report["bounds"] = check_bounds(scene, meshes_by_group)
    report["north_and_ground"] = check_north_and_ground(scene, manifest, placed)
    report["sea"] = check_sea(scene, placed)
    if a.no_shots:
        finish(report, out_dir)
        return
    Shooter(scene, out_dir, report, a.quit)


main(sys.argv[1:])
