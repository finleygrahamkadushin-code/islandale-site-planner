"""numpy-only seam metrics for the baked tiles (PLAN-6E.md, "Seams").

edge_ratio: on the finished map, the step across the wrap (last column to first, last row to first) against the largest
ordinary step between neighbouring columns (rows) inside the tile. Seamless <= ~1.0; PASS at <= EDGE_RATIO_MAX. The shift
check proves the material repeats; this one proves the file wraps (framing, orientation).

shift_check: the material rendered twice, the second time with the camera moved half a tile, compared after rolling the
first by half the image. A material that repeats every Tile matches up to sampling noise; PASS when the mean difference is
under SHIFT_MEAN_MAX, or, for detail finer than a pixel, within NOISE_FLOOR_FACTOR x the map's own noise floor (the
difference between two renders at the same place with different seeds)."""
from __future__ import annotations

import numpy as np

EDGE_RATIO_MAX = 1.5
SHIFT_MEAN_MAX = 0.01
NOISE_FLOOR_FACTOR = 1.5


def _as3(img: np.ndarray) -> np.ndarray:
    return img[..., None] if img.ndim == 2 else img


def edge_ratio(img: np.ndarray) -> tuple[float, float]:
    """(u, v): the step across the wrap, mean |last column - first column|, over the LARGEST ordinary step between two
    neighbouring columns inside the tile; the same for rows. A board joint, roof rib or course line that falls on the tile
    edge (wrapped_cells puts cell boundaries there) is then judged like the same joint mid-tile, while a real seam (halves
    that don't match) stands out above every ordinary step. ~1 or less when seamless."""
    a = _as3(img).astype(np.float64)

    def ratio(axis: int) -> float:
        other = tuple(i for i in range(a.ndim) if i != axis)
        steps = np.abs(np.diff(a, axis=axis)).mean(axis=other).max()
        wrap = np.abs(np.take(a, -1, axis=axis) - np.take(a, 0, axis=axis)).mean()
        if steps < 1e-9:
            return 1.0 if wrap < 1e-9 else float("inf")
        return float(wrap / steps)

    return ratio(1), ratio(0)


def shift_difference(base: np.ndarray, shifted: np.ndarray) -> tuple[float, float]:
    """(mean, p99) of |shifted - base rolled by half the image in u and v|, averaged over channels."""
    n, m = base.shape[:2]
    rolled = np.roll(_as3(base), (-(n // 2), -(m // 2)), axis=(0, 1))
    d = np.abs(_as3(shifted).astype(np.float64) - rolled).mean(axis=2)
    return float(d.mean()), float(np.percentile(d, 99))


def noise_floor(a: np.ndarray, b: np.ndarray) -> float:
    """Mean |a - b| between two renders of the same place with different seeds."""
    return float(np.abs(_as3(a).astype(np.float64) - _as3(b)).mean())


def edge_report(img: np.ndarray) -> dict:
    u, v = edge_ratio(img)
    return {"edge_u": round(u, 4), "edge_v": round(v, 4), "edge_pass": bool(u <= EDGE_RATIO_MAX and v <= EDGE_RATIO_MAX)}


def shift_report(mean: float, p99: float, floor: float | None) -> dict:
    """Which rule passed: 'absolute' (mean < SHIFT_MEAN_MAX), 'noise_floor', or None (failed)."""
    rule = None
    if mean < SHIFT_MEAN_MAX:
        rule = "absolute"
    elif floor is not None and mean <= NOISE_FLOOR_FACTOR * floor:
        rule = "noise_floor"
    out = {"shift_mean": round(mean, 5), "shift_p99": round(p99, 5), "shift_pass": rule is not None, "shift_rule": rule}
    if floor is not None:
        out["noise_floor"] = round(floor, 5)
    return out
