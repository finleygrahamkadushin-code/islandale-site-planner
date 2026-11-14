"""6G's import plan, worked out from 6F's scene.json and 6E's materials.json with no Unreal at all (pure Python), so the
editor script only carries it out and the plan can be tested anywhere:

    python3 tools/unreal/islandale_plan.py <build/3d/unreal/scene/scene.json>      # prints the plan as JSON

Everything lands under /Game/Islandale. Names are stable, so a second run finds and replaces what the first made."""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = "/Game/Islandale"
TEXTURES, MATERIALS, MASTERS, MESHES = f"{ROOT}/Textures", f"{ROOT}/Materials", f"{ROOT}/Materials/Masters", f"{ROOT}/Meshes"
LEVEL = f"{ROOT}/Maps/Islandale"
ACTOR_TAG = "islandale6g"            # every actor the script spawns; a rerun deletes these first

# How each 6E map is imported (materials.json "conventions"): BC sRGB albedo; ORM linear masks; N a DirectX normal (Unreal's
# own convention, so no green flip); H 16-bit linear height.
MAP_SETTINGS = {
    "BC": {"srgb": True, "compression": "TC_DEFAULT"},
    "ORM": {"srgb": False, "compression": "TC_MASKS"},
    "N": {"srgb": False, "compression": "TC_NORMALMAP", "flip_green_channel": False},
    "H": {"srgb": False, "compression": "TC_GRAYSCALE"},
    "Opacity": {"srgb": False, "compression": "TC_GRAYSCALE"},
}
MASTER_BY_HINT = {"opaque": "M_IS_Opaque", "glass": "M_IS_Glass", "water": "M_IS_Water", "foliage": "M_IS_Foliage"}
MASTER_BY_KIND = {"wainscot": "M_IS_Wainscot", "terrain": "M_IS_Terrain", "color": "M_IS_Color"}


def texture_path(set_name: str, map_key: str) -> str:
    return f"{TEXTURES}/{set_name}/T_{set_name}_{map_key}"


def instance_path(slot: str) -> str:
    return f"{MATERIALS}/MI_{slot}"


def mesh_folder(group: str) -> str:
    return f"{MESHES}/{group}"


def sets_used(scene: dict) -> list[str]:
    """Every 6E set a slot needs: its own, or a blend's two layers."""
    out = set()
    for m in scene["materials"].values():
        if m["kind"] == "set":
            out.add(m["set"])
        elif m["kind"] in ("wainscot", "terrain"):
            out.update((m["upper"], m["lower"]))
    return sorted(out)


def textures(scene: dict, materials_json: dict) -> list[dict]:
    folder = pathlib.Path(scene["textures"]["folder"])
    out = []
    for s in sets_used(scene):
        for key, rel in materials_json["materials"][s]["maps"].items():
            out.append({"asset": texture_path(s, key), "source": str(folder / rel), "set": s, "map": key,
                        **MAP_SETTINGS[key]})
    return out


def _set_params(prefix: str, set_name: str, m: dict) -> dict:
    """A layer's parameters: its maps, its constants, its relief and Unreal hints (6E's starting values)."""
    ue = m.get("ue", {})
    tex = {f"{prefix}{k}": texture_path(set_name, k) for k in m["maps"]}
    scalars = {f"{prefix}TileM": m["tile_m"], f"{prefix}Specular": ue.get("specular", 0.5),
               f"{prefix}HeightRangeCm": ue.get("height_range_cm", 0.0),
               f"{prefix}DisplacementCenter": ue.get("displacement_center", 1.0)}
    for k, v in m.get("constants", {}).items():
        if isinstance(v, (int, float)):
            scalars[f"{prefix}{k.replace(' ', '')}"] = v
    return {"textures": tex, "scalars": scalars}


def instances(scene: dict, materials_json: dict) -> list[dict]:
    mats = materials_json["materials"]
    out = []
    for slot, m in sorted(scene["materials"].items()):
        kind = m["kind"]
        if kind == "set":
            master = MASTER_BY_HINT.get(m.get("ue", {}).get("master", "opaque"), "M_IS_Opaque")
            p = _set_params("", slot, mats[slot])
            item = {"textures": p["textures"], "scalars": p["scalars"], "vectors": {}}
        elif kind in ("wainscot", "terrain"):
            master = MASTER_BY_KIND[kind]
            up, low = _set_params("Upper", m["upper"], mats[m["upper"]]), _set_params("Lower", m["lower"], mats[m["lower"]])
            scalars = {**up["scalars"], **low["scalars"]}
            if kind == "wainscot":
                scalars["TopZCm"] = m["top_z_cm"]
            else:
                scalars.update({"ShoreZCm": m["shore_z_cm"], "BlendCm": m["blend_cm"]})
            item = {"textures": {**up["textures"], **low["textures"]}, "scalars": scalars, "vectors": {}}
        elif kind == "color":
            master = MASTER_BY_KIND["color"]
            item = {"textures": {}, "scalars": {}, "vectors": {"BaseColor": [*m["linear"], 1.0]}}
        else:
            raise ValueError(f"{slot}: unknown kind {kind}")
        out.append({"asset": instance_path(slot), "slot": slot, "parent": f"{MASTERS}/{master}", **item})
    return out


def meshes(scene: dict, scene_dir: pathlib.Path) -> list[dict]:
    return [{"group": g["group"], "source": str(scene_dir / g["file"]), "folder": mesh_folder(g["group"]),
             "mesh": g["mesh"], "slots": g["slots"], "nanite": g["group"] != "sea", "full_precision_uvs": True}
            for g in scene["groups"]]


def actors(scene: dict) -> list[dict]:
    """The level: every group at the origin, the sun, sky, fog, post and the cameras; each tagged ACTOR_TAG."""
    out = [{"kind": "StaticMeshActor", "label": g["group"], "mesh_folder": mesh_folder(g["group"]),
            "location_cm": g["actor_location_cm"], "rotation": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}}
           for g in scene["groups"]]
    out.append({"kind": "DirectionalLight", "label": "Sun", "rotation": scene["sun"]["directional_light_rotation"],
                "atmosphere_sun_light": True})
    out += [{"kind": k, "label": k} for k in ("SkyAtmosphere", "SkyLight", "ExponentialHeightFog", "PostProcessVolume")]
    out += [{"kind": "CineCameraActor", "label": f"CAM {c['name']}", "location_cm": c["eye_cm"], "rotation": c["rotation"],
             "focal_length_mm": c["focal_length_mm"], "filmback_mm": c["filmback_mm"]} for c in scene["cameras"]]
    return out


def plan(scene: dict, materials_json: dict, scene_dir: pathlib.Path) -> dict:
    return {"textures": textures(scene, materials_json), "masters": sorted({i["parent"] for i in instances(scene, materials_json)}),
            "instances": instances(scene, materials_json), "meshes": meshes(scene, scene_dir), "level": LEVEL,
            "actors": actors(scene), "actor_tag": ACTOR_TAG}


def main(argv):
    scene_path = pathlib.Path(argv[0])
    scene = json.loads(scene_path.read_text())
    materials_json = json.loads(pathlib.Path(scene["textures"]["materials_json"]).read_text())
    print(json.dumps(plan(scene, materials_json, scene_path.parent), indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
