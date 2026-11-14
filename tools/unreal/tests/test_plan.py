"""Pure tests of 6G's import plan (no Unreal):  python3 tools/unreal/tests/test_plan.py"""
import pathlib
import sys
import traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import islandale_plan as P  # noqa: E402

MAPS = lambda s: {k: f"{s}/T_{s}_{k}.png" for k in ("BC", "ORM", "H", "N")}  # noqa: E731
MJ = {"materials": {s: {"tile_m": 6.0, "maps": MAPS(s), "constants": {"Metallic": 0.0},
                        "ue": {"master": "glass" if s == "glass" else "opaque", "specular": 0.5, "height_range_cm": 2.0,
                               "displacement_center": 1.0}}
                    for s in ("kurinuki", "glass", "stucco__aa9d13", "ledgestone_cool", "meadow__63c904", "beach")}}
SCENE = {
    "textures": {"folder": "../textures", "materials_json": "../textures/materials.json"},
    "materials": {
        "kurinuki": {"kind": "set", "set": "kurinuki", "ue": {"master": "opaque"}},
        "glass": {"kind": "set", "set": "glass", "ue": {"master": "glass"}},
        "elders_wainscot__C_3": {"kind": "wainscot", "upper": "stucco__aa9d13", "lower": "ledgestone_cool", "top_z_cm": 512.0},
        "terrain": {"kind": "terrain", "upper": "meadow__63c904", "lower": "beach", "shore_z_cm": 300.0, "blend_cm": 80.0},
        "planner_808080": {"kind": "color", "linear": [0.2159, 0.2159, 0.2159]},
    },
    "groups": [{"group": "sea", "file": "sea.glb", "mesh": "SM_Sea", "slots": ["water"], "actor_location_cm": [0, 0, 0]},
               {"group": "building_gathering_prow", "file": "building_gathering_prow.glb",
                "mesh": "SM_Building_GatheringProw", "slots": ["kurinuki"], "actor_location_cm": [0, 0, 0]}],
    "sun": {"directional_light_rotation": {"pitch": -30.0, "yaw": 2.0, "roll": 0.0}},
    "cameras": [{"name": "Aerial to the bay", "eye_cm": [1, 2, 3], "rotation": {"pitch": -20.0, "yaw": 90.0, "roll": 0.0},
                 "focal_length_mm": 32.0, "filmback_mm": [36.0, 20.25]}],
}


def test_sets_used_include_blend_layers():
    assert P.sets_used(SCENE) == ["beach", "glass", "kurinuki", "ledgestone_cool", "meadow__63c904", "stucco__aa9d13"]


def test_texture_settings_per_map():
    tex = {t["asset"]: t for t in P.textures(SCENE, MJ, pathlib.Path("/bundle/scene"))}
    bc, n = tex["/Game/Islandale/Textures/kurinuki/T_kurinuki_BC"], tex["/Game/Islandale/Textures/kurinuki/T_kurinuki_N"]
    assert bc["srgb"] and pathlib.Path(bc["source"]) == pathlib.Path("/bundle/scene/../textures/kurinuki/T_kurinuki_BC.png")
    assert not n["srgb"] and n["compression"] == "TC_NORMALMAP" and n["flip_green_channel"] is False
    assert tex["/Game/Islandale/Textures/kurinuki/T_kurinuki_ORM"]["compression"] == "TC_MASKS"
    assert len(tex) == 6 * 4


def test_instances_pick_masters_and_params():
    inst = {i["slot"]: i for i in P.instances(SCENE, MJ)}
    assert inst["kurinuki"]["parent"].endswith("/M_IS_Opaque") and inst["glass"]["parent"].endswith("/M_IS_Glass")
    w = inst["elders_wainscot__C_3"]
    assert w["parent"].endswith("/M_IS_Wainscot") and w["scalars"]["TopZCm"] == 512.0
    assert w["textures"]["UpperBC"].endswith("T_stucco__aa9d13_BC") and w["textures"]["LowerN"].endswith("T_ledgestone_cool_N")
    t = inst["terrain"]
    assert t["scalars"]["ShoreZCm"] == 300.0 and t["textures"]["LowerBC"].endswith("T_beach_BC")
    assert inst["planner_808080"]["vectors"]["BaseColor"] == [0.2159, 0.2159, 0.2159, 1.0]
    assert inst["kurinuki"]["asset"] == "/Game/Islandale/Materials/MI_kurinuki"


def test_meshes_and_actors():
    m = {x["group"]: x for x in P.meshes(SCENE, pathlib.Path("/scene"))}
    assert m["sea"]["nanite"] is False and m["building_gathering_prow"]["nanite"] is True
    assert m["building_gathering_prow"]["source"] == "/scene/building_gathering_prow.glb"
    acts = P.actors(SCENE)
    kinds = [a["kind"] for a in acts]
    assert kinds.count("StaticMeshActor") == 2 and "DirectionalLight" in kinds and kinds[-1] == "CineCameraActor"
    assert all(a["location_cm"] == [0, 0, 0] for a in acts if a["kind"] == "StaticMeshActor")


def test_plan_is_stable():
    a, b = P.plan(SCENE, MJ, pathlib.Path("/s")), P.plan(SCENE, MJ, pathlib.Path("/s"))
    assert a == b and a["level"] == "/Game/Islandale/Maps/Islandale"


def main():
    tests = [(k, f) for k, f in globals().items() if k.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"ok   {name}")
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL {name}\n{traceback.format_exc()}")
    print(f"{len(tests) - failed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
