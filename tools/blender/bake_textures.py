"""Bake every material the scene wears into seamless Unreal texture sets (Phase 6E; the plan is PLAN-6E.md).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/bake_textures.py -- \
        [--keys stucco__abc123,kurinuki] [--all] [--res 4096] [--samples 64] [--height-samples 256] \
        [--out build/3d/unreal/textures] [--no-shift-check] [--contact-only] [--previews-only] [--checks-only]

One 6 m tile per set: T_<name>_BC (sRGB), _ORM, _H (16-bit), _N (16-bit, DirectX), in <out>/<name>/, plus materials.json
and contact.html (the check-in sheet) in <out>. The sets are everything styles.json can reach (--all adds the library's
unused materials). --keys rebakes only those and keeps the others in materials.json. Exits 1 if any set fails a seam check,
2 if none fails but some are unchecked (--no-shift-check) or not baked yet.
The first Cycles render in a new process can take a few minutes while Metal kernels compile."""
import argparse
import json
import pathlib
import sys
import time

import bpy

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from islandale3d import BUILD, ROOT  # noqa: E402
from islandale3d.bake import bake_set, contact, manifest, rewrite_previews, verify_set  # noqa: E402
from islandale3d.bake.targets import LIBRARY_EXTRAS, blends, targets  # noqa: E402
from islandale3d.styling import Styler  # noqa: E402

STYLES = pathlib.Path(__file__).resolve().parent / "styles.json"
DEFAULT_OUT = BUILD / "unreal" / "textures"


def parse(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--keys", help="comma-separated set names to bake (default: all)")
    ap.add_argument("--all", action="store_true", help="also bake the library materials nothing wears")
    ap.add_argument("--res", type=int, default=4096)
    ap.add_argument("--samples", type=int, default=64, help="samples per pixel for colour and ORM")
    ap.add_argument("--height-samples", type=int, default=256, help="samples per pixel for height (the normal comes from it)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--styles", default=str(STYLES))
    ap.add_argument("--no-shift-check", action="store_true")
    ap.add_argument("--contact-only", action="store_true", help="rewrite contact.html from materials.json and stop")
    ap.add_argument("--previews-only", action="store_true", help="redraw every set's previews from its PNGs, then the sheet")
    ap.add_argument("--checks-only", action="store_true",
                    help="re-run the seam checks on the baked sets (edge on the PNGs, fresh shift renders), no rebake")
    a = ap.parse_args(argv)
    if a.res < 256 or a.res & (a.res - 1):
        ap.error("--res must be a power of two, at least 256")
    return a


def _report(data: dict, json_path: pathlib.Path, out: pathlib.Path, label: str) -> int:
    manifest.write(json_path, data)
    sheet = contact.write(out, data)
    print(f"BAKE {label}; failed: {data['failed'] or 'none'}; unchecked: {data['unchecked'] or 'none'}; "
          f"not baked: {data['missing'] or 'none'}")
    print(f"BAKE materials.json -> {json_path}\nBAKE contact sheet -> {sheet}")
    return manifest.exit_code(data)


def _line(i: int, n: int, name: str, entry: dict, seconds: float) -> str:
    return (f"BAKE [{i}/{n}] {name}: {entry['status'].upper()} in {seconds:.0f}s"
            + "".join(f"\n  WARN {w}" for w in entry.get("warnings", [])))


def main(argv):
    a = parse(argv)
    out = pathlib.Path(a.out).resolve()
    json_path = out / "materials.json"
    previous = manifest.load(json_path)
    if (a.previews_only or a.contact_only or a.checks_only) and not previous.get("materials"):
        raise SystemExit(f"no baked sets in {json_path}: run a bake first")
    if a.previews_only:
        for name, entry in previous["materials"].items():
            entry["previews"] = rewrite_previews(out, name, entry)
            print(f"BAKE previews redrawn: {name}", flush=True)
        manifest.write(json_path, previous)
    if a.contact_only or a.previews_only:
        print(f"BAKE contact sheet -> {contact.write(out, previous)}")
        return 0
    styles = json.loads(pathlib.Path(a.styles).read_text())
    current = targets(styles, LIBRARY_EXTRAS if a.all else ())
    names = [t.name for t in current]
    todo = current
    if a.keys:
        wanted = {k.strip() for k in a.keys.split(",") if k.strip()}
        unknown = wanted - set(names)
        if unknown:
            raise SystemExit(f"unknown set(s) {sorted(unknown)}; known: {names}")
        todo = [t for t in current if t.name in wanted]
    gone = manifest.pruned(previous, names)
    if gone:
        print(f"BAKE dropping from materials.json (styles.json no longer reaches them; folders left on disk): {gone}")
    sty = Styler(a.styles)
    entries, t_all = {}, time.time()
    if a.checks_only:
        settings = {k: previous[k] for k in ("res", "tile_m", "samples", "height_samples") if k in previous}
        settings["shift_check"] = not a.no_shift_check
        todo = [t for t in todo if t.name in previous["materials"]]
        print(f"BAKE re-checking {len(todo)} baked sets in {out}")
        for i, t in enumerate(todo, 1):
            t0 = time.time()
            entries[t.name] = verify_set(sty.material(t.spec), previous["materials"][t.name], out, not a.no_shift_check)
            print(_line(i, len(todo), t.name, entries[t.name], time.time() - t0), flush=True)
        data = manifest.build(previous, entries, names, blends(styles), settings, ROOT, bpy.app.version_string)
        return _report(data, json_path, out, f"checked {len(entries)} sets in {(time.time() - t_all) / 60:.1f} min")
    if previous and previous.get("res") not in (None, a.res):
        print(f"WARNING materials.json was baked at {previous['res']} px; this run is {a.res} px")
    settings = {"res": a.res, "tile_m": 6.0, "samples": a.samples, "height_samples": a.height_samples,
                "shift_check": not a.no_shift_check}
    print(f"BAKE {len(todo)} sets at {a.res} px into {out}")
    for i, t in enumerate(todo, 1):
        entry = bake_set(sty.material(t.spec), t, out, a.res, a.samples, a.height_samples, not a.no_shift_check)
        entries[t.name] = entry
        print(_line(i, len(todo), t.name, entry, entry["bake_s"]), flush=True)
        manifest.write(json_path, manifest.build(previous, entries, names, blends(styles), settings, ROOT,
                                                 bpy.app.version_string))
    data = manifest.build(previous, entries, names, blends(styles), settings, ROOT, bpy.app.version_string)
    return _report(data, json_path, out, f"baked {len(entries)} sets in {(time.time() - t_all) / 60:.1f} min")


if __name__ == "__main__":
    sys.exit(main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
