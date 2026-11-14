"""UV0 for Unreal: the UVMeters map divided by the tile, each connected island moved by whole tiles toward 0. Pure.

The 6E textures repeat every tile, so a whole-tile move changes nothing on screen; it only keeps the numbers small, because
Unreal keeps UVs at half precision unless told otherwise (at u = 20 that is a step of 1/64 tile, 9 cm on a 6 m tile)."""
from __future__ import annotations

import math


def scale(uv, tile_m: float):
    """UVMeters (1 unit = 1 m) to tile units."""
    if tile_m <= 0:
        raise ValueError(f"tile must be positive, got {tile_m}")
    return (uv[0] / tile_m, uv[1] / tile_m)


def islands(faces: list[list[int]]) -> list[int]:
    """An island number per face: faces sharing a vertex are one island (union-find over vertex indices)."""
    parent: dict[int, int] = {}

    def find(a):
        root = a
        while parent.setdefault(root, root) != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root

    for f in faces:
        for v in f[1:]:
            ra, rb = find(f[0]), find(v)
            if ra != rb:
                parent[rb] = ra
    roots: dict[int, int] = {}
    return [roots.setdefault(find(f[0]), len(roots)) if f else -1 for f in faces]


def island_shifts(faces: list[list[int]], face_uvs: list[list[tuple[float, float]]]) -> list[tuple[int, int]]:
    """Per face, the whole-tile (du, dv) to subtract so its island's mean UV lands in [0, 1). Every face of an island moves
    by the same amount, so the texture across the island, seams and all, is untouched."""
    ids = islands(faces)
    sums: dict[int, list[float]] = {}
    for i, uvs in zip(ids, face_uvs):
        s = sums.setdefault(i, [0.0, 0.0, 0])
        for u, v in uvs:
            s[0] += u
            s[1] += v
            s[2] += 1
    shift = {i: (math.floor(s[0] / s[2]), math.floor(s[1] / s[2])) if s[2] else (0, 0) for i, s in sums.items()}
    return [shift[i] for i in ids]
