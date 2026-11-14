"""scene.json: what 6G needs that a .glb can't carry (sun, tide, cameras, axes, materials, blends). Pure.

Every point is given in Blender metres and Unreal centimetres; shape in PLAN-6F.md."""
from __future__ import annotations

from . import frame, names

VERSION = 1
FT = 0.3048
CAMERA_KINDS = ("aerial", "hero", "detail")


def _r(v, nd=4):
    return [round(float(c), nd) for c in v]


def tide(tide_ft: float) -> dict:
    m = tide_ft * FT
    return {"ft_navd88": round(tide_ft, 4), "m_navd88": round(m, 5), "ue_z_cm": round(m * frame.CM_PER_M, 3)}


def sun(season: str, hour: float, azimuth_deg: float, elevation_deg: float, app_sun: dict | None = None) -> dict:
    toward = frame.toward_sun(azimuth_deg, elevation_deg)
    return {
        "season": season, "hour": hour, "latitude_deg": 48.46,
        "azimuth_deg": round(azimuth_deg, 4), "elevation_deg": round(elevation_deg, 4),
        "azimuth_from": "north, clockwise",
        "toward_sun_blender": _r(toward, 6), "toward_sun_ue": _r(frame.dir_to_ue(toward), 6),
        "directional_light_rotation": frame.sun_rotator(azimuth_deg, elevation_deg),
        "app_sun": app_sun or None,
    }


def camera_kind(name: str) -> str:
    low = name.lower()
    if "aerial" in low:
        return "aerial"
    return "detail" if low.endswith(" detail") else "hero"


def camera(name: str, eye_m, aim_m, lens_mm: float, sensor_mm: float = frame.FILMBACK_MM, sensor_fit: str = "AUTO") -> dict:
    """aim_m is a point along the view (eye + 10 m forward), not a subject: use `rotation`, not a look-at."""
    if sensor_fit not in ("AUTO", "HORIZONTAL"):
        raise ValueError(f"{name}: sensor fit {sensor_fit} (the export assumes a horizontal fit on a landscape frame)")
    return {
        "name": name.removeprefix("CAM "), "kind": camera_kind(name),
        "eye_m": _r(eye_m), "aim_point_m": _r(aim_m),
        "eye_cm": _r(frame.to_ue(eye_m), 2), "aim_point_cm": _r(frame.to_ue(aim_m), 2),
        "rotation": frame.camera_rotator(eye_m, aim_m),
        "focal_length_mm": round(lens_mm, 3), "filmback_mm": [round(sensor_mm, 3), round(sensor_mm * 9 / 16, 3)],
        "horizontal_fov_deg": round(frame.horizontal_fov_deg(lens_mm, sensor_mm), 3),
    }


def group(name: str, file: str, mesh: str, triangles: int, slots: list[str], lo_m, hi_m, building: dict | None = None) -> dict:
    lo_ue, hi_ue = frame.to_ue(lo_m), frame.to_ue(hi_m)
    out = {
        "group": name, "file": file, "mesh": mesh, "actor_location_cm": [0.0, 0.0, 0.0], "triangles": int(triangles),
        "slots": list(slots),               # in material-index order: slot i of the static mesh is slots[i]
        "slot_index": {s: i for i, s in enumerate(slots)},
        "bounds_m": {"min": _r(lo_m), "max": _r(hi_m)},
        # y flips sign, so Unreal's min y is Blender's max y
        "bounds_cm": {"min": _r((lo_ue[0], hi_ue[1], lo_ue[2]), 2), "max": _r((hi_ue[0], lo_ue[1], hi_ue[2]), 2)},
    }
    if building:
        out["building"] = building
    return out


def material(slot: str, info: dict, materials: dict, blends: dict, exag: float) -> dict:
    """One scene.json materials entry. info: {"kind": ..., plus "top_z_m"/"oid" (wainscot) or "srgb" (color)}."""
    kind = info["kind"]
    if kind == "set":
        m = materials[slot]
        return {"kind": "set", "set": slot, "tile_m": m["tile_m"], "maps": m["maps"], "constants": m.get("constants", {}),
                "relief_m": m.get("relief_m"), "ue": m.get("ue", {})}
    if kind == "wainscot":
        blend = slot.split("__")[0]
        b = blends[blend]
        return {"kind": "wainscot", "blend": blend, "oid": info["oid"], "rule": b["rule"], "upper": b["upper"],
                "lower": b["lower"], "edge": b.get("edge", "hard"), "height_m": b.get("height_m"),
                "top_z_m": round(info["top_z_m"], 4), "top_z_cm": round(info["top_z_m"] * frame.CM_PER_M, 2),
                "mask": "lower where the surface's world Z < top_z, upper above (Unreal: Absolute World Position Z)"}
    if kind == "terrain":
        b = blends[names.TERRAIN_SLOT]
        return {"kind": "terrain", "blend": names.TERRAIN_SLOT, "rule": b["rule"], "upper": b["upper"], "lower": b["lower"],
                "shore_z_m": b["shore_z_m"], "blend_m": b["blend_m"],
                "shore_z_cm": round(b["shore_z_m"] * frame.CM_PER_M, 2), "blend_cm": round(b["blend_m"] * frame.CM_PER_M, 2),
                "z_exaggerated": exag != 1,
                "mask": "smoothstep(shore_z + blend, shore_z - blend, world Z): 0 = upper (meadow), 1 = lower (beach)"}
    if kind == "color":
        h = names.color_hex(info["srgb"])
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        alpha = info.get("alpha", 1.0)
        return {"kind": "color", "srgb": "#" + h, "linear": [round(names.srgb_to_linear(c), 5) for c in rgb],
                "alpha": round(alpha, 3), "translucent": alpha < names.OPAQUE}
    raise ValueError(f"unknown slot kind {kind!r} for {slot!r}")


def build(*, generated: str, git: str, source: dict, textures: dict, exag: float, tide_ft: float, sun_doc: dict,
          cameras: list[dict], groups: list[dict], materials_doc: dict, blends_doc: dict, notes: list[str]) -> dict:
    return {
        "version": VERSION, "generated": generated, "git": git, "source": source, "textures": textures,
        "frames": frame.FRAMES, "exag": exag, "tide": tide(tide_ft), "sun": sun_doc,
        "cameras": cameras, "groups": groups, "materials": dict(sorted(materials_doc.items())), "blends": blends_doc,
        "notes": notes,
    }


def blends_section(wainscots: dict, materials_blends: dict, exag: float) -> dict:
    """wainscots: slot -> material entry (kind wainscot). The terrain rule comes from materials.json."""
    out = {"wainscots": {s: {"oid": w["oid"], "top_z_m": w["top_z_m"], "top_z_cm": w["top_z_cm"], "blend": w["blend"]}
                         for s, w in sorted(wainscots.items())}}
    t = materials_blends.get(names.TERRAIN_SLOT)
    if t:
        out["terrain"] = {"shore_z_m": t["shore_z_m"], "blend_m": t["blend_m"], "z_exaggerated": exag != 1}
    return out


def validate(doc: dict, materials: dict, blends: dict) -> list[str]:
    """Problems that would stop 6G binding the scene; empty when it is whole."""
    problems = []
    mats = doc.get("materials", {})
    for g in doc.get("groups", []):
        for s in g["slots"]:
            if s not in mats:
                problems.append(f"{g['group']}: slot {s} has no materials entry")
    for s, m in mats.items():
        try:
            kind = names.slot_kind(s, materials, blends)
        except KeyError as e:
            problems.append(str(e))
            continue
        if kind != m.get("kind"):
            problems.append(f"{s}: named like a {kind} but described as {m.get('kind')}")
        for layer in ("upper", "lower"):
            if layer in m and m[layer] not in materials:
                problems.append(f"{s}: its {layer} layer {m[layer]} is not a baked set")
    for c in doc.get("cameras", []):
        if c["kind"] not in CAMERA_KINDS:
            problems.append(f"camera {c['name']}: unknown kind {c['kind']}")
    t = doc.get("tide", {})
    if t and abs(t["ue_z_cm"] - t["ft_navd88"] * FT * frame.CM_PER_M) > 0.01:
        problems.append("tide: centimetres don't match feet")
    if not any(g["group"] == "sea" for g in doc.get("groups", [])):
        problems.append("no sea group")
    return problems
