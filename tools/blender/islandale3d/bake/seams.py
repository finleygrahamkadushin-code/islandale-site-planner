"""numpy-only seam metrics for the baked tiles (PLAN-6E.md, "Seams").

edge_ratio (proves the FILE wraps): the change across the wrap against the changes inside the tile, each measured over two
pixels (|column i+1 - column i-1|), so a joint counts fully whether it falls on a pixel boundary or between pixel centres.
The reference is the EDGE_RANK-th largest of those inside the tile: a board joint, roof rib, course line or slab joint on
the tile edge (wrapped_cells puts cell boundaries there) is judged like the joints mid-tile, while a cliff that happens
once per tile, at the wrap, has nothing comparable inside it, even beside one large interior step.
Seamless <= ~1.0; PASS at <= EDGE_RATIO_MAX.

shift check (proves the MATERIAL repeats every Tile): the material rendered twice, the second time with the camera moved
half a tile, compared after rolling the first by half the image. Per channel (the worst channel counts, so a constant
channel can't dilute a seam): the mean difference, and the worst single row or column of the difference ("line": a seam
is a line, so a 2 cm one shows there even when it is a fraction of a percent of the pixels). PASS when mean <
SHIFT_MEAN_MAX and line < SHIFT_LINE_MAX, or, for detail finer than a pixel, when both are within NOISE_FLOOR_FACTOR x the
same statistics between two renders at the same place with different seeds (the map's own noise floor)."""
from __future__ import annotations

import numpy as np

EDGE_RATIO_MAX = 1.5
EDGE_RANK = 4                  # the 4th-largest two-pixel change inside the tile: at least two comparable features
SHIFT_MEAN_MAX = 0.01
SHIFT_LINE_MAX = 0.03
NOISE_FLOOR_FACTOR = 1.5


def _as3(img: np.ndarray) -> np.ndarray:
    return img[..., None] if img.ndim == 2 else img


def edge_ratio(img: np.ndarray) -> tuple[float, float]:
    """(u, v): the larger two-pixel change across the wrap (|col 1 - col N-1| or |col 0 - col N-2|), as a mean over the
    rows, over the EDGE_RANK-th largest two-pixel change |col i+1 - col i-1| inside the tile; the same for rows."""
    a = _as3(img).astype(np.float64)

    def ratio(axis: int) -> float:
        other = tuple(i for i in range(a.ndim) if i != axis)
        d2 = np.abs(np.roll(a, -1, axis=axis) - np.roll(a, 1, axis=axis)).mean(axis=other)    # d2[i] spans i-1 .. i+1
        n = len(d2)
        wrap = max(d2[0], d2[n - 1])
        inner = np.sort(d2[1:n - 1])[::-1]
        ref = inner[min(EDGE_RANK, len(inner)) - 1]
        if ref < 1e-9:
            return 1.0 if wrap < 1e-9 else float("inf")
        return float(wrap / ref)

    return ratio(1), ratio(0)


def diff_stats(a: np.ndarray, b: np.ndarray) -> dict:
    """Worst channel's mean |a - b|, worst channel's p99, and the worst single row or column mean ("line")."""
    d = np.abs(_as3(a).astype(np.float64) - _as3(b))
    means = d.mean(axis=(0, 1))
    lines = np.maximum(d.mean(axis=0).max(axis=0), d.mean(axis=1).max(axis=0))
    p99 = np.percentile(d.reshape(-1, d.shape[2]), 99, axis=0)
    return {"mean": float(means.max()), "line": float(lines.max()), "p99": float(p99.max())}


def shift_stats(base: np.ndarray, shifted: np.ndarray) -> dict:
    """diff_stats of the shifted render against the base rolled by half the image in u and v."""
    n, m = base.shape[:2]
    return diff_stats(np.roll(_as3(base), (-(n // 2), -(m // 2)), axis=(0, 1)), shifted)


def edge_report(img: np.ndarray) -> dict:
    u, v = edge_ratio(img)
    return {"edge_u": round(u, 4), "edge_v": round(v, 4), "edge_pass": bool(u <= EDGE_RATIO_MAX and v <= EDGE_RATIO_MAX)}


def shift_report(stats: dict, floor: dict | None, channels: list[str]) -> dict:
    """Which rule passed: 'absolute', 'noise_floor', or None (failed)."""
    rule = None
    if stats["mean"] < SHIFT_MEAN_MAX and stats["line"] < SHIFT_LINE_MAX:
        rule = "absolute"
    elif floor is not None and stats["mean"] <= NOISE_FLOOR_FACTOR * floor["mean"] \
            and stats["line"] <= NOISE_FLOOR_FACTOR * floor["line"]:
        rule = "noise_floor"
    out = {"channels": channels, "shift_mean": round(stats["mean"], 5), "shift_line": round(stats["line"], 5),
           "shift_p99": round(stats["p99"], 5), "shift_pass": rule is not None, "shift_rule": rule}
    if floor is not None:
        out["noise_floor"] = {k: round(v, 5) for k, v in floor.items()}
    return out
