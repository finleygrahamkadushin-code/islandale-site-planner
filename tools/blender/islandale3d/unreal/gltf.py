"""Read a .glb and check its structure, with nothing but the standard library (the Khronos validator isn't installed and
the check must run offline). Pure.

validate() checks what Unreal's Interchange reader relies on: the GLB header and chunk lengths, glTF 2.0, every buffer
view inside its buffer, every accessor inside its view, POSITION min/max present and true, indices inside their vertex
count, normals of unit length, finite floats, material and mesh references in range, triangles only."""
from __future__ import annotations

import json
import math
import struct
from array import array

COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
CTYPES = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TRIANGLES = 4
NORMAL_TOL = 1e-3
MINMAX_TOL = 1e-5


def read_glb(data: bytes) -> tuple[dict, bytes, list[str]]:
    """(json, binary chunk, problems with the container)."""
    problems = []
    if len(data) < 20:
        return {}, b"", ["file too short for a GLB header"]
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        problems.append(f"magic {magic!r}, not glTF")
    if version != 2:
        problems.append(f"GLB version {version}, not 2")
    if length != len(data):
        problems.append(f"header length {length} but file is {len(data)} bytes")
    jlen, jtype = struct.unpack_from("<II", data, 12)
    if jtype != 0x4E4F534A:
        problems.append("first chunk is not JSON")
    if jlen % 4:
        problems.append("JSON chunk not 4-byte aligned")
    doc = json.loads(data[20:20 + jlen])
    blob = b""
    if 20 + jlen < len(data):
        blen, btype = struct.unpack_from("<II", data, 20 + jlen)
        if btype != 0x004E4942:
            problems.append("second chunk is not BIN")
        blob = data[28 + jlen:28 + jlen + blen]
        if len(blob) != blen:
            problems.append("BIN chunk shorter than its header says")
    return doc, blob, problems


def accessor(doc: dict, blob: bytes, index: int) -> list:
    """An accessor's elements as tuples (or numbers for SCALAR)."""
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    fmt, size = CTYPES[acc["componentType"]]
    n = COMPONENTS[acc["type"]]
    stride = view.get("byteStride", size * n)
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    if stride == size * n:
        flat = array(fmt)
        flat.frombytes(blob[base:base + acc["count"] * stride])
        if n == 1:
            return list(flat)
        return [tuple(flat[i * n:(i + 1) * n]) for i in range(acc["count"])]
    return [struct.unpack_from(f"<{n}{fmt}", blob, base + i * stride) for i in range(acc["count"])]


def _accessor_extent(doc, i):
    acc = doc["accessors"][i]
    view = doc["bufferViews"][acc["bufferView"]]
    _fmt, size = CTYPES[acc["componentType"]]
    n = COMPONENTS[acc["type"]]
    stride = view.get("byteStride", size * n)
    end = acc.get("byteOffset", 0) + (acc["count"] - 1) * stride + size * n if acc["count"] else 0
    return end, view.get("byteLength", 0)


def validate(data: bytes) -> dict:
    """{"problems": [...], "stats": {...}} for one .glb."""
    doc, blob, problems = read_glb(data)
    if not doc:
        return {"problems": problems, "stats": {}}
    if doc.get("asset", {}).get("version") != "2.0":
        problems.append("asset.version is not 2.0")
    blen = doc.get("buffers", [{}])[0].get("byteLength", 0) if doc.get("buffers") else 0
    if blen > len(blob):
        problems.append(f"buffer says {blen} bytes, BIN chunk has {len(blob)}")
    for i, v in enumerate(doc.get("bufferViews", [])):
        if v.get("byteOffset", 0) + v["byteLength"] > blen:
            problems.append(f"bufferView {i} runs past the buffer")
    for i, acc in enumerate(doc.get("accessors", [])):
        if acc.get("componentType") not in CTYPES or acc.get("type") not in COMPONENTS:
            problems.append(f"accessor {i}: bad componentType/type")
            continue
        end, vlen = _accessor_extent(doc, i)
        if end > vlen:
            problems.append(f"accessor {i} runs past its bufferView")
    nmat = len(doc.get("materials", []))
    stats = {"meshes": len(doc.get("meshes", [])), "primitives": 0, "vertices": 0, "triangles": 0,
             "materials": [m.get("name") for m in doc.get("materials", [])], "pos_min": None, "pos_max": None,
             "uv_min": None, "uv_max": None, "attributes": set()}
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    ulo, uhi = [math.inf] * 2, [-math.inf] * 2
    for mi, mesh in enumerate(doc.get("meshes", [])):
        for pi, prim in enumerate(mesh["primitives"]):
            where = f"mesh {mi} primitive {pi}"
            stats["primitives"] += 1
            stats["attributes"] |= set(prim["attributes"])
            if prim.get("mode", TRIANGLES) != TRIANGLES:
                problems.append(f"{where}: not triangles")
            if "material" in prim and not 0 <= prim["material"] < nmat:
                problems.append(f"{where}: material index out of range")
            pa = doc["accessors"][prim["attributes"]["POSITION"]]
            pos = accessor(doc, blob, prim["attributes"]["POSITION"])
            stats["vertices"] += len(pos)
            if "min" not in pa or "max" not in pa:
                problems.append(f"{where}: POSITION lacks min/max")
            else:
                for k in range(3):
                    tmin, tmax = min(p[k] for p in pos), max(p[k] for p in pos)
                    if abs(tmin - pa["min"][k]) > MINMAX_TOL or abs(tmax - pa["max"][k]) > MINMAX_TOL:
                        problems.append(f"{where}: POSITION min/max don't match the data")
                        break
            for p in pos:
                for k in range(3):
                    lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
            if any(not math.isfinite(c) for p in pos for c in p):
                problems.append(f"{where}: non-finite POSITION")
            if "NORMAL" in prim["attributes"]:
                bad = sum(1 for n in accessor(doc, blob, prim["attributes"]["NORMAL"])
                          if abs(math.sqrt(sum(c * c for c in n)) - 1) > NORMAL_TOL)
                if bad:
                    problems.append(f"{where}: {bad} normals not unit length")
            if "TEXCOORD_0" in prim["attributes"]:
                for u, v in accessor(doc, blob, prim["attributes"]["TEXCOORD_0"]):
                    if not (math.isfinite(u) and math.isfinite(v)):
                        problems.append(f"{where}: non-finite TEXCOORD_0")
                        break
                    ulo[0], ulo[1], uhi[0], uhi[1] = min(ulo[0], u), min(ulo[1], v), max(uhi[0], u), max(uhi[1], v)
            if "indices" in prim:
                idx = accessor(doc, blob, prim["indices"])
                if idx and max(idx) >= len(pos):
                    problems.append(f"{where}: an index points past the vertices")
                if len(idx) % 3:
                    problems.append(f"{where}: index count not a multiple of 3")
                stats["triangles"] += len(idx) // 3
            else:
                stats["triangles"] += len(pos) // 3
    for i, node in enumerate(doc.get("nodes", [])):
        if "mesh" in node and not 0 <= node["mesh"] < stats["meshes"]:
            problems.append(f"node {i}: mesh index out of range")
    if stats["vertices"]:
        stats["pos_min"], stats["pos_max"] = lo, hi
    if math.isfinite(ulo[0]):
        stats["uv_min"], stats["uv_max"] = ulo, uhi
    stats["attributes"] = sorted(stats["attributes"])
    return {"problems": problems, "stats": stats}
