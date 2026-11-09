"""Real bakes at 256 px: a seamless material passes, a non-repeating one fails, a flat colour comes out exact.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
        -P tools/blender/tests/test_bake_blender.py
About a minute (longer on a cold Metal shader cache). Writes only to a temporary folder."""
import pathlib
import sys
import tempfile
import traceback

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from islandale3d.bake import bake_set, encode  # noqa: E402
from islandale3d.bake.targets import Target  # noqa: E402
from islandale3d.materials import build  # noqa: E402
from islandale3d.materials.common import OUTPUTS, TILE_DEFAULT, math, new_group, node, pbr_material  # noqa: E402

RES, SAMPLES = 256, 16
FLAT_COLOR = (0.5, 0.25, 0.1)


def flat_material():
    """Constant outputs and no Tile input: Base Color FLAT_COLOR, Roughness 0.3, Metallic 1, no relief."""
    ng, nodes, links, gin, gout = new_group("IS Test Flat", rebuild=True)
    gout.inputs["Base Color"].default_value = (*FLAT_COLOR, 1.0)
    gout.inputs["Roughness"].default_value = 0.3
    gout.inputs["Metallic"].default_value = 1.0
    return pbr_material("M_TestFlat", ng, 0.0, rebuild=True)


def ramp_material(period_tiles):
    """Height and colour climb and drop back every period_tiles x Tile. At 1.0 the material repeats every Tile but with a
    cliff on the tile edge (only the edge check can see it); at 0.9 it repeats at the wrong period (the shift check)."""
    ng, nodes, links, gin, gout = new_group(
        f"IS Test Ramp {period_tiles}", inputs=(("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0),), rebuild=True)
    sep = node(nodes, "ShaderNodeSeparateXYZ")
    links.new(gin.outputs["Vector"], sep.inputs[0])
    period = math(nodes, links, "MULTIPLY", gin.outputs["Tile"], period_tiles)
    frac = math(nodes, links, "FRACT", math(nodes, links, "DIVIDE", sep.outputs["X"], period))
    links.new(math(nodes, links, "MULTIPLY", frac, 0.05), gout.inputs["Height"])
    comb = node(nodes, "ShaderNodeCombineColor")
    for i in range(3):
        links.new(frac, comb.inputs[i])
    links.new(comb.outputs["Color"], gout.inputs["Base Color"])
    return pbr_material(f"M_TestRamp_{period_tiles}", ng, 0.05, rebuild=True)


TILE_INPUT = ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0)


def _frac(nodes, links, coord, period):
    return math(nodes, links, "FRACT", math(nodes, links, "DIVIDE", coord, period))


def orientation_material():
    """Base Color = (frac(u / Tile), frac(v / Tile), 0): red grows to the right, green grows upward."""
    ng, nodes, links, gin, gout = new_group("IS Test Orientation", inputs=(TILE_INPUT,), rebuild=True)
    sep = node(nodes, "ShaderNodeSeparateXYZ")
    links.new(gin.outputs["Vector"], sep.inputs[0])
    comb = node(nodes, "ShaderNodeCombineColor")
    links.new(_frac(nodes, links, sep.outputs["X"], gin.outputs["Tile"]), comb.inputs[0])
    links.new(_frac(nodes, links, sep.outputs["Y"], gin.outputs["Tile"]), comb.inputs[1])
    links.new(comb.outputs["Color"], gout.inputs["Base Color"])
    return pbr_material("M_TestOrientation", ng, 0.0, rebuild=True)


def opacity_material(tag, alpha_fn):
    """No relief, a varying Alpha (like leaves or glass): alpha_fn(nodes, links, u, tile) -> socket."""
    ng, nodes, links, gin, gout = new_group(f"IS Test Opacity {tag}", inputs=(TILE_INPUT,),
                                            outputs=OUTPUTS + (("Alpha", "NodeSocketFloat"),), rebuild=True)
    sep = node(nodes, "ShaderNodeSeparateXYZ")
    links.new(gin.outputs["Vector"], sep.inputs[0])
    gout.inputs["Base Color"].default_value = (0.3, 0.4, 0.2, 1.0)
    links.new(alpha_fn(nodes, links, sep.outputs["X"], gin.outputs["Tile"]), gout.inputs["Alpha"])
    return pbr_material(f"M_TestOpacity_{tag}", ng, 0.0, rebuild=True)


def bake(mat, name, out):
    return bake_set(mat, Target(name, name, {}, ["test"]), out, RES, SAMPLES, SAMPLES, True)


def test_seamless_noise_passes(out):
    mat = build("tile_noise")
    mat["is_relief_m"] = 0.05                     # exercise the height and normal path
    e = bake(mat, "tile_noise", out)
    assert e["pass"], e["seams"]
    for label, bits in (("BC", 8), ("ORM", 8), ("H", 16), ("N", 16)):
        p = out / e["maps"][label]
        assert p.exists() and p.read_bytes()[24] == bits, (label, bits)
        assert encode.read_png(p).shape[:2] == (RES, RES)
    assert e["ao_source"] == "height"


def test_cliff_on_the_tile_edge_fails_the_edge_check(out):
    e = bake(ramp_material(1.0), "ramp_tile", out)
    assert not e["pass"]
    assert not e["seams"]["edge"]["H"]["edge_pass"], e["seams"]["edge"]["H"]
    assert not e["seams"]["edge"]["BC"]["edge_pass"], e["seams"]["edge"]["BC"]


def test_wrong_period_fails_the_shift_check(out):
    e = bake(ramp_material(0.9), "ramp_09", out)
    assert not e["pass"]
    assert not e["seams"]["shift"]["height"]["shift_pass"], e["seams"]["shift"]["height"]
    assert not e["seams"]["shift"]["color"]["shift_pass"], e["seams"]["shift"]["color"]


def test_orientation_u_right_v_up(out):
    """The PNG's top-left is u = 0, v = Tile: a u or v flip anywhere in the chain fails here."""
    e = bake(orientation_material(), "orient", out)
    file_rows = np.flipud(encode.read_png(out / e["maps"]["BC"]))      # back to file order: row 0 = the top row
    lo, hi = encode.linear_to_srgb(np.array([0.5 / RES, 1 - 0.5 / RES]))
    tol = 2.0 / 255
    corners = {"top-left": (file_rows[0, 0], (lo, hi)), "top-right": (file_rows[0, -1], (hi, hi)),
               "bottom-left": (file_rows[-1, 0], (lo, lo)), "bottom-right": (file_rows[-1, -1], (hi, lo))}
    for where, (px, (r, g)) in corners.items():
        assert abs(px[0] - r) < tol and abs(px[1] - g) < tol and px[2] < tol, (where, px, (r, g))


def test_opacity_only_material_is_shift_checked(out):
    def seamless(nodes, links, u, tile):
        ang = math(nodes, links, "MULTIPLY", math(nodes, links, "DIVIDE", u, tile), 6.283185307179586)
        return math(nodes, links, "MULTIPLY_ADD", math(nodes, links, "SINE", ang), 0.4)

    def wrong_period(nodes, links, u, tile):
        return _frac(nodes, links, u, math(nodes, links, "MULTIPLY", tile, 0.9))

    good = bake(opacity_material("good", seamless), "opacity", out)
    assert good["seams"]["shift"]["height"]["channels"] == ["Alpha"], good["seams"]["shift"]
    assert good["pass"] and "Opacity" in good["maps"], good["seams"]
    bad = bake(opacity_material("bad", wrong_period), "opacity_bad", out)
    assert not bad["seams"]["shift"]["height"]["shift_pass"], bad["seams"]["shift"]["height"]
    flat = bake(flat_material(), "opacity", out)                       # same set name, no opacity any more
    assert "Opacity" not in flat["maps"] and not (out / "opacity" / "T_opacity_Opacity.png").exists()


def test_skipped_shift_check_is_not_a_pass(out):
    e = bake_set(build("tile_noise"), Target("unchecked", "tile_noise", {}, ["test"]), out, RES, SAMPLES, SAMPLES, False)
    assert e["status"] == "unchecked" and e["pass"] is False and e["seams"]["shift_checked"] is False


def test_flat_colour_is_exact_and_constants_noted(out):
    e = bake(flat_material(), "flat", out)
    bc = encode.read_png(out / e["maps"]["BC"])
    want = encode.linear_to_srgb(np.array(FLAT_COLOR))
    assert np.abs(bc - want).max() <= 1.0 / 255 + 1e-9, (bc.mean(axis=(0, 1)), want)
    orm = encode.read_png(out / e["maps"]["ORM"])
    assert np.abs(orm.mean(axis=(0, 1)) - (1.0, 0.3, 1.0)).max() < 1.0 / 255 + 1e-9, orm.mean(axis=(0, 1))
    assert e["constants"] == {"Roughness": 0.3, "Metallic": 1.0}, e["constants"]
    n = encode.read_png(out / e["maps"]["N"])
    assert np.abs(n - (0.5, 0.5, 1.0)).max() < 1e-4
    assert e["pass"] and e["ue"]["metallic_present"]


def main():
    tests = [(k, f) for k, f in globals().items() if k.startswith("test_") and callable(f)]
    failed = 0
    with tempfile.TemporaryDirectory() as d:
        for name, fn in tests:
            try:
                fn(pathlib.Path(d))
                print(f"ok   {name}")
            except Exception:  # noqa: BLE001 - report every failure, then exit non-zero
                failed += 1
                print(f"FAIL {name}\n{traceback.format_exc()}")
    print(f"{len(tests) - failed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
