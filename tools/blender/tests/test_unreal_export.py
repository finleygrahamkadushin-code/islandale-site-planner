"""Pure tests of the Unreal export (6F): frames, rotations, names, UV0, scene.json. No bpy, no rendering.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
        -P tools/blender/tests/test_unreal_export.py
(Any Python with numpy works too; numpy is only needed because islandale3d.bake imports it.)"""
import json
import math
import pathlib
import sys
import traceback

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from islandale3d.bake.targets import blends as style_blends, targets  # noqa: E402
from islandale3d.unreal import frame, names, scene_doc, uvs  # noqa: E402

STYLES = json.loads((HERE.parent / "styles.json").read_text())
BLENDS = style_blends(STYLES)
SETS = {t.name: {"tile_m": 6.0, "maps": {"BC": f"{t.name}/T_{t.name}_BC.png"}, "ue": {"master": "opaque"}}
        for t in targets(STYLES)}


def close(a, b, tol=1e-6):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


# ---- frame

def test_blender_point_lands_east_south_up_in_centimetres():
    assert frame.to_ue((1.0, 2.0, 3.0)) == (100.0, -200.0, 300.0)
    assert frame.to_ue((0.0, 10.0, 0.0))[1] < 0, "north is -Y in Unreal"


def test_frame_matches_gltf_then_interchange_chain():
    """Blender's glTF exporter writes (x, z, -y); UE's ConvertVec3 maps glTF (x, y, z) to (x, z, y), then x100."""
    for p in ((1.5, -2.25, 7.0), (-30.0, 12.0, 0.4)):
        g = (p[0], p[2], -p[1])
        ue = (g[0] * 100, g[2] * 100, g[1] * 100)
        assert close(frame.to_ue(p), ue)


def test_rotator_round_trips_through_forward():
    for d in ((1, 0, 0), (0, -1, 0), (0.3, 0.4, -0.5), (-2, 1, 3)):
        n = math.sqrt(sum(c * c for c in d))
        assert close(frame.forward(frame.rotator(d)), [c / n for c in d], 1e-5)


def test_sun_in_the_south_shines_north():
    rot = frame.sun_rotator(180.0, 30.0)
    f = frame.forward(rot)
    assert close(f, (0.0, -math.cos(math.radians(30)), -0.5), 1e-6), f
    assert abs(rot["pitch"] + 30) < 1e-6 and abs(rot["yaw"] + 90) < 1e-6


def test_evening_sun_in_the_west_shines_east():
    rot = frame.sun_rotator(270.0, 10.0)
    assert abs(rot["yaw"]) < 1e-6 and abs(rot["pitch"] + 10) < 1e-6


def test_camera_looking_north_has_yaw_minus_90_and_down_pitch_minus_90():
    assert close(list(frame.camera_rotator((0, 0, 0), (0, 10, 0)).values()), (0, -90, 0))
    assert abs(frame.camera_rotator((0, 0, 10), (0, 0, 0))["pitch"] + 90) < 1e-6


def test_horizontal_fov():
    assert abs(frame.horizontal_fov_deg(18.0) - 90.0) < 1e-9


# ---- names

def test_slugs_and_groups():
    assert names.slug("Elders’ wedge") == "elders_wedge"
    assert names.group_for("building", "Family twin pod") == "building_family_twin_pod"
    assert names.group_for("tree") == "trees" and names.group_for("other") == "site" and names.group_for("site") == "site"
    assert names.group_for("terrain") == "terrain" and names.group_for("earthworks") == "earthworks"
    assert names.group_for("water") is None
    for bad in (("building", None), ("spaceship", None)):
        try:
            names.group_for(*bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad} should be refused")


def test_mesh_names():
    assert names.mesh_name("terrain") == "SM_Terrain"
    assert names.mesh_name("building_elders_wedge") == "SM_Building_EldersWedge"


def test_set_slots_match_the_bake_folders():
    """The slot for a tuned material is the same <key>__<hash> the 6E bake named its folder."""
    elders = STYLES["buildings"]["elders"]["parts"]["wall"]["material"]
    assert names.set_slot(elders) == "stucco__aa9d13"
    assert names.set_slot(STYLES["site"]["terrain"]) == "meadow__63c904"
    assert names.set_slot("kurinuki") == "kurinuki"


def test_styler_tags_parse_back_to_the_same_slot():
    params = {"Color": [0.7157, 0.6654, 0.5841, 1.0]}
    tag = f"stucco:{json.dumps(params, sort_keys=True)}"         # styling.Styler.material's key
    key, got = names.parse_tag(tag)
    assert key == "stucco" and got == params
    assert names.set_slot({"material": key, "params": got}) == "stucco__aa9d13"
    assert names.parse_tag("kurinuki") == ("kurinuki", {})


def test_every_styles_spec_maps_to_a_baked_set():
    for t in targets(STYLES):
        assert names.set_slot(t.spec) in SETS


def test_wainscot_names():
    assert names.wainscot_blend("stucco__aa9d13", "ledgestone_cool", BLENDS) == "elders_wainscot"
    assert names.wainscot_slot("elders_wainscot", "C-3") == "elders_wainscot__C_3"
    try:
        names.wainscot_blend("cedar", "ledgestone_cool", BLENDS)
    except KeyError:
        return
    raise AssertionError("an unknown pair must be refused")


def test_planner_colours():
    assert names.planner_slot("#A1B2C3") == "planner_a1b2c3"
    assert names.planner_slot((1.0, 0.0, 0.5)) == "planner_ff0080"
    assert abs(names.srgb_to_linear(names.linear_to_srgb(0.214)) - 0.214) < 1e-9


def test_slot_kinds():
    assert names.slot_kind("kurinuki", SETS, BLENDS) == "set"
    assert names.slot_kind("stucco__aa9d13", SETS, BLENDS) == "set"
    assert names.slot_kind("elders_wainscot__C_3", SETS, BLENDS) == "wainscot"
    assert names.slot_kind("terrain", SETS, BLENDS) == "terrain"
    assert names.slot_kind("planner_00ff00", SETS, BLENDS) == "color"
    try:
        names.slot_kind("M_Kurinuki", SETS, BLENDS)
    except KeyError:
        return
    raise AssertionError("a Blender material name is not a slot")


# ---- UV0

def test_uv_scale_is_metres_over_tile():
    assert uvs.scale((12.0, -3.0), 6.0) == (2.0, -0.5)


def test_islands_join_faces_sharing_a_vertex():
    faces = [[0, 1, 2], [2, 3, 4], [5, 6, 7], [7, 8, 9], [10, 11, 12]]
    ids = uvs.islands(faces)
    assert ids[0] == ids[1] and ids[2] == ids[3] and len({ids[0], ids[2], ids[4]}) == 3


def test_island_shift_is_whole_tiles_and_keeps_an_island_together():
    faces = [[0, 1, 2], [2, 3, 4], [9, 10, 11]]
    face_uvs = [[(20.1, -3.9), (20.6, -3.8), (20.4, -3.2)], [(20.4, -3.2), (21.2, -3.6), (20.9, -3.1)],
                [(-0.5, 0.25), (0.0, 0.5), (-0.2, 0.75)]]
    shifts = uvs.island_shifts(faces, face_uvs)
    assert shifts[0] == shifts[1] == (20, -4)
    assert shifts[2] == (-1, 0)
    for (du, dv), f in zip(shifts, face_uvs):
        assert isinstance(du, int) and isinstance(dv, int)
        moved = [(u - du, v - dv) for u, v in f]
        assert all(-1.5 < u < 2.5 and -1.5 < v < 2.5 for u, v in moved)


# ---- scene.json

def fake_doc(slots_extra=()):
    lo, hi = (-5.0, 1.0, 2.0), (5.0, 3.0, 9.0)
    groups = [scene_doc.group("sea", "sea.glb", "SM_Sea", 2, ["water"], (-3000, -3000, 1.89), (3000, 3000, 1.89)),
              scene_doc.group("building_elders_wedge", "building_elders_wedge.glb", "SM_Building_EldersWedge", 900,
                              ["elders_wainscot__C_3", "steel", "planner_808080", *slots_extra], lo, hi,
                              {"oid": "C-3", "name": "Elders’ wedge", "lowest_z_m": 2.0, "ground_z_m": 2.1})]
    mats = {"water": scene_doc.material("water", {"kind": "set"}, SETS, BLENDS, 1),
            "steel": scene_doc.material("steel", {"kind": "set"}, SETS, BLENDS, 1),
            "elders_wainscot__C_3": scene_doc.material("elders_wainscot__C_3",
                                                       {"kind": "wainscot", "oid": "C-3", "top_z_m": 3.2}, SETS, BLENDS, 1),
            "planner_808080": scene_doc.material("planner_808080", {"kind": "color", "srgb": "#808080"}, SETS, BLENDS, 1),
            "terrain": scene_doc.material("terrain", {"kind": "terrain"}, SETS, BLENDS, 1)}
    cams = [scene_doc.camera("CAM Aerial to the bay", (0, 60, 40), (0, 0, 0), 32),
            scene_doc.camera("CAM Elders wedge detail", (1, 2, 3), (1, 0, 3), 35)]
    wains = {k: v for k, v in mats.items() if v["kind"] == "wainscot"}
    return scene_doc.build(generated="now", git="abc", source={}, textures={}, exag=1, tide_ft=6.2,
                           sun_doc=scene_doc.sun("jun", 17.0, 272.0, 30.0), cameras=cams, groups=groups,
                           materials_doc=mats, blends_doc=scene_doc.blends_section(wains, BLENDS, 1), notes=[])


def test_scene_json_is_whole_and_serialisable():
    doc = fake_doc()
    assert scene_doc.validate(doc, SETS, BLENDS) == []
    json.loads(json.dumps(doc))
    assert doc["tide"]["ue_z_cm"] == round(6.2 * 0.3048 * 100, 3)
    assert doc["blends"]["wainscots"]["elders_wainscot__C_3"]["top_z_cm"] == 320.0
    assert doc["materials"]["terrain"]["lower"] == "beach"
    assert doc["materials"]["planner_808080"]["linear"][0] == round(names.srgb_to_linear(128 / 255), 5)


def test_scene_json_bounds_flip_y():
    b = fake_doc()["groups"][1]["bounds_cm"]
    assert b["min"] == [-500.0, -300.0, 200.0] and b["max"] == [500.0, -100.0, 900.0]


def test_scene_json_cameras():
    cams = fake_doc()["cameras"]
    assert [c["kind"] for c in cams] == ["aerial", "detail"]
    assert cams[0]["name"] == "Aerial to the bay"
    assert abs(cams[0]["rotation"]["yaw"] - 90) < 1e-6, "looking south from the north is +Y in Unreal"
    assert cams[1]["eye_cm"] == [100.0, -200.0, 300.0]


def test_scene_json_catches_an_unbound_slot():
    doc = fake_doc(slots_extra=("M_Kurinuki",))
    assert any("M_Kurinuki" in p for p in scene_doc.validate(doc, SETS, BLENDS))


def main():
    tests = [(k, f) for k, f in globals().items() if k.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"ok   {name}")
        except Exception:  # noqa: BLE001 - report every failure, then exit non-zero
            failed += 1
            print(f"FAIL {name}\n{traceback.format_exc()}")
    print(f"{len(tests) - failed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
