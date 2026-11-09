"""Fast tests of the bake's numpy parts (encode, seams, targets), no rendering.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
        -P tools/blender/tests/test_bake_numpy.py
(Any Python with numpy works too: python3 tools/blender/tests/test_bake_numpy.py)"""
import json
import pathlib
import sys
import tempfile
import traceback
import zlib

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from islandale3d.bake import encode, seams  # noqa: E402
from islandale3d.bake.targets import blends, split_spec, targets, variant_name  # noqa: E402

T, N = 6.0, 256
STYLES = json.loads((HERE.parent / "styles.json").read_text())


def grid():
    c = (np.arange(N) + 0.5) * T / N
    return np.meshgrid(c, c)            # u varies along columns, v along rows (row 0 = bottom)


def test_normal_matches_analytic_slope():
    """A steep sine (slopes up to 0.52) so a wrong step size or sign shows; tolerance relative to the slope."""
    u, v = grid()
    amp = 1.0
    h01 = 0.5 + 0.5 * np.sin(2 * np.pi * u / T)               # height = amp * h01
    nrm = encode.normal_from_height(h01, amp, T)
    slope = amp * 0.5 * (2 * np.pi / T) * np.cos(2 * np.pi * u / T)
    expect = np.stack([-slope, np.zeros_like(slope), np.ones_like(slope)], axis=-1) / np.sqrt(1 + slope ** 2)[..., None]
    err = np.abs(nrm - expect).max()
    assert err < 2e-4 * np.abs(expect[..., 0]).max(), err      # central differences: ~(2 pi / N)^2 / 6 relative
    assert np.abs(nrm[..., 0]).max() > 0.4


def test_directx_green_points_down():
    u, v = grid()
    enc = encode.encode_normal_directx(encode.normal_from_height(v / T, 0.05, T))   # rising toward the top
    assert enc[N // 2, N // 2][1] > 0.5, "a surface rising up the image faces down-image: DirectX G > 0.5"
    enc_r = encode.encode_normal_directx(encode.normal_from_height(u / T, 0.05, T))  # rising to the right
    assert enc_r[N // 2, N // 2][0] < 0.5, "a surface rising to the right faces left: R < 0.5"


def test_directx_bump_lit_from_top_left_reads_raised():
    """On a bump's upper-left flank the normal leans up and left, toward a light in the top left."""
    u, v = grid()
    h01 = np.exp(-(((u - T / 2) ** 2 + (v - T / 2) ** 2) / 0.5))
    nrm = encode.normal_from_height(h01, 0.05, T)
    r, c = int(N * 0.6), int(N * 0.4)                          # a row above the middle (higher v), a column left of it
    assert nrm[r, c, 0] < 0 and nrm[r, c, 1] > 0
    enc = encode.encode_normal_directx(nrm)[r, c]
    assert enc[0] < 0.5 and enc[1] < 0.5, "DirectX: an up-facing normal has G below 0.5"


def test_periodic_height_gives_periodic_normal():
    u, v = grid()
    h01 = 0.5 + 0.25 * np.sin(2 * np.pi * u / T) * np.cos(4 * np.pi * v / T)
    eu, ev = seams.edge_ratio(encode.encode_normal_directx(encode.normal_from_height(h01, 0.03, T)))
    assert eu < 1.2 and ev < 1.2, (eu, ev)


def test_srgb_curve():
    assert encode.linear_to_srgb(np.array(0.0)) == 0.0
    assert abs(encode.linear_to_srgb(np.array(1.0)) - 1.0) < 1e-12
    k = encode.SRGB_KNEE
    assert abs(encode.linear_to_srgb(np.array(k)) - 12.92 * k) < 1e-9
    assert abs(encode.linear_to_srgb(np.array(0.18)) - 0.4613561) < 1e-6
    x = np.linspace(0, 1, 101)
    assert np.abs(encode.srgb_to_linear(encode.linear_to_srgb(x)) - x).max() < 1e-9


def test_height_normalisation_widens_instead_of_clipping():
    h01, stats = encode.normalise_height(np.array([[-0.1, 0.0], [0.5, 1.2]]))
    assert h01.min() == 0.0 and h01.max() == 1.0
    assert stats["beyond_stated"] == 0.5 and stats["range"] == (-0.1, 1.2)
    assert abs(h01[0, 1] - 0.1 / 1.3) < 1e-12                       # zero relief keeps its place in the wider range
    assert abs(stats["face_h"] - 1.1 / 1.3) < 1e-6
    inside, s2 = encode.normalise_height(np.array([[0.2, 0.9]]))
    assert s2["range"] == (0.0, 1.0) and s2["face_h"] == 1.0 and inside[0, 0] == 0.2


def test_png_round_trip_8_and_16_bit():
    rng = np.random.default_rng(1)
    with tempfile.TemporaryDirectory() as d:
        for bits, shape in ((8, (37, 53, 3)), (16, (40, 31)), (16, (16, 16, 3))):
            img = rng.random(shape)
            p = pathlib.Path(d) / f"t{bits}_{len(shape)}.png"
            encode.write_png(p, img, bits)
            back = encode.read_png(p)
            assert back.shape == img.shape
            assert np.abs(back - img).max() <= 0.5 / ((1 << bits) - 1) + 1e-12, bits
            head = p.read_bytes()[:33]
            assert head[24] == bits and head[25] == (0 if len(shape) == 2 else 2)


def test_png_top_row_is_top_of_tile():
    img = np.zeros((4, 4))
    img[-1] = 1.0                                              # the array's last row = the top of the tile
    with tempfile.TemporaryDirectory() as d:
        p = pathlib.Path(d) / "o.png"
        encode.write_png(p, img, 8)
        blob = p.read_bytes()
        i = blob.index(b"IDAT")
        n = int.from_bytes(blob[i - 4:i], "big")
        rows = np.frombuffer(zlib.decompress(blob[i + 4:i + 4 + n]), np.uint8).reshape(4, 5)
        assert rows[0, 1] == 255, "the file's first row must be the tile's top"


def test_ao_from_height_darkens_pits_and_wraps():
    u, v = grid()
    h01 = np.ones((N, N))
    h01[np.abs(u - 0.1) < 0.05] = 0.0                          # a groove hugging the left edge
    ao = encode.ao_from_height(h01, T)
    assert ao[:, 2].mean() < 0.9 and ao[:, N // 2].mean() > 0.99
    assert ao.min() >= encode.AO_DERIVED_FLOOR
    assert np.abs(ao[:, -1] - ao[:, -2]).mean() < 0.2          # the blur wraps: no cliff at the right edge
    assert np.all(encode.ao_from_height(np.full((N, N), 0.3), T) == 1.0)


def test_seams_pass_seamless_and_fail_steps_and_ramps():
    u, v = grid()
    smooth = 0.5 + 0.4 * np.sin(2 * np.pi * u / T) * np.sin(2 * np.pi * v / T)
    assert seams.edge_report(smooth)["edge_pass"]
    noise = np.random.default_rng(3).random((N, N))
    assert seams.edge_report(noise)["edge_pass"], seams.edge_ratio(noise)
    wrong_period = 0.5 + 0.4 * np.sin(2 * np.pi * u / (0.8 * T))    # halves that don't meet: a real seam
    assert not seams.edge_report(wrong_period)["edge_pass"], seams.edge_ratio(wrong_period)
    assert not seams.edge_report(u / T)["edge_pass"]


def test_joint_on_the_tile_edge_is_not_a_seam():
    """Boards with a dark groove every 0.5 m, one of them on the tile edge (as wrapped_cells lays them out)."""
    u, v = grid()
    boards = np.where((u % 0.5) < 0.03, 0.1, 0.7) + 0.05 * np.sin(2 * np.pi * v / T)
    eu, ev = seams.edge_ratio(boards)
    assert eu <= seams.EDGE_RATIO_MAX and ev <= seams.EDGE_RATIO_MAX, (eu, ev)


def test_one_cliff_per_tile_fails_even_beside_one_big_step():
    """A ramp with a cliff at the wrap, plus a single large step inside the tile: comparing with the LARGEST interior
    change would let the cliff through; the EDGE_RANK-th largest does not."""
    u, v = grid()
    img = 0.6 * (u / T) + np.where(u > T / 2, 0.3, 0.0)        # one 0.3 step mid-tile, then a 0.9 cliff at the wrap
    assert not seams.edge_report(img)["edge_pass"], seams.edge_ratio(img)


def test_a_joint_between_pixel_centres_counts_like_one_on_a_boundary():
    """Boards of alternating colour, box-filtered like the renderer. The edge on the tile wrap sits on a pixel boundary
    (its whole step in one column pair); the others fall between pixel centres (each step split over two pairs). A
    one-pixel step compares the wrap with half-steps (cedar scored 1.9 that way); the two-pixel change does not."""
    n, boards, sub = 1001, 4, 16          # 250.25 px a board (1.5 m, as concrete_slab): inner edges land mid-pixel
    x = (np.arange(n * sub) + 0.5) / (n * sub) * T
    row = np.where(np.floor(x / (T / boards)) % 2 == 0, 0.3, 0.7).reshape(n, sub).mean(axis=1)
    img = np.tile(row, (64, 1))
    one_px = np.abs(np.diff(row))
    assert abs(row[-1] - row[0]) > 1.5 * np.sort(one_px)[::-1][3], "the setup must fool a one-pixel step"
    eu, ev = seams.edge_ratio(img)
    assert eu <= seams.EDGE_RATIO_MAX and ev <= seams.EDGE_RATIO_MAX, (eu, ev)   # 1.33: three inner joints only


def test_shift_stats_and_noise_rule():
    u, v = grid()
    base = 0.5 + 0.4 * np.sin(2 * np.pi * u / T)
    stats = seams.shift_stats(base, 0.5 + 0.4 * np.sin(2 * np.pi * (u + T / 2) / T))
    assert stats["mean"] < 1e-9 and stats["line"] < 1e-9, stats
    assert seams.shift_report(stats, None, ["x"])["shift_rule"] == "absolute"
    noisy = {"mean": 0.02, "line": 0.04, "p99": 0.1}
    assert seams.shift_report(noisy, {"mean": 0.015, "line": 0.03, "p99": 0.1}, ["x"])["shift_rule"] == "noise_floor"
    assert not seams.shift_report(noisy, {"mean": 0.015, "line": 0.02, "p99": 0.1}, ["x"])["shift_pass"]
    assert not seams.shift_report({"mean": 0.05, "line": 0.06, "p99": 0.1},
                                  {"mean": 0.015, "line": 0.03, "p99": 0.1}, ["x"])["shift_pass"]
    ramp = seams.shift_stats(u / T, (u + T / 2) / T)           # a ramp does not repeat
    assert ramp["mean"] > 0.1, ramp


def test_localised_seam_is_caught_by_the_line_test():
    """A 2 cm line once per tile at 0.4 contrast: 0.33% of the pixels, so the mean (~0.001) passes; the line can't."""
    u, v = grid()
    rng = np.random.default_rng(7)
    base = 0.5 + 0.02 * rng.standard_normal((N, N))
    shifted = np.roll(base, (-(N // 2), -(N // 2)), axis=(0, 1)).copy()
    shifted[:, 100] += 0.4                                       # 6 m / 256 px = 2.3 cm: one column
    stats = seams.shift_stats(base, shifted)
    assert stats["mean"] < seams.SHIFT_MEAN_MAX, stats
    assert not seams.shift_report(stats, None, ["x"])["shift_pass"], stats


def test_worst_channel_counts_not_the_average():
    """ORM with constant roughness and metallic: a 0.02 difference in AO alone must not be diluted to 0.007."""
    u, v = grid()
    base = np.dstack([0.5 + 0.4 * np.sin(2 * np.pi * u / T), np.full((N, N), 0.6), np.zeros((N, N))])
    shifted = np.roll(base, (-(N // 2), -(N // 2)), axis=(0, 1)).copy()
    shifted[..., 0] += 0.02
    stats = seams.shift_stats(base, shifted)
    assert abs(stats["mean"] - 0.02) < 1e-9 and not seams.shift_report(stats, None, ["AO", "R", "M"])["shift_pass"]


def test_targets_are_the_25_reachable_sets():
    names = [t.name for t in targets(STYLES)]
    assert len(names) == 25, names
    plain = {"kurinuki", "charred_wood", "standing_seam", "ledgestone_warm", "steel", "copper_roof", "rigidized_bronze",
             "ledgestone_cool", "cedar", "deck_boards", "glass", "concrete", "concrete_slab", "timber", "board_batten",
             "glass_tinted", "sod_roof", "beach", "flagstone", "gravel", "water", "madrone_bark", "leaves"}
    assert plain <= set(names), plain - set(names)
    assert sorted(n.split("__")[0] for n in names if "__" in n) == ["meadow", "stucco"]
    assert "stucco" not in names and "meadow" not in names
    assert len(targets(STYLES, ("kurinuki_shino", "rigidized_metal"))) == 27


def test_variant_names_are_stable_and_param_sensitive():
    a = variant_name("stucco", {"Color": [0.7, 0.6, 0.5, 1.0]})
    assert a == variant_name("stucco", {"Color": [0.7, 0.6, 0.5, 1.0]})
    assert a == variant_name("stucco", {"Color": [0.7, 0.6, 0.5, 1]}), "1 and 1.0 must name the same variant"
    assert a != variant_name("stucco", {"Color": [0.7, 0.6, 0.51, 1.0]})
    assert variant_name("stucco", {}) == "stucco"
    assert variant_name("m", {"a": 1, "b": 2}) == variant_name("m", {"b": 2.0, "a": 1.0})
    assert split_spec({"material": {"material": "stucco", "params": {"x": 1}}}) == ("stucco", {"x": 1})
    names = {t.name for t in targets(STYLES)}
    assert {"stucco__aa9d13", "meadow__63c904"} <= names, "today's variant names are unchanged"


def test_a_name_collision_raises():
    import islandale3d.bake.targets as tg
    styles = {"site": {"terrain": {"material": "meadow", "params": {"G": 1}},
                       "earthworks": {"material": "meadow", "params": {"G": 2}}}}
    real = tg.variant_name
    try:
        tg.variant_name = lambda key, params: key + "__same"      # force two different params onto one name
        tg.targets(styles)
    except ValueError as e:
        assert "two materials" in str(e)
    else:
        raise AssertionError("a collision must raise")
    finally:
        tg.variant_name = real
    assert len(targets({"site": {"terrain": {"material": "meadow", "params": {"G": 1}},
                                 "earthworks": {"material": "meadow", "params": {"G": 1.0}}}})) == 1


def test_blends_name_both_layers():
    b = blends(STYLES)
    w, t = b["elders_wainscot"], b["terrain"]
    assert w["rule"] == "below_world_z" and w["lower"] == "ledgestone_cool" and w["upper"].startswith("stucco__")
    assert w["height_m"] == 0.9
    assert t["rule"] == "z_smoothstep" and t["lower"] == "beach" and t["upper"].startswith("meadow__")
    assert {w["upper"], w["lower"], t["upper"], t["lower"]} <= {x.name for x in targets(STYLES)}


def test_preview_downsample_never_trims_the_tile():
    from islandale3d.bake import LIT_TILE, PREVIEW_TILE, _downsample
    img = np.arange(16.0).reshape(4, 4)
    assert np.allclose(_downsample(img, 2), [[2.5, 4.5], [10.5, 12.5]])
    for res in (512, 1024, 2048, 4096):
        assert res % PREVIEW_TILE == 0 and (res <= LIT_TILE or res % LIT_TILE == 0)
    try:
        _downsample(np.zeros((12, 12)), 5)
    except ValueError:
        return
    raise AssertionError("a size that doesn't divide the tile must be refused")


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
