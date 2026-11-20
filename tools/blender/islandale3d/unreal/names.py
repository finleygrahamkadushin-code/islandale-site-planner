"""Group and material-slot names for the Unreal export. Pure (bake.targets is json walking).

A slot name is what 6G binds: a 6E texture-set key (the same variant_name the bake used for its folder), a wainscot blend
for one building, the terrain blend, or planner_<rrggbb> for a surface that keeps the app's own colour."""
from __future__ import annotations

import json
import re

from ..bake.targets import split_spec, variant_name

GROUP_BY_KIND = {"terrain": "terrain", "earthworks": "earthworks", "site": "site", "other": "site", "tree": "trees",
                 "sea": "sea"}
DROPPED_KINDS = ("water",)      # the export's clipped water; the sea plane replaces it
TERRAIN_SLOT = "terrain"
PLANNER_PREFIX = "planner_"
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")
_PLANNER = re.compile(r"^planner_([0-9a-f]{6})(?:_a(\d{2}))?$")
OPAQUE = 0.995                  # alpha at or above this is opaque


def slug(text: str) -> str:
    """'Elders’ wedge' -> 'elders_wedge': apostrophes dropped, other runs of non-alphanumerics to one underscore."""
    text = re.sub(r"[’'`]", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def group_for(kind: str, building_name: str | None = None) -> str | None:
    """The .glb a mesh goes in, from importer.Item.kind; None for meshes left out."""
    if kind in DROPPED_KINDS:
        return None
    if kind == "building":
        if not building_name or not slug(building_name):
            raise ValueError("a building mesh needs its building's name")
        return f"building_{slug(building_name)}"
    if kind not in GROUP_BY_KIND:
        raise ValueError(f"no group for kind {kind!r}")
    return GROUP_BY_KIND[kind]


def mesh_name(group: str) -> str:
    """The one mesh object in a group's .glb: terrain -> SM_Terrain, building_elders_wedge -> SM_Building_EldersWedge."""
    head, _, rest = group.partition("_")
    if head == "building" and rest:
        return "SM_Building_" + "".join(w.capitalize() for w in rest.split("_"))
    return "SM_" + "".join(w.capitalize() for w in group.split("_"))


def parse_tag(tag: str) -> tuple[str, dict]:
    """styling.Styler.made's key back to (material key, params): 'kurinuki' or 'stucco:{"Color": [...]}'."""
    key, sep, rest = tag.partition(":")
    return key, (json.loads(rest) if sep else {})


def set_slot(spec) -> str:
    """A styles.json spec (key, or {"material": key, "params": ...}) to its 6E set name."""
    return variant_name(*split_spec(spec))


def wainscot_slot(blend: str, oid: str) -> str:
    oid_part = re.sub(r"[^A-Za-z0-9]+", "_", str(oid)).strip("_")
    if not oid_part:
        raise ValueError(f"a wainscot slot needs a building id, got {oid!r}")
    return f"{blend}__{oid_part}"


def wainscot_blend(upper: str, lower: str, blends: dict) -> str:
    """The materials.json blend whose layers are these two sets (rule below_world_z)."""
    hits = [k for k, b in blends.items() if b.get("rule") == "below_world_z" and b.get("upper") == upper
            and b.get("lower") == lower]
    if len(hits) != 1:
        raise KeyError(f"expected one wainscot blend of {upper} over {lower}, found {hits or 'none'}")
    return hits[0]


def color_hex(rgb) -> str:
    """'#a1b2c3', 'A1B2C3' or an sRGB triple in 0..1 to 'a1b2c3'."""
    if isinstance(rgb, str):
        m = _HEX.match(rgb.strip())
        if not m:
            raise ValueError(f"not an sRGB hex colour: {rgb!r}")
        return m.group(1).lower()
    r, g, b = (max(0, min(255, round(float(c) * 255))) for c in list(rgb)[:3])
    return f"{r:02x}{g:02x}{b:02x}"


def planner_slot(rgb, alpha: float = 1.0) -> str:
    """planner_<rrggbb>, or planner_<rrggbb>_a<NN> (alpha in hundredths) for a see-through surface, so a translucent and an
    opaque material of one colour stay apart."""
    a = max(0.0, min(1.0, float(alpha)))
    return PLANNER_PREFIX + color_hex(rgb) + ("" if a >= OPAQUE else f"_a{min(99, round(a * 100)):02d}")


def parse_planner(slot: str) -> tuple[str, float] | None:
    """('rrggbb', alpha) of a planner slot, else None."""
    m = _PLANNER.match(slot)
    if not m:
        return None
    return m.group(1), (int(m.group(2)) / 100 if m.group(2) else 1.0)


def building_groups(names_by_oid: dict) -> dict:
    """oid -> group for every building: building_<slug>, with the oid added to any name two buildings share (their meshes
    would otherwise land in one file)."""
    base = {oid: group_for("building", name) for oid, name in names_by_oid.items()}
    seen: dict = {}
    for oid, g in base.items():
        seen.setdefault(g, []).append(oid)
    return {oid: (g if len(seen[g]) == 1 else f"{g}_{slug(str(oid))}") for oid, g in base.items()}


def linear_to_srgb(c: float) -> float:
    c = max(0.0, min(1.0, float(c)))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def srgb_to_linear(c: float) -> float:
    c = max(0.0, min(1.0, float(c)))
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def slot_kind(slot: str, materials: dict, blends: dict) -> str:
    """set | wainscot | terrain | color; raises for a name 6G could not bind."""
    if slot == TERRAIN_SLOT:
        return "terrain"
    if parse_planner(slot):
        return "color"
    if slot in materials:
        return "set"
    blend = slot.split("__")[0] if "__" in slot else None
    if blend in blends and blends[blend].get("rule") == "below_world_z":
        return "wainscot"
    raise KeyError(f"slot {slot!r} is neither a 6E set, a blend nor a planner colour")
