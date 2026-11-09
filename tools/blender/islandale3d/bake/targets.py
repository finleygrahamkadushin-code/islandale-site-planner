"""Which texture sets the Unreal bake makes: every (material key, params) pair styles.json can reach, plus its two blends.

Pure json walking (no bpy), so the set can be tested anywhere. A spec is a key, {"material": key, "params": {...}}, or for
walls {"material": spec, "wainscot": {"material": spec, "height_m": m}}; styling.py resolves the same shapes."""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field

NATURAL = {"meadow", "beach", "gravel", "flagstone", "madrone_bark", "leaves", "sod_roof"}   # Unreal specular ~0.1
CELL_BOMB = {"meadow", "beach", "gravel"}            # anti-tiling only on natural, unpatterned ground (PLAN-6E, research)
TRIPLANAR = {"madrone_bark"}                         # trunks have no sensible UVs
UE_MASTER = {"glass": "glass", "glass_tinted": "glass", "water": "water", "leaves": "foliage"}
LIBRARY_EXTRAS = ("kurinuki_shino", "rigidized_metal")   # in the library, worn by nothing today (--all)


@dataclass
class Target:
    name: str
    key: str
    params: dict
    used_by: list = field(default_factory=list)

    @property
    def spec(self):
        return self.key if not self.params else {"material": self.key, "params": self.params}


def variant_name(key: str, params: dict) -> str:
    """The plain key, or key__<6 hex of a hash of the sorted params>: stable across runs, new when a param changes."""
    if not params:
        return key
    digest = hashlib.sha1(json.dumps(params, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:6]
    return f"{key}__{digest}"


def split_spec(spec) -> tuple[str, dict]:
    """(key, params) of a key or {"material": key, "params": ...} spec."""
    if isinstance(spec, str):
        return spec, {}
    inner = spec["material"]
    if isinstance(inner, dict):
        return split_spec(inner)
    return inner, dict(spec.get("params") or {})


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _walk(styles: dict):
    """Yield (where, spec) for every material spec in styles.json; skips nulls and "_" notes."""
    for pattern, b in styles.get("buildings", {}).items():
        for part, spec in b.get("parts", {}).items():
            where = f"buildings.{pattern}.parts.{part}"
            if isinstance(spec, dict) and "wainscot" in spec:
                yield where, spec["material"]
                yield where + ".wainscot", spec["wainscot"]["material"]
            elif spec is not None:
                yield where, spec
    for group, table in styles.get("defaults", {}).items():
        for name, spec in table.items():
            if spec is not None:
                yield f"defaults.{group}.{name}", spec
    site = styles.get("site", {})
    for role, spec in site.items():
        if role.startswith("_") or spec is None:
            continue
        if role == "trees":
            for k, v in spec.items():
                if not k.startswith("_") and v is not None:
                    yield f"site.trees.{k}", v
        elif role == "pads":
            for p in spec:
                yield f"site.pads[{p['match']}]", p["material"]
        else:
            yield f"site.{role}", spec


def targets(styles: dict, extras: tuple = ()) -> list[Target]:
    """One Target per distinct (key, params), in the order styles.json first names them."""
    out: dict[str, Target] = {}
    for where, spec in _walk(styles):
        key, params = split_spec(spec)
        name = variant_name(key, params)
        out.setdefault(name, Target(name, key, params)).used_by.append(where)
    for key in extras:
        out.setdefault(key, Target(key, key, {}, ["library (--all)"]))
    return list(out.values())


def blends(styles: dict) -> dict:
    """The two world-placed blends as layers plus a mask rule (6F supplies each building's wainscot top Z)."""
    out = {}
    for pattern, b in styles.get("buildings", {}).items():
        wall = b.get("parts", {}).get("wall")
        if isinstance(wall, dict) and "wainscot" in wall:
            w = wall["wainscot"]
            out[f"{_slug(pattern)}_wainscot"] = {
                "rule": "below_world_z", "upper": variant_name(*split_spec(wall["material"])),
                "lower": variant_name(*split_spec(w["material"])), "height_m": w["height_m"], "edge": "hard",
                "applies_to": f"buildings matching {pattern!r}: wall parts (gables stay upper)",
                "top_z": "per building, measured from its wall foot (styling.wainscot_bases); 6F writes it to scene.json"}
    site = styles.get("site", {})
    if "terrain" in site and "shore" in site:
        shore = site["shore"]
        out["terrain"] = {
            "rule": "z_smoothstep", "upper": variant_name(*split_spec(site["terrain"])),
            "lower": variant_name(*split_spec(shore)), "shore_z_m": shore["below_m"], "blend_m": shore["blend_m"],
            "z": "the surface's world Z in the Blender scene (metres); 6F records whether vertical exaggeration applies"}
    return out


def ue_hints(key: str, relief_m: float, face_h: float, metallic_present: bool) -> dict:
    """Starting values for 6G's material instances, from the research playbook. Hints only; 6G tunes them."""
    return {
        "master": UE_MASTER.get(key, "opaque"),
        "specular": 0.1 if key in NATURAL else 0.5,
        "cell_bomb": key in CELL_BOMB,
        "triplanar": key in TRIPLANAR,
        "metallic_present": metallic_present,
        "height_range_cm": round(relief_m * 100.0, 3),
        "displacement_center": round(face_h, 6),      # the H value that stays on the surface: carve inward
    }
