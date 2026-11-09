"""numpy-only encoding for the Unreal texture bake: sRGB, Height normalisation, Normal and AO from Height, PNG writing.

Arrays here are row-major with row 0 at the BOTTOM of the tile (v = 0), as Blender stores image pixels; `write_png` flips
them so the file's top row is the top of the tile (v = Tile). Every filter wraps (np.roll, FFT), so a periodic input
gives a periodic output: the maps tile exactly when the material does."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np

SRGB_KNEE = 0.0031308
AO_BLUR_M = 0.04               # m: the scale of the cavities the derived AO darkens
AO_DERIVED_STRENGTH = 0.6      # how dark the deepest cavities get (gentle: Unreal applies AO to indirect light only)
AO_DERIVED_FLOOR = 0.45
PNG_FILTER_UP = 2


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    """The exact sRGB transfer curve (IEC 61966-2-1), on values clamped to 0..1."""
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= SRGB_KNEE, 12.92 * x, 1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def normalise_height(h_over_relief: np.ndarray) -> tuple[np.ndarray, dict]:
    """Height / stated relief mapped to 0..1 without clipping: the range is 0..1 of the stated relief, widened to fit
    wherever the material goes beyond it. Returns (h01, stats); stats["range"] = (lo, hi) in units of the stated relief,
    so the real relief is relief * (hi - lo) and Blender's face (stated relief) sits at h01 = (1 - lo) / (hi - lo)."""
    mn, mx = float(h_over_relief.min()), float(h_over_relief.max())
    lo, hi = min(0.0, mn), max(1.0, mx)
    beyond = float(np.mean((h_over_relief < 0.0) | (h_over_relief > 1.0)))
    h01 = (h_over_relief - lo) / (hi - lo)
    return h01, {"min": round(mn, 5), "max": round(mx, 5), "beyond_stated": round(beyond, 6),
                 "range": (round(lo, 6), round(hi, 6)), "face_h": round((1.0 - lo) / (hi - lo), 6)}


def height_gradient(h01: np.ndarray, relief_m: float, tile_m: float) -> tuple[np.ndarray, np.ndarray]:
    """dh/du and dh/dv in metres per metre, by central differences that wrap across the tile edges."""
    h = h01.astype(np.float64) * relief_m
    step = 2.0 * tile_m / h01.shape[0]
    du = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / step
    dv = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / step
    return du, dv


def normal_from_height(h01: np.ndarray, relief_m: float, tile_m: float) -> np.ndarray:
    """Tangent-space unit normals (u, v, z), shape (N, N, 3). No strength fudge: the true slopes in metres."""
    du, dv = height_gradient(h01, relief_m, tile_m)
    nrm = np.stack([-du, -dv, np.ones_like(du)], axis=-1)
    return nrm / np.linalg.norm(nrm, axis=-1, keepdims=True)


def encode_normal_directx(nrm: np.ndarray) -> np.ndarray:
    """Unit normals to 0..1 RGB in Unreal's DirectX convention: green points DOWN the image (G = 0.5 - 0.5 n_v)."""
    return np.stack([0.5 + 0.5 * nrm[..., 0], 0.5 - 0.5 * nrm[..., 1], 0.5 + 0.5 * nrm[..., 2]], axis=-1)


def periodic_blur(img: np.ndarray, sigma_px: float) -> np.ndarray:
    """Gaussian blur on a torus (FFT), so it wraps exactly."""
    if sigma_px <= 0:
        return img.copy()
    fy = np.fft.fftfreq(img.shape[0])[:, None]
    fx = np.fft.rfftfreq(img.shape[1])[None, :]
    kernel = np.exp(-2.0 * (np.pi * sigma_px) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(img) * kernel, s=img.shape)


def ao_from_height(h01: np.ndarray, tile_m: float) -> np.ndarray:
    """A gentle cavity AO for materials with no AO output: darker where the surface sits below its blurred neighbourhood."""
    sigma = AO_BLUR_M / (tile_m / h01.shape[0])
    cavity = np.clip(periodic_blur(h01.astype(np.float64), sigma) - h01, 0.0, None)
    scale = float(np.percentile(cavity, 99.5))
    if scale < 1e-6:
        return np.ones_like(h01, dtype=np.float64)
    return np.clip(1.0 - AO_DERIVED_STRENGTH * np.clip(cavity / scale, 0.0, 1.0), AO_DERIVED_FLOOR, 1.0)


def luminance(rgb_linear: np.ndarray) -> np.ndarray:
    return rgb_linear[..., 0] * 0.2126 + rgb_linear[..., 1] * 0.7152 + rgb_linear[..., 2] * 0.0722


def quantise(x: np.ndarray, bits: int) -> np.ndarray:
    q = np.rint(np.clip(x, 0.0, 1.0) * ((1 << bits) - 1))
    return q.astype(">u2" if bits == 16 else np.uint8)


def _chunk(tag: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)


def write_png(path: Path, data01: np.ndarray, bits: int) -> None:
    """Write a grey (H, W) or RGB (H, W, 3) array of 0..1 values as an 8- or 16-bit PNG whose top row is the array's
    last row (the top of the tile). Lossless zlib with the 'Up' filter on every row; nothing beyond numpy."""
    if bits not in (8, 16):
        raise ValueError(f"bits must be 8 or 16, not {bits}")
    channels = 1 if data01.ndim == 2 else data01.shape[2]
    if channels not in (1, 3):
        raise ValueError(f"expected 1 or 3 channels, got {channels}")
    arr = np.flipud(data01)
    h, w = arr.shape[:2]
    raw = np.ascontiguousarray(quantise(arr, bits)).view(np.uint8).reshape(h, -1)
    prev = np.vstack([np.zeros((1, raw.shape[1]), np.uint8), raw[:-1]])
    up = (raw.astype(np.int16) - prev.astype(np.int16)) & 0xFF
    rows = np.hstack([np.full((h, 1), PNG_FILTER_UP, np.uint8), up.astype(np.uint8)])
    ihdr = struct.pack(">IIBBBBB", w, h, bits, 0 if channels == 1 else 2, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(rows.tobytes(), 6))
                     + _chunk(b"IEND", b""))


def read_png(path: Path) -> np.ndarray:
    """Read back a PNG written by write_png (filters None and Up, 8/16-bit, grey/RGB) as 0..1 floats, row 0 at the bottom.
    For the tests and the contact sheet; not a general PNG reader."""
    blob = path.read_bytes()
    pos, idat, ihdr = 8, b"", None
    while pos < len(blob):
        n = struct.unpack(">I", blob[pos:pos + 4])[0]
        tag, body = blob[pos + 4:pos + 8], blob[pos + 8:pos + 8 + n]
        if tag == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif tag == b"IDAT":
            idat += body
        pos += 12 + n
    if ihdr is None:
        raise ValueError(f"{path} has no IHDR chunk")
    w, h, bits, ctype = ihdr[:4]
    ch = 1 if ctype == 0 else 3
    data = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, -1)
    filters, body = data[:, 0], data[:, 1:]
    if not np.all(np.isin(filters, (0, PNG_FILTER_UP))):
        raise ValueError(f"{path}: only PNG filters None and Up are supported here")
    up_rows = (filters == PNG_FILTER_UP)[:, None]
    # Up-filtered rows add the row above: a running sum mod 256 down each column, restarted at None-filtered rows.
    out = np.zeros_like(body)
    acc = np.zeros(body.shape[1], np.uint8)
    for r in range(h):
        acc = (body[r] + acc) if up_rows[r, 0] else body[r].copy()
        out[r] = acc
    vals = out.view(">u2").astype(np.float64) / 65535.0 if bits == 16 else out.astype(np.float64) / 255.0
    return np.flipud(vals.reshape(h, w) if ch == 1 else vals.reshape(h, w, 3))
