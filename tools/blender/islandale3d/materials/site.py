"""The ground round the Islandale cabins on Mud Bay, Lopez Island: everything that is not a building.

meadow     The island's summer meadow seen from 2-50 m: dry golden grass matted in every direction, greener patches, moss in
           the hollows, bare soil and the odd lichened rock. Grass blades will be scattered on top later, so this is the
           layer under them. "Green/Soil/Rock Amount" set the mix, "Patch Size" the size of the green and gold patches.
beach      The Mud Bay shore: packed pebbles and cobbles of the island's mixed rock, shell grit, damp sand between them and
           strands of drift kelp. "Wetness" darkens and glosses it, "Pebble Amount" trades stones for sand.
gravel     Crushed grey driveway gravel (#8c8c86 to #b8a888): angular faceted stones in three sizes over compacted fines,
           pressed in and dusty where tyres and feet wear it ("Wear").
flagstone  The firepit patio: irregular cleft sandstone slabs 40-90 cm ("Slab Size") with broken arrises, terraced faces,
           lichen, and gravel and moss in the joints ("Joint Width", "Moss Amount").
water      Salish Sea water near the shore: deep blue-green, wind ripples from a metre down to capillary wavelets, with glassy
           and ruffled (cat's-paw) patches ("Wind", "Gust Size"). Opaque: its look is the sky it reflects.
sod_roof   A green roof of sedum mats and grass tufts (#5f803d) in clumps of different species, red with the season
           ("Red Amount"), with bare growing medium showing through ("Bare Amount").

All are pure functions of UVMeters and repeat exactly every Tile metres (default 6) in u and v."""
from ._site_nodes import Graph, srgb
from .common import TILE_DEFAULT, new_group, pbr_material

TILE = ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0)
SEED = ("Seed", "NodeSocketFloat", 0.0, 0.0, 1000.0)


def _color(name, hexcode):
    return (name, "NodeSocketColor", srgb(hexcode))


def _amount(name, default, lo=0.0, hi=1.0):
    return (name, "NodeSocketFloat", default, lo, hi)


def _finish(g, color, rough, height, ao):
    g.output("Base Color", color)
    g.output("Roughness", rough)
    g.output("Metallic", 0.0)
    g.output("Height", height)
    g.output("AO", ao)


def _group(title, inputs, rebuild):
    """new_group with the site materials' outputs (the standard four plus AO); Graph or None if it already exists."""
    outputs = (("Base Color", "NodeSocketColor"), ("Roughness", "NodeSocketFloat"), ("Metallic", "NodeSocketFloat"),
               ("Height", "NodeSocketFloat"), ("AO", "NodeSocketFloat"))
    ng, nodes, links, gin, gout = new_group(f"IS {title}", inputs=(TILE, SEED) + tuple(inputs), outputs=outputs,
                                            rebuild=rebuild)
    return ng, (Graph(nodes, links, gin, gout) if nodes else None)


def _profile(g, t):
    """Quarter-circle shoulder: 0 at t = 0 rising to 1 at t = 1 (t clamped), for rounded stone edges."""
    t = g.sat(t)
    return g.op("SQRT", g.mul(t, g.sub(2.0, t)))


def _round_stones(g, p, scale, fill, height, gap=0.05, shoulder=0.3, salt=(0, 0, 0, 0)):
    """Packed rounded stones from a 4D Voronoi of `scale` cells per metre, `fill` of the cells occupied.
    Returns (height m, per-stone random colour)."""
    q = g.offset(p, salt)
    f1 = g.voronoi(q, scale, "F1")
    edge = g.voronoi(q, scale, "DISTANCE_TO_EDGE")
    rr, rg, _ = g.split(f1.outputs["Color"])
    present = g.op("LESS_THAN", rr, fill)
    shape = g.mul(_profile(g, g.div(g.sub(edge.outputs[0], gap), shoulder)),
                  g.madd(g.op("POWER", f1.outputs[0], 2.0), -0.45, 1.0))           # a little domed
    size = g.mul(present, g.mul(g.madd(rg, 0.5, 0.5), height))
    return g.mul(g.hi(shape, 0.0), size), f1.outputs["Color"]


def _angular_stones(g, p, scale, fill, height, salt=(0, 0, 0, 0)):
    """Crushed rock: Voronoi cells with steep sides and two random facet planes on top, so each stone has a sharp
    ridge. Returns (height m, per-stone random colour)."""
    q = g.offset(p, salt)
    f1 = g.voronoi(q, scale, "F1")
    edge = g.voronoi(q, scale, "DISTANCE_TO_EDGE")
    rnd = f1.outputs["Color"]
    rr, rg, rb = g.split(rnd)
    present = g.op("LESS_THAN", rr, fill)
    toward = g.vop("SUBTRACT", q.vec, f1.outputs["Position"])
    facet1 = g.vop("DOT_PRODUCT", toward, g.vop("SUBTRACT", rnd, (0.5, 0.5, 0.5)))
    facet2 = g.vop("DOT_PRODUCT", toward, g.vop("SUBTRACT", g.combine(rb, rr, rg), (0.5, 0.5, 0.5)))
    top = g.madd(rg, 0.3, 0.62)
    slope = g.mul(scale, 1.6)
    planes = g.lo(g.madd(facet1, g.mul(slope, -1.0), top), g.madd(facet2, slope, top))
    side = g.mul(g.sub(edge.outputs[0], 0.03), 3.2)
    shape = g.hi(g.lo(side, planes), 0.0)
    return g.mul(g.mul(shape, present), height), rnd


def _layered(g, base, layers):
    """Stack (height, colour, roughness) layers: each shows where it stands highest. Returns the composite triple."""
    h, col, rough = base
    for lh, lcol, lrough in layers:
        top = g.op("GREATER_THAN", lh, h)
        col = g.mix(top, col, lcol)
        rough = g.lerp(top, rough, lrough)
        h = g.hi(h, lh)
    return h, col, rough


# --------------------------------------------------------------------------------------------------------------------
# meadow

MEADOW_RELIEF = 0.058         # m: the tallest rock
ROCK_HEIGHT = 0.05


def _meadow_cover(g, p):
    """Masks 0..1: green patches, soil, moss; plus the fibre (blade) and tussock fields."""
    blades = g.fibres(3.5, 85.0, sharpness=0.84)
    fine, _ = g.noise(g.offset(p, (2.3, 7.1, 0.4, 3.3)), 9.0, 3, 0.6)
    patch, _ = g.noise(p, g.div(1.0, g["Patch Size"]), 5, 0.6)
    patch = g.madd(g.sub(fine, 0.5), 0.12, patch)                          # ragged, grassy borders
    green_at = g.madd(g["Green Amount"], -0.32, 0.66)
    green = g.remap(patch, g.sub(green_at, 0.03), g.add(green_at, 0.03), smooth=True)
    soil_n, _ = g.noise(g.offset(p, (8.4, 1.2, 5.5, 0.9)), 1.3, 5, 0.65)
    soil_at = g.madd(g["Soil Amount"], -0.4, 0.72)
    soil = g.remap(g.madd(g.sub(fine, 0.5), 0.1, g.madd(green, -0.06, soil_n)), soil_at, g.add(soil_at, 0.04),
                   smooth=True)
    tuss = g.voronoi(g.offset(p, (0.7, 4.4, 9.1, 2.6)), 6.5, "SMOOTH_F1")
    tussock = g.remap(tuss.outputs[0], 0.15, 0.75, 1.0, 0.0, smooth=True)
    moss_n, _ = g.noise(g.offset(p, (5.9, 6.6, 1.8, 7.2)), 2.6, 4, 0.6)
    moss = g.mul(g.step(moss_n, 0.5, 0.6), g.sub(1.0, g.mul(tussock, 0.7)))
    return green, soil, moss, blades, tussock, fine


def _meadow_rocks(g, p):
    """The odd rock: in a few Voronoi cells, an irregular dome round the feature point. Returns (height m, colour)."""
    q = g.offset(p, (13.1, 2.2, 6.4, 4.8))
    vr = g.voronoi(q, 1.4, "F1")
    rr, rg, _ = g.split(vr.outputs["Color"])
    wobble, _ = g.noise(g.offset(p, (3.3, 9.9, 1.1, 0.2)), 11.0, 3, 0.6)
    d = g.madd(g.sub(wobble, 0.5), 0.09, vr.outputs[0])
    radius = g.madd(rg, 0.16, 0.12)
    dome = _profile(g, g.div(g.sub(radius, d), radius))
    rock_h = g.mul(g.mul(dome, g.op("LESS_THAN", rr, g["Rock Amount"])), ROCK_HEIGHT)
    lumps, _ = g.noise(g.offset(p, (1.9, 4.2, 8.8, 6.1)), 25.0, 4, 0.55)
    rock_h = g.mul(rock_h, g.madd(lumps, 0.35, 0.82))
    lich = g.voronoi(g.offset(p, (7.7, 3.4, 2.1, 5.0)), 30.0, "F1")
    lr, _, _ = g.split(lich.outputs["Color"])
    spot = g.mul(g.remap(lich.outputs[0], 0.25, 0.4, 1.0, 0.0), g.op("LESS_THAN", lr, 0.35))
    col = g.tint(g["Rock Color"], g.madd(lumps, 0.4, 0.8))
    col = g.mix(g.mul(spot, 0.8), col, g.mix(g.step(lr, 0.28, 0.3), srgb("#b2b29a"), srgb("#bf8a3c")))
    return rock_h, col


def meadow(rebuild=False, **params):
    ng, g = _group("Meadow", (
        _color("Straw Color", "#b09862"), _color("Green Color", "#6c7a3a"), _color("Moss Color", "#55612b"),
        _color("Soil Color", "#6b5842"), _color("Rock Color", "#8a877f"),
        _amount("Green Amount", 0.35), _amount("Soil Amount", 0.15), _amount("Rock Amount", 0.05),
        _amount("Patch Size", 2.5, 0.3, 20.0)), rebuild)
    if g:
        p = g.point()
        green, soil, moss, blades, tussock, fine = _meadow_cover(g, p)
        dry, _ = g.noise(g.offset(p, (4.0, 2.0, 7.0, 1.0)), 0.9, 4, 0.6)
        straw = g.mix(g.remap(dry, 0.35, 0.65), g.tint(g["Straw Color"], 0.78), srgb("#c3b07c"))
        thatch = g.tint(g.mix(0.5, g["Straw Color"], g["Soil Color"]), 0.55)
        grass = g.mix(green, straw, g.mix(g.remap(dry, 0.4, 0.6), g["Green Color"], g.tint(g["Green Color"], 1.2)))
        under = g.mix(green, thatch, g.tint(g["Green Color"], 0.5))
        cover = g.mix(g.madd(blades, 0.75, g.mul(fine, 0.35)), under, grass)
        cover = g.mix(g.mul(moss, 0.85), cover, g.tint(g["Moss Color"], g.madd(fine, 0.5, 0.75)))
        bare = g.mul(soil, g.sub(1.0, g.mul(blades, 0.6)))
        cover = g.mix(bare, cover, g.tint(g["Soil Color"], g.madd(fine, 0.5, 0.75)))
        ground_h = g.mul(g.total(g.mul(tussock, 0.012), g.mul(blades, 0.006), g.mul(g.sub(1.0, soil), 0.006),
                                 g.mul(fine, 0.004)), g.sub(1.0, g.mul(soil, 0.5)))
        rock_h, rock_col = _meadow_rocks(g, p)
        is_rock = g.op("GREATER_THAN", rock_h, ground_h)
        rough = g.lerp(bare, g.lerp(green, 0.82, 0.74), 0.92)
        _finish(g, g.mix(is_rock, cover, rock_col), g.lerp(is_rock, rough, 0.66), g.hi(rock_h, ground_h),
                g.lerp(is_rock, g.madd(g.hi(blades, tussock), 0.4, 0.55), 1.0))
    return pbr_material("M_Meadow", ng, MEADOW_RELIEF, params, rebuild=rebuild)


# --------------------------------------------------------------------------------------------------------------------
# beach

BEACH_RELIEF = 0.05
PEBBLE_PALETTE = [(0.0, srgb("#4b4a47")), (0.18, srgb("#6f6d68")), (0.36, srgb("#7d8188")), (0.52, srgb("#9a8a70")),
                  (0.66, srgb("#8a6c55")), (0.78, srgb("#6c705f")), (0.9, srgb("#a7a399")), (0.97, srgb("#cdc8bc"))]
SHELL_PALETTE = [(0.0, srgb("#d8d2c4")), (0.45, srgb("#c9c1b2")), (0.7, srgb("#8d8aa0")), (0.85, srgb("#5d5a6e")),
                 (0.95, srgb("#e6e0d2"))]


def _beach_stones(g, p, band):
    """Cobbles, pebbles, grit and shell bits, each (height, colour, roughness)."""
    amount = g.mul(g["Pebble Amount"], band)
    cob_h, cob_r = _round_stones(g, p, 9.0, g.mul(amount, 0.42), 0.042, salt=(1.3, 0.2, 4.4, 2.0))
    peb_h, peb_r = _round_stones(g, p, 27.0, g.mul(amount, 0.8), 0.016, salt=(6.1, 3.3, 0.8, 9.2))
    grit_h, grit_r = _round_stones(g, p, 85.0, 0.65, 0.0055, gap=0.08, shoulder=0.4, salt=(2.4, 8.8, 5.1, 7.3))
    shell_h, shell_r = _angular_stones(g, p, 24.0, 0.13, 0.0035, salt=(9.4, 4.1, 3.7, 1.6))
    speck, _ = g.noise(g.offset(p, (0.3, 0.9, 6.6, 4.2)), 260.0, 2, 0.6)

    def stone_col(rnd, mix_tint):
        _, _, rb = g.split(rnd)
        col = g.mix(0.35, g.ramp(rb, PEBBLE_PALETTE, "CONSTANT"), g["Pebble Color"])
        return g.tint(col, g.madd(speck, mix_tint, 1.0 - 0.5 * mix_tint))

    _, _, sb = g.split(shell_r)
    return [(cob_h, stone_col(cob_r, 0.25), 0.5), (peb_h, stone_col(peb_r, 0.2), 0.45),
            (grit_h, stone_col(grit_r, 0.1), 0.6),
            (shell_h, g.mix(0.25, g.ramp(sb, SHELL_PALETTE), g["Shell Color"]), 0.4)]


def _kelp(g, p):
    """Drift kelp and eelgrass: long ribbons in a few wrack patches. Returns (cover 0..1, colour)."""
    strands = g.fibres(1.1, 16.0, sharpness=0.8, salt=4.2, pairs=((2, 1), (1, 0)))
    patch, _ = g.noise(g.offset(p, (3.9, 7.4, 2.8, 0.6)), 0.45, 3, 0.5)
    kelp_at = g.madd(g["Kelp Amount"], -0.3, 0.72)
    cover = g.mul(strands, g.remap(patch, kelp_at, g.add(kelp_at, 0.06), smooth=True))
    shade, _ = g.noise(g.offset(p, (8.2, 0.1, 3.3, 5.5)), 3.0, 2, 0.5)
    return cover, g.mix(shade, g.tint(g["Kelp Color"], 0.6), g.mix(0.4, g["Kelp Color"], srgb("#8a7a3a")))


def beach(rebuild=False, **params):
    ng, g = _group("Beach", (
        _color("Sand Color", "#9a8b70"), _color("Pebble Color", "#7a776f"), _color("Shell Color", "#d6cfc0"),
        _color("Kelp Color", "#4a4424"),
        _amount("Wetness", 0.5), _amount("Pebble Amount", 0.65), _amount("Kelp Amount", 0.3)), rebuild)
    if g:
        p = g.point()
        band_n, _ = g.noise(g.offset(p, (5.5, 5.5, 1.1, 2.2)), 0.5, 4, 0.55)
        band = g.remap(band_n, 0.35, 0.6, 0.25, 1.0, smooth=True)
        grain, _ = g.noise(g.offset(p, (2.2, 6.6, 9.9, 3.1)), 140.0, 2, 0.6)
        lumps, _ = g.noise(g.offset(p, (7.0, 3.0, 2.0, 8.0)), 4.0, 3, 0.5)
        sand_h = g.madd(lumps, 0.008, g.mul(grain, 0.0015))
        sand = (sand_h, g.tint(g["Sand Color"], g.madd(grain, 0.3, 0.85)), 0.88)
        h, col, rough = _layered(g, sand, _beach_stones(g, p, band))
        kelp, kelp_col = _kelp(g, p)
        wet_n, _ = g.noise(g.offset(p, (1.0, 9.0, 4.0, 6.0)), 0.35, 3, 0.5)
        wet = g.remap(g.madd(g["Wetness"], 0.5, g.sub(wet_n, 0.5)), 0.2, 0.55, smooth=True)
        low = g.remap(h, 0.004, 0.012, 1.0, 0.4)                               # sand between stones stays damp
        wet = g.mul(wet, low)
        col = g.mix(1.0, col, g.combine(g.madd(wet, -0.42, 1.0), g.madd(wet, -0.4, 1.0), g.madd(wet, -0.36, 1.0)),
                    blend="MULTIPLY")
        rough = g.lerp(g.mul(wet, 0.85), rough, 0.14)
        col = g.mix(kelp, col, kelp_col)
        _finish(g, col, g.lerp(kelp, rough, 0.3), g.madd(kelp, 0.004, h),
                g.remap(h, 0.0, 0.02, 0.55, 1.0))
    return pbr_material("M_Beach", ng, BEACH_RELIEF, params, rebuild=rebuild)


# --------------------------------------------------------------------------------------------------------------------
# gravel

GRAVEL_RELIEF = 0.016


def gravel(rebuild=False, **params):
    ng, g = _group("Gravel", (
        _color("Dark Color", "#8c8c86"), _color("Light Color", "#b8a888"), _color("Fines Color", "#9e9682"),
        _amount("Wear", 0.5), _amount("Stone Size", 0.022, 0.005, 0.1)), rebuild)
    if g:
        p = g.point()
        wear_n, _ = g.noise(g.offset(p, (2.9, 4.7, 8.1, 0.5)), 0.45, 4, 0.6)
        wear_at = g.madd(g["Wear"], -0.3, 0.66)
        wear = g.remap(wear_n, g.sub(wear_at, 0.06), g.add(wear_at, 0.06), smooth=True)
        loose = g.madd(wear, -0.7, 1.0)
        size = g.div(1.0, g["Stone Size"])
        press = g.madd(wear, -0.5, 1.0)                                        # stones pushed into the fines
        speck, _ = g.noise(g.offset(p, (6.3, 1.4, 0.2, 7.7)), 300.0, 2, 0.6)
        layers = []
        for k, (rel_size, fill, rel_h) in enumerate(((0.75, 0.55, 0.55), (1.3, 0.75, 0.38), (2.6, 0.85, 0.2))):
            sh, rnd = _angular_stones(g, p, g.mul(size, rel_size), g.mul(loose, fill),
                                      g.mul(g.mul(g["Stone Size"], rel_h), press), salt=(3.1 * k, 1.7 * k, 0.9, 2.3 * k))
            rr, rg, rb = g.split(rnd)
            col = g.mix(g.op("POWER", rb, 0.8), g["Dark Color"], g["Light Color"])
            col = g.mix(g.step(rg, 0.93, 0.94), col, srgb("#8d6c52"))
            col = g.mix(g.remap(rg, 0.05, 0.06, 1.0, 0.0), col, srgb("#cfc8b8"))
            col = g.tint(g.mix(g.mul(wear, 0.4), col, g["Fines Color"]), g.madd(speck, 0.25, 0.88))
            layers.append((sh, col, g.madd(rr, 0.15, 0.7)))
        dust, _ = g.noise(g.offset(p, (0.6, 0.6, 3.6, 3.6)), 40.0, 4, 0.6)
        fines = (g.mul(dust, 0.003), g.tint(g["Fines Color"], g.madd(dust, 0.3, 0.8)), g.lerp(wear, 0.92, 0.82))
        h, col, rough = _layered(g, fines, layers)
        _finish(g, col, rough, h, g.remap(h, 0.0, 0.008, 0.5, 1.0))
    return pbr_material("M_Gravel", ng, GRAVEL_RELIEF, params, rebuild=rebuild)


# --------------------------------------------------------------------------------------------------------------------
# flagstone

FLAG_TOP = 0.03               # m: slab face above the joint floor
FLAG_RELIEF = 0.042
TERRACES = 10.0               # cleft layers across the noise range: about 1.2 mm steps on the face
ARRIS = 0.012                 # m: width of the broken, rounded slab edge


def _slab_height(g, p, c, half_joint):
    """Slab surface (m) and the distance in from its broken edge (m)."""
    chip, _ = g.noise(g.offset(p, (4.1, 0.7, 2.2, 9.3)), 14.0, 4, 0.6)
    rim = g.sub(g.madd(g.sub(chip, 0.5), 0.02, c.edge), half_joint)
    _, rc = g.white(c.cell_id, g.add(g.seed, 0.37))
    rx, ry, rz = g.split(rc)
    relx, rely, _ = g.split(c.rel)
    tilt = g.mul(g.madd(g.sub(rx, 0.5), relx, g.mul(g.sub(ry, 0.5), rely)), 0.03)
    cleft, _ = g.noise(g.offset(p, (0.8, 6.1, 3.9, 2.7)), 2.6, 5, 0.55)
    ns = g.mul(cleft, TERRACES)
    floor = g.op("FLOOR", ns)
    terr = g.add(floor, g.step(g.sub(ns, floor), 0.72, 1.0))
    grain, _ = g.noise(g.offset(p, (2.5, 2.5, 7.5, 1.5)), 70.0, 3, 0.6)
    face = g.total(g.madd(g.sub(rz, 0.5), 0.006, FLAG_TOP), tilt, g.mul(g.sub(terr, TERRACES / 2), 0.0012),
                   g.mul(grain, 0.0008))
    return g.mul(face, g.step(rim, 0.0, ARRIS)), rim, terr


def _slab_color(g, p, c, rim):
    _, rc = g.white(c.cell_id, g.add(g.seed, 0.71))
    sx, sy, sz = g.split(rc)
    var = g["Color Variation"]
    hue = g.mix(sy, srgb("#9a978d"), srgb("#b08a62"))
    col = g.mix(g.mul(var, g.mul(sz, 0.6)), g["Stone Color"], hue)
    mottle, _ = g.noise(g.offset(p, (9.1, 2.3, 4.4, 8.6)), 4.0, 6, 0.6)
    col = g.tint(col, g.total(1.0, g.mul(g.sub(sx, 0.5), g.mul(var, 0.36)), g.mul(g.sub(mottle, 0.5), 0.3)))
    stain, _ = g.noise(g.offset(p, (1.4, 8.3, 6.2, 3.0)), 1.6, 4, 0.6)
    col = g.mix(g.mul(g.step(stain, 0.6, 0.72), 0.35), col, srgb("#9b7048"))
    lich = g.voronoi(g.offset(p, (3.6, 5.2, 0.9, 7.4)), 7.0, "F1")
    lr, lg, _ = g.split(lich.outputs["Color"])
    spot = g.mul(g.remap(lich.outputs[0], g.madd(lg, 0.12, 0.08), g.madd(lg, 0.12, 0.13), 1.0, 0.0),
                 g.op("LESS_THAN", lr, 0.22))
    col = g.mix(g.mul(spot, 0.75), col, g.mix(g.step(lr, 0.04, 0.05), srgb("#4a4a42"), srgb("#adae98")))
    return g.tint(col, g.remap(rim, 0.0, 0.05, 0.82, 1.0))


def _joint(g, p, rim):
    """Joint fill (gravel grit and soil) and moss: (height m, colour, moss mask)."""
    grit_h, grit_r = _round_stones(g, p, 110.0, 0.7, 0.005, gap=0.06, shoulder=0.4, salt=(4.6, 2.2, 8.1, 3.9))
    _, _, gb = g.split(grit_r)
    joint_col = g.tint(g["Joint Color"], g.madd(gb, 0.5, 0.75))
    moss_n, _ = g.noise(g.offset(p, (6.6, 0.4, 2.9, 5.8)), 1.7, 4, 0.6)
    reach = g.mul(g.step(moss_n, g.madd(g["Moss Amount"], -0.3, 0.62), 0.75), 0.06)
    moss = g.remap(rim, g.sub(reach, 0.01), g.add(reach, 0.005), 1.0, 0.0, smooth=True)
    moss = g.mul(moss, g.step(moss_n, g.madd(g["Moss Amount"], -0.35, 0.55), 0.6))
    cushion, _ = g.noise(g.offset(p, (2.0, 7.0, 1.0, 9.0)), 45.0, 4, 0.7)
    moss_col = g.tint(g.mix(cushion, g["Moss Color"], srgb("#7d8b3a")), g.madd(cushion, 0.5, 0.75))
    moss_h = g.mul(moss, g.madd(cushion, 0.01, 0.006))
    return g.add(grit_h, 0.004), joint_col, moss, moss_h, moss_col


def flagstone(rebuild=False, **params):
    ng, g = _group("Flagstone", (
        _color("Stone Color", "#b5a68c"), _color("Joint Color", "#6e6655"), _color("Moss Color", "#5a6a2c"),
        _amount("Slab Size", 0.62, 0.2, 2.0), _amount("Joint Width", 0.025, 0.005, 0.08),
        _amount("Moss Amount", 0.5), _amount("Color Variation", 0.5)), rebuild)
    if g:
        p = g.point()
        wu, wv = g.warp(p, 0.035, 2.2)
        c = g.cells(wu, wv, g["Slab Size"], randomness=0.95)
        slab_h, rim, _ = _slab_height(g, p, c, g.mul(g["Joint Width"], 0.5))
        joint_h, joint_col, moss, moss_h, moss_col = _joint(g, p, rim)
        on_slab = g.op("GREATER_THAN", slab_h, joint_h)
        h = g.hi(g.hi(slab_h, joint_h), g.add(joint_h, moss_h))
        h = g.add(h, g.mul(moss, g.mul(on_slab, 0.002)))
        col = g.mix(on_slab, joint_col, _slab_color(g, p, c, rim))
        col = g.mix(moss, col, moss_col)
        rough_n, _ = g.noise(g.offset(p, (3.0, 3.0, 3.0, 3.0)), 6.0, 3, 0.5)
        rough = g.lerp(moss, g.lerp(on_slab, 0.9, g.madd(rough_n, 0.16, 0.64)), 0.82)
        _finish(g, col, rough, h, g.lerp(on_slab, g.lerp(moss, 0.45, 0.7), g.remap(rim, 0.0, 0.03, 0.75, 1.0)))
    return pbr_material("M_Flagstone", ng, FLAG_RELIEF, params, rebuild=rebuild)


# --------------------------------------------------------------------------------------------------------------------
# water

SWELL, CHOP, CAPILLARY = 0.0035, 0.0012, 0.0004       # m: amplitudes of the ~1 m, ~20 cm and ~3 cm ripples
WATER_RELIEF = SWELL + 2 * CHOP + CAPILLARY


def water(rebuild=False, **params):
    ng, g = _group("Water", (
        _color("Water Color", "#16302d"), _color("Murk Color", "#2a3f33"),
        _amount("Wind", 0.5), _amount("Gust Size", 3.0, 0.5, 30.0)), rebuild)
    if g:
        p = g.point()
        gust_n, _ = g.noise(g.offset(p, (4.4, 1.2, 0.3, 6.6)), g.div(1.0, g["Gust Size"]), 3, 0.5)
        gust = g.step(gust_n, 0.4, 0.62)
        wind = g["Wind"]
        pw = g.dir_point(2, 1)                      # the wind blows along (2, 1): crests run across it
        swell, _ = g.noise(g.stretch(pw, 1.0 / 2.236, 0.35 / 2.236), 1.0, 3, 0.45)
        chop1, _ = g.noise(g.offset(g.stretch(pw, 5.5 / 2.236, 2.0 / 2.236), (1.0, 2.0, 3.0, 4.0)), 1.0, 3, 0.5)
        chop2, _ = g.noise(g.offset(g.stretch(g.point(), 4.5, 1.8), (6.0, 1.0, 2.0, 8.0)), 1.0, 3, 0.5)
        cap, _ = g.noise(g.offset(p, (2.0, 9.0, 5.0, 1.0)), 32.0, 3, 0.55)
        cap = g.ridge(cap)
        ruffle = g.mul(g.madd(gust, 0.75, 0.25), g.mul(wind, 2.0))
        h = g.total(g.mul(swell, SWELL), g.mul(g.add(chop1, chop2), g.mul(CHOP, g.madd(wind, 0.8, 0.6))),
                    g.mul(g.mul(cap, CAPILLARY), ruffle))
        murk, _ = g.noise(g.offset(p, (7.0, 7.0, 0.0, 2.0)), 0.25, 3, 0.5)
        col = g.mix(g.remap(murk, 0.35, 0.65, 0.0, 0.6), g["Water Color"], g["Murk Color"])
        _finish(g, col, g.lerp(g.mul(gust, wind), 0.02, 0.07), g.hi(g.lo(h, WATER_RELIEF), 0.0), 1.0)
    return pbr_material("M_Water", ng, WATER_RELIEF, params, rebuild=rebuild)


# --------------------------------------------------------------------------------------------------------------------
# sod roof

SOD_RELIEF = 0.05


def _sod_species(g, pw):
    """Each clump one species: a colour and whether it is grass. Returns (colour, grass 0/1, clump mound 0..1)."""
    clump = g.voronoi(pw, 4.5, "F1")
    s, cg, cb = g.split(clump.outputs["Color"])
    grass_to = g.mul(g["Grass Amount"], 0.5)
    red_to = g.add(grass_to, g.mul(g["Red Amount"], 0.5))
    is_grass = g.op("LESS_THAN", s, grass_to)
    is_red = g.mul(g.sub(1.0, is_grass), g.op("LESS_THAN", s, red_to))
    is_yellow = g.mul(g.op("GREATER_THAN", s, red_to), g.op("LESS_THAN", cg, 0.3))
    col = g.mix(g.mul(cb, 0.5), g["Sedum Color"], srgb("#4e6c35"))
    col = g.mix(is_yellow, col, g["Yellow Color"])
    col = g.mix(is_red, col, g.mix(cg, g["Red Color"], srgb("#7a5a2e")))
    mound = g.remap(clump.outputs[0], 0.1, 0.8, 1.0, 0.0, smooth=True)
    return col, is_grass, mound


def sod_roof(rebuild=False, **params):
    ng, g = _group("Sod Roof", (
        _color("Sedum Color", "#5f803d"), _color("Red Color", "#8c3d2b"), _color("Yellow Color", "#a3a24a"),
        _color("Grass Color", "#7b8a46"), _color("Medium Color", "#4a3e32"),
        _amount("Red Amount", 0.3), _amount("Grass Amount", 0.25), _amount("Bare Amount", 0.12)), rebuild)
    if g:
        p = g.point()
        wu, wv = g.warp(p, 0.07, 1.6, detail=5)
        species_col, is_grass, mound = _sod_species(g, g.point(wu, wv))
        leaf_v = g.voronoi(g.offset(p, (1.5, 3.5, 5.5, 7.5)), 110.0, "F1")
        lr, lg, _ = g.split(leaf_v.outputs["Color"])
        leaf = g.sat(g.madd(g.op("POWER", leaf_v.outputs[0], 2.0), -3.3, 1.0))
        sedum_col = g.tint(species_col, g.total(0.62, g.mul(lr, 0.35), g.mul(leaf, 0.25)))
        flush = g.mul(leaf, g.op("LESS_THAN", lg, g.mul(g["Red Amount"], 0.5)))
        sedum_col = g.mix(flush, sedum_col, g["Red Color"])
        blades = g.mul(g.fibres(3.0, 70.0, sharpness=0.8, salt=2.5), is_grass)
        dry, _ = g.noise(g.offset(p, (8.0, 4.0, 2.0, 6.0)), 2.0, 3, 0.5)
        grass_col = g.mix(g.mul(dry, 0.7), g["Grass Color"], srgb("#a89a62"))
        bare_n, _ = g.noise(g.offset(p, (3.3, 6.6, 9.9, 1.1)), 0.7, 5, 0.6)
        bare_at = g.madd(g["Bare Amount"], -0.32, 0.64)
        bare = g.remap(g.madd(g.sub(mound, 0.5), -0.06, bare_n), g.sub(bare_at, 0.03), bare_at, smooth=True)
        bare = g.hi(bare, g.mul(is_grass, g.remap(mound, 0.0, 0.2, 1.0, 0.0)))
        grit_h, grit_r = _round_stones(g, p, 140.0, 0.8, 0.003, salt=(5.2, 0.6, 7.1, 2.4))
        _, _, gb = g.split(grit_r)
        medium_col = g.mix(g.step(gb, 0.86, 0.88), g.tint(g["Medium Color"], g.madd(gb, 0.4, 0.8)), srgb("#b09a7e"))
        mat_h = g.mul(g.total(0.012, g.mul(mound, 0.01), g.mul(leaf, 0.008)), g.sub(1.0, g.mul(is_grass, 0.6)))
        plant_h = g.mul(g.hi(mat_h, g.mul(blades, g.madd(mound, 0.02, 0.018))), g.sub(1.0, bare))
        plant_col = g.mix(blades, g.mix(is_grass, sedum_col, g.tint(grass_col, 0.45)), grass_col)
        shows = g.op("GREATER_THAN", plant_h, grit_h)
        _finish(g, g.mix(shows, medium_col, plant_col),
                g.lerp(shows, 0.9, g.lerp(blades, g.madd(lr, 0.15, 0.48), 0.7)), g.hi(plant_h, grit_h),
                g.lerp(shows, 0.8, g.madd(g.hi(leaf, blades), 0.3, 0.65)))
    return pbr_material("M_SodRoof", ng, SOD_RELIEF, params, rebuild=rebuild)


MATERIALS = {"meadow": meadow, "beach": beach, "gravel": gravel, "flagstone": flagstone, "water": water,
             "sod_roof": sod_roof}
