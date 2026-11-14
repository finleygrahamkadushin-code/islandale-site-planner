"""Blender tests of the Unreal export (6F): the corner weld, and UV0 and the axes through a real .glb.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
        -P tools/blender/tests/test_unreal_blender.py"""
import json
import pathlib
import struct
import sys
import tempfile
import traceback

import bmesh
import bpy

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from islandale3d import importer  # noqa: E402
from islandale3d.uv import UV_MAP, apply_uv_meters  # noqa: E402
from islandale3d.unreal import assemble  # noqa: E402

COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path):
    """(json, binary chunk) of a .glb."""
    data = pathlib.Path(path).read_bytes()
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF"
    jlen, _ = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20:20 + jlen])
    blen, _ = struct.unpack_from("<II", data, 20 + jlen)
    return doc, data[28 + jlen:28 + jlen + blen]


def accessor(doc, blob, index):
    acc = doc["accessors"][index]
    assert acc["componentType"] == 5126, "floats only here"
    view = doc["bufferViews"][acc["bufferView"]]
    n = COMPONENTS[acc["type"]]
    stride = view.get("byteStride", 4 * n)
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return [struct.unpack_from(f"<{n}f", blob, base + i * stride) for i in range(acc["count"])]


def clean():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def quad(name, pts, parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def test_corner_weld_joins_a_straight_mass_into_one_welded_mesh():
    clean()
    holder = bpy.data.objects.new("B #1", None)              # the glTF node of the planner object, moved 10 m east
    bpy.context.scene.collection.objects.link(holder)
    holder.location = (10.0, 0.0, 0.0)
    south = quad("south", [(0, 0, 0), (4, 0, 0), (4, 0, 3), (0, 0, 3)], holder)
    east = quad("east", [(4, 0, 0), (4, 5, 0), (4, 5, 3), (4, 0, 3)], holder)
    curved = quad("curved", [(0, 9, 0), (1, 9, 0), (1, 9, 3), (0, 9, 3)], holder)   # another mass: left alone
    bpy.context.view_layer.update()
    site = importer.Site(manifest={})
    site.objects["B"] = {"masses": [{"mi": 0, "wallEi": "edge"}, {"mi": 1, "wallEi": "perimeter"}]}
    for ob, mi in ((south, 0), (east, 0), (curved, 1)):
        site.items.append(importer.Item(ob=ob, root="Objects", props={"part": "wall", "mi": mi, "oid": "B", "t": "house"}))
    welds = assemble.weld_straight_walls(site)
    assert welds == {"B m0": {"walls": 2, "verts_welded": 2}}, welds
    walls = [it for it in site.items if it.props["mi"] == 0]
    assert len(walls) == 1 and len(site.items) == 2
    me = walls[0].ob.data
    assert len(me.vertices) == 6 and len(me.polygons) == 2
    xs = sorted({round(v.co.x, 6) for v in me.vertices})
    assert xs == [10.0, 14.0], f"the parent's 10 m must be baked into the vertices, got {xs}"
    assert walls[0].ob.parent is None


def test_uv0_and_axes_survive_the_glb():
    """A wall quad facing south: UVMeters u runs along it, v is world Z. After make_uv0 and export, TEXCOORD_0 must be
    (u/6 - du, 1 - (v/6 - dv)) for whole du, dv (Blender's exporter flips v; Unreal reads it as stored) and POSITION
    (x, z, -y)."""
    clean()
    ob = quad("wall", [(30, 2, 13), (33, 2, 13), (33, 2, 16), (30, 2, 16)])
    apply_uv_meters(ob)
    src = {tuple(round(c, 6) for c in ob.data.vertices[lp.vertex_index].co): tuple(ob.data.uv_layers[UV_MAP].data[i].uv)
           for i, lp in enumerate(ob.data.loops)}
    mat = bpy.data.materials.new("kurinuki")
    mat.use_nodes = True
    ob.data.materials.append(mat)
    info = assemble.make_uv0(ob.data, [6.0])
    assert info["max_abs_uv"] < 2.0 and [lay.name for lay in ob.data.uv_layers] == ["UV0"]
    with tempfile.TemporaryDirectory() as d:
        path = pathlib.Path(d) / "wall.glb"
        assemble.export_glb(ob, path)
        doc, blob = read_glb(path)
    assert [m["name"] for m in doc["materials"]] == ["kurinuki"]
    prim = doc["meshes"][0]["primitives"][0]
    pos = accessor(doc, blob, prim["attributes"]["POSITION"])
    uv = accessor(doc, blob, prim["attributes"]["TEXCOORD_0"])
    assert "TEXCOORD_1" not in prim["attributes"]
    shifts = set()
    for (gx, gy, gz), (s, t) in zip(pos, uv):
        bx, by, bz = gx, -gz, gy                            # glTF back to Blender
        u, v = src[(round(bx, 6), round(by, 6), round(bz, 6))]
        du, dv = u / 6 - s, v / 6 - (1 - t)
        assert abs(du - round(du)) < 1e-5 and abs(dv - round(dv)) < 1e-5, (u, v, s, t)
        shifts.add((round(du), round(dv)))
        assert abs(v - bz) < 1e-5, "wall v is world Z"
    assert len(shifts) == 1, f"one island moves as one: {shifts}"
    assert any(abs(gz + 2.0) < 1e-5 for _x, _y, gz in pos), "Blender y = 2 north is glTF z = -2"


def test_a_mirrored_node_keeps_its_faces_facing_out():
    """A glTF node mirrored in x: baking its transform must keep the face's normal pointing where it pointed in the scene."""
    clean()
    holder = bpy.data.objects.new("mirror", None)
    bpy.context.scene.collection.objects.link(holder)
    holder.scale = (-1.0, 1.0, 1.0)
    ob = quad("q", [(0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)], holder)     # faces -y before mirroring
    bpy.context.view_layer.update()
    want = (ob.matrix_world.to_3x3().inverted_safe().transposed() @ ob.data.polygons[0].normal).normalized()
    assert assemble.bake_transform(ob) is True
    got = ob.data.polygons[0].normal
    assert (got - want).length < 1e-6, (tuple(got), tuple(want))


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


main()
