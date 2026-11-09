"""materials.json: what each baked texture set is, for 6F (export) and 6G (Unreal import). Shape in PLAN-6E.md."""
from __future__ import annotations

import datetime
import json
import subprocess
from pathlib import Path

VERSION = 1
CONVENTIONS = {
    "uv": "UV0 = UVMeters / tile_m, so 0..1 is one tile; image top row = top of the tile (v = tile_m); u left to right",
    "BC": "8-bit sRGB albedo, nothing lit or occluded",
    "ORM": "8-bit linear: R ambient occlusion, G roughness, B metallic",
    "H": "16-bit linear: 0..1 = 0..relief_m, 0 = the deepest point. Blender's face sits at face_h (1 unless the material "
         "rises past its stated relief, blender_relief_m). Blender carves inward: displace by (h - face_h) * relief_m "
         "along the normal (Unreal: magnitude = ue.height_range_cm, center = ue.displacement_center)",
    "N": "16-bit linear tangent-space normal derived from H in true metres, DirectX (green down); no strength fudge",
    "Opacity": "8-bit linear Alpha * (1 - Transmission), only where it varies; else see constants",
    "constants": "outputs flat over the whole tile, given as numbers instead of maps",
}


def _git_commit(root: Path) -> str:
    try:
        return subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def build(previous: dict, entries: dict, blends: dict, settings: dict, root: Path, blender_version: str) -> dict:
    """Merge this run's entries over the previous file's (a --keys rerun keeps the other sets)."""
    materials = {**previous.get("materials", {}), **entries}
    return {
        "version": VERSION,
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "blender": blender_version, "git": _git_commit(root),
        **settings,
        "conventions": CONVENTIONS,
        "materials": dict(sorted(materials.items())),
        "blends": blends,
        "failed": sorted(k for k, m in materials.items() if not m.get("pass")),
    }


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    tmp.replace(path)
