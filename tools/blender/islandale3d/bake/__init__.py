"""Bake Islandale materials into seamless Unreal texture sets (Phase 6E, PLAN-6E.md).

bake_set(material, target, ...) renders one material's passes (render.py), encodes the maps (encode.py), measures their
seams (seams.py), writes the files and previews, and returns the material's entry for materials.json (manifest.py).

Per set, in <out>/<name>/:
  T_<name>_BC.png    8-bit sRGB      Base Color (albedo only, nothing lit)
  T_<name>_ORM.png   8-bit linear    R AO, G Roughness, B Metallic
  T_<name>_H.png     16-bit linear   0..1 = 0..relief_m, 0 = the deepest point; Blender's face at face_h (1 unless the
                                     material rises past its stated relief); carve inward
  T_<name>_N.png     16-bit linear   tangent-space normal from the height, DirectX (green down)
  T_<name>_Opacity.png  8-bit linear, only when Alpha or Transmission varies over the tile
  preview_*.png      the check-in previews (2 x 2 tiles, and a 3 x 3 lit view)"""
from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from . import encode, seams
from .targets import Target, ue_hints

CHECK_RES = 1024               # the half-tile shift check renders at this size (it tests the material, not the file)
CHECK_SAMPLES = 16
CONSTANT_STD = 1e-4            # an output this flat is written as a number, not a map
PREVIEW_TILE = 256             # px per tile in the 2 x 2 previews
LIT_TILE = 384                 # px per tile in the 3 x 3 lit preview
LIGHT_ELEVATION_DEG = 35.0     # the preview light: low, from the top left, so a raised stone course reads as raised
ALBEDO_LOW, ALBEDO_HIGH = 0.03, 0.9
HEIGHT_CLIP_WARN = 0.001     # share of the height beyond the stated relief worth a note
HEIGHT_UNUSED_WARN = 0.5
DISPLACE_MIN_RELIEF = 0.02     # m: the same rule as styling.DISPLACE_MIN_RELIEF


def _downsample(img: np.ndarray, size: int) -> np.ndarray:
    f = img.shape[0] // size
    if f <= 1:
        return img
    trimmed = img[: size * f, : size * f]
    return trimmed.reshape(size, f, size, f, *img.shape[2:]).mean(axis=(1, 3))


def _tiled(img: np.ndarray, k: int) -> np.ndarray:
    reps = (k, k) + (1,) * (img.ndim - 2)
    return np.tile(img, reps)


def lit_preview(bc_linear: np.ndarray, normal_unit: np.ndarray, ao: np.ndarray) -> np.ndarray:
    """Base Color shaded by the normal under a low light from the top left, then sRGB: a quick look at the relief."""
    el = np.radians(LIGHT_ELEVATION_DEG)
    light = np.array([-np.cos(el) * np.sqrt(0.5), np.cos(el) * np.sqrt(0.5), np.sin(el)])
    ndl = np.clip((normal_unit @ light) / np.sin(el), 0.0, 2.0)
    shade = (0.25 + 0.75 * ndl) * np.sqrt(np.clip(ao, 0.0, 1.0))
    return encode.linear_to_srgb(bc_linear * shade[..., None])


def _write_previews(folder: Path, maps: dict, bc_lin: np.ndarray, nrm: np.ndarray, ao: np.ndarray) -> dict:
    out = {}
    for label, img in maps.items():
        p = folder / f"preview_{label}.png"
        encode.write_png(p, _tiled(_downsample(img, PREVIEW_TILE), 2), 8)
        out[label] = p.name
    lit = _downsample(lit_preview(bc_lin, nrm, ao), LIT_TILE)       # shade at full size, so fine relief still reads
    encode.write_png(folder / "preview_lit3x3.png", _tiled(lit, 3), 8)
    encode.write_png(folder / "preview_lit.png", _tiled(_downsample(lit, PREVIEW_TILE), 2), 8)
    out["lit3x3"], out["lit"] = "preview_lit3x3.png", "preview_lit.png"
    return out


def _shift_checks(baker, check_shift: bool) -> dict:
    """The half-tile check on each pass at CHECK_RES; a noise-floor re-render only for a pass that misses 0.01."""
    if not check_shift:
        return {}
    out = {}
    half = baker.tile / 2.0
    for pass_name in ("color", "orm", "height"):
        base, _ = baker.render(pass_name, CHECK_RES, 0.0, seed=0, samples=CHECK_SAMPLES)
        shifted, _ = baker.render(pass_name, CHECK_RES, half, seed=0, samples=CHECK_SAMPLES)
        if pass_name == "height":
            base, shifted = base[..., :1], shifted[..., :1]
        mean, p99 = seams.shift_difference(base, shifted)
        floor = None
        if mean >= seams.SHIFT_MEAN_MAX:
            again, _ = baker.render(pass_name, CHECK_RES, 0.0, seed=1, samples=CHECK_SAMPLES)
            floor = seams.noise_floor(base, again[..., :1] if pass_name == "height" else again)
        out[pass_name] = seams.shift_report(mean, p99, floor)
    return out


def _constant_or_map(chan: np.ndarray) -> float | None:
    return round(float(chan.mean()), 5) if float(chan.std()) < CONSTANT_STD else None


def _warnings(albedo: dict, height: dict, relief: float, bc_raw_max: float) -> list[str]:
    """Things worth a look at check-in B; none of them fails the set."""
    w = []
    if albedo["p01"] < ALBEDO_LOW:
        w.append(f"albedo below {ALBEDO_LOW} (p1 {albedo['p01']:.3f}): Lumen bounce light suffers")
    if albedo["p99"] > ALBEDO_HIGH:
        w.append(f"albedo above {ALBEDO_HIGH} (p99 {albedo['p99']:.3f})")
    if bc_raw_max > 1.0:
        w.append(f"Base Color exceeds 1 (max {bc_raw_max:.3f}); clipped in the PNG")
    if relief > 0 and height["beyond_stated"] > HEIGHT_CLIP_WARN:
        w.append(f"{height['beyond_stated'] * 100:.2f}% of the height goes beyond the stated relief "
                 f"({height['min']:.2f}..{height['max']:.2f} of it): H widened to fit, nothing clipped")
    if relief > 0 and height["max"] < HEIGHT_UNUSED_WARN:
        w.append(f"height peaks at {height['max']:.2f} of the relief: the stated relief is larger than the material uses")
    return w


def bake_set(mat, target: Target, out: Path, res: int, samples: int, height_samples: int, check_shift: bool) -> dict:
    """Bake one material into its texture set; returns its materials.json entry."""
    from .render import Baker          # bpy only here, so the numpy parts import anywhere

    t0 = time.time()
    folder = out / target.name
    folder.mkdir(parents=True, exist_ok=True)
    baker = Baker(mat, samples)
    try:
        bc_raw, _ = baker.render("color", res)
        orm_raw, orm_live = baker.render("orm", res)
        h_raw, h_live = baker.render("height", res, samples=height_samples)
        checks = _shift_checks(baker, check_shift)
    finally:
        tile, relief, group_name = baker.tile, baker.relief, baker.src.node_tree.name
        baker.close()

    bc_lin = np.clip(bc_raw, 0.0, 1.0)
    if relief > 0:
        h01, hstats = encode.normalise_height(h_raw[..., 0])
        lo, hi = hstats["range"]
    else:
        h01, lo, hi = np.ones(h_raw.shape[:2]), 0.0, 1.0
        hstats = {"min": 1.0, "max": 1.0, "beyond_stated": 0.0, "range": (0.0, 1.0), "face_h": 1.0}
    relief_eff = relief * (hi - lo)               # metres spanned by H's 0..1
    ao_source = "material" if "AO" in orm_live else ("height" if relief > 0 else "none")
    ao = np.clip(orm_raw[..., 0], 0.0, 1.0) if ao_source == "material" else (
        encode.ao_from_height(h01, tile) if ao_source == "height" else np.ones_like(h01))
    orm = np.stack([ao, np.clip(orm_raw[..., 1], 0, 1), np.clip(orm_raw[..., 2], 0, 1)], axis=-1)
    nrm = encode.normal_from_height(h01, relief_eff, tile) if relief > 0 else np.dstack(
        [np.zeros_like(h01), np.zeros_like(h01), np.ones_like(h01)])
    n_enc = encode.encode_normal_directx(nrm)
    bc_srgb = encode.linear_to_srgb(bc_lin)

    stem = f"T_{target.name}"
    files = {"BC": (bc_srgb, 8), "ORM": (orm, 8), "H": (h01, 16), "N": (n_enc, 16)}
    constants = {}
    for i, name in ((1, "Alpha"), (2, "Transmission")):
        if name in h_live:
            c = _constant_or_map(h_raw[..., i])
            if c is None:
                files["Opacity"] = (np.clip(h_raw[..., 1] * (1.0 - h_raw[..., 2]), 0, 1), 8)
            else:
                constants[name] = c
    for name in ("Roughness", "Metallic"):
        c = _constant_or_map(orm[..., 1 if name == "Roughness" else 2])
        if c is not None:
            constants[name] = c
    maps = {}
    for label, (img, bits) in files.items():
        encode.write_png(folder / f"{stem}_{label}.png", img, bits)
        maps[label] = f"{target.name}/{stem}_{label}.png"

    edge = {label: seams.edge_report(img) for label, (img, _) in files.items()}
    lum = encode.luminance(bc_lin)
    albedo = {"mean": round(float(lum.mean()), 4), "p01": round(float(np.percentile(lum, 1)), 4),
              "p99": round(float(np.percentile(lum, 99)), 4)}
    previews = _write_previews(folder, {"BC": bc_srgb, "ORM": orm, "H": h01, "N": n_enc}, bc_lin, nrm, ao)
    passed = all(e["edge_pass"] for e in edge.values()) and all(c["shift_pass"] for c in checks.values())
    return {
        "key": target.key, "params": target.params, "blender_material": mat.name, "group": group_name,
        "tile_m": tile, "res": res, "relief_m": round(relief_eff, 6), "blender_relief_m": round(relief, 6),
        "face_h": hstats["face_h"], "displace": relief >= DISPLACE_MIN_RELIEF,
        "maps": maps, "constants": constants, "ao_source": ao_source,
        "outputs_baked": sorted(set(orm_live) | set(h_live) | {"Base Color"}),
        "height": hstats, "albedo_luminance": albedo,
        "seams": {"edge": edge, "shift": checks}, "pass": passed,
        "warnings": _warnings(albedo, hstats, relief, float(bc_raw.max())),
        "ue": ue_hints(target.key, relief_eff, hstats["face_h"], constants.get("Metallic", 1.0) > 0.0),
        "previews": previews, "used_by": target.used_by, "bake_s": round(time.time() - t0, 1),
    }
