"""Build the Islandale scene in Blender from a planner export, dressed with the exterior materials in styles.json.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/build_scene.py -- \
        --glb build/3d/export/<slug>.glb [--styles tools/blender/styles.json] [--out build/3d/islandale.blend] \
        [--season jun|sep|dec] [--hour 17] [--tide-ft 6.2] [--true-displacement] [--allow-missing] \
        [--render [--only <camera name part>] [--res 1920x1080] [--samples 128]]

Writes the .blend (cameras: an aerial over the bay, and a hero and a wall close-up per building) and, with --render, a PNG per
camera in build/3d/renders/. The sun follows the planner's model for 48.46 deg N; the sea sits at the planner's tide.
--allow-missing lets a material that styles.json names but no module defines yet wear the UV grid instead of failing."""
import argparse
import pathlib
import re
import sys
import time

import bpy

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import BUILD, ROOT  # noqa: E402
from islandale3d import importer, staging, styling  # noqa: E402

FT = 0.3048
DEFAULT_TIDE_FT = 6.2         # the planner's tide slider default (NAVD88)
SEA_SIZE = 6000.0             # m across


def tide_ft(manifest, override):
    if override is not None:
        return override
    for path in (("tide_ft",), ("site", "tide_ft"), ("view", "tide_ft"), ("sun", "tide_ft")):
        v = manifest
        for k in path:
            v = v.get(k) if isinstance(v, dict) else None
        if isinstance(v, (int, float)):
            return float(v)
    return DEFAULT_TIDE_FT


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", required=True)
    ap.add_argument("--manifest")
    ap.add_argument("--styles", default=str(ROOT / "tools" / "blender" / "styles.json"))
    ap.add_argument("--out", default=str(BUILD / "islandale.blend"))
    ap.add_argument("--season", default="jun", choices=sorted(staging.DECLINATION))
    ap.add_argument("--hour", type=float, default=17.0)
    ap.add_argument("--tide-ft", type=float)
    ap.add_argument("--true-displacement", action="store_true")
    ap.add_argument("--allow-missing", action="store_true")
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--samples", type=int, default=128)
    a = ap.parse_args(argv)
    t0 = time.time()

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    site = importer.load(a.glb, a.manifest)
    report, sty = styling.dress(site, a.styles, a.allow_missing)
    tide = tide_ft(site.manifest, a.tide_ft) * FT
    for it in site.items:                    # the export's clipped water gives way to a sea that reaches the horizon
        if it.kind == "water":
            it.ob.hide_render = it.ob.hide_viewport = True
    staging.sea(tide, SEA_SIZE, sty.material(sty.styles["site"]["water"]), site.collections["Water"])
    displaced = styling.true_displacement(site) if a.true_displacement else 0

    az, el = staging.sun_angles(a.season, a.hour)
    staging.sky_and_sun(az, el)
    cams_coll = importer._collection(bpy.data.collections["Islandale"], "Cameras")
    ground = staging.Ground(site)
    cams = [staging.aerial_camera(site, ground, tide, cams_coll)] + staging.building_cameras(site, ground, tide, cams_coll)
    bpy.context.scene.camera = cams[0]
    staging.render_settings(tuple(int(x) for x in a.res.split("x")), a.samples)

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    print(f"BUILD {out} in {time.time() - t0:.1f}s: {len(site.items)} meshes, sun az {az:.0f} el {el:.0f}, tide {tide:.2f} m, "
          f"{displaced} meshes displaced")
    for name, n in sorted(report.items()):
        print(f"BUILD material {name}: {n} meshes")
    for cam in cams:
        print(f"BUILD camera {cam.name}")

    if a.render:
        renders = BUILD / "renders"
        renders.mkdir(parents=True, exist_ok=True)
        failed = []
        for cam in cams:
            if a.only.lower() not in cam.name.lower():
                continue
            bpy.context.scene.camera = cam
            path = renders / (re.sub(r"[^\w.-]+", "_", cam.name.removeprefix("CAM ")).lower() + ".png")
            bpy.context.scene.render.filepath = str(path)
            t1 = time.time()
            try:
                bpy.ops.render.render(write_still=True)
            except RuntimeError as e:            # e.g. GPU out of memory on one close-up: report it, render the rest
                failed.append(cam.name)
                print(f"RENDER FAILED {cam.name}: {e}")
                continue
            print(f"RENDER {cam.name} -> {path} ({time.time() - t1:.1f}s)")
        if failed:
            sys.exit(f"{len(failed)} camera(s) failed to render: {', '.join(failed)}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
