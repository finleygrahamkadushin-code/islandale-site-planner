"""Wood cladding and decking, all from one vocabulary: planks laid side by side (common.wrapped_cells), each with its own tone,
growth rings and the odd knot, so neighbouring boards differ the way real lumber does.

cedar         vertical tongue-and-groove western red cedar: ~140 mm boards with a 6 mm shadow groove, honey-to-salmon
              board-to-board tones, straight and cathedral grain, the occasional small knot, oiled satin.
board_batten  rough-sawn ~280 mm boards with 60 mm battens standing 20 mm proud over the joints, in a semi-transparent
              weathered grey-brown stain that lets the grain and saw marks through.
timber        horizontal heavy channel shiplap, ~200 mm boards with a deep shadow channel and staggered butt joints, oiled.
charred_wood  yakisugi (shou sugi ban): charred cedar boards, deep black with a silvery alligator crackle; wire-brushed patches
              show the grain as glossy black ridges over brown-black.
deck_boards   140 mm decking with 6 mm gaps running along u, screwed to joists (butt joints land on them), weathered warm brown
              with raised grain, fine checks and darker board ends.
Every group takes Tile and Seed, a Color (the planner's swatch, the mean board tone), sizes in metres, and amounts such as
Variation (board-to-board tone spread), Grain (ring contrast) and Knots (chance of a knot per board per ~0.9 m)."""
from typing import NamedTuple

from ._wm_kit import OUTPUTS_AO, SEED_INPUT, TAU, TILE_INPUT, K, lin
from .common import new_group, pbr_material

KNOT_PITCH = 0.9          # m: one knot "slot" per board per this length; Knots is the chance a slot holds a knot
WHITE = (1.0, 1.0, 1.0, 1.0)


class Plank(NamedTuple):
    id: object            # wrapped board index (socket)
    frac: object          # 0..1 across the board
    pitch: object         # true board pitch (m)
    x: object             # metres across the board from its edge
    r: tuple              # six per-board randoms 0..1


def planks(k, across, tile, width, seed, salt=0.0):
    """Boards about `width` apart across `across`, with six per-board randoms that repeat with the tile."""
    bid, frac, pitch = k.cells(across, width, tile)
    return Plank(bid, frac, pitch, k.mul(frac, pitch), piece_randoms(k, bid, salt, seed))


def piece_randoms(k, pid, salt, seed):
    return k.hash(pid, salt, 0.0, seed)[:3] + k.hash(pid, salt, 1.0, seed)[:3]


def knots(k, p, along, tile, amount, seed, salt=0.0):
    """Small oval knots, at most one per board per KNOT_PITCH. Returns (core 0..1, halo 0..1 where the grain swirls round,
    distance in knot radii)."""
    kid, kf, kp = k.cells(k.add(along, k.mul(p.r[0], KNOT_PITCH)), KNOT_PITCH, tile)
    a, b, c, d = k.hash(p.id, kid, salt + 7.0, seed)
    exists = k.m("LESS_THAN", a, amount)
    ky = k.mul(k.madd(b, 0.5, 0.25), kp)
    kx = k.mul(k.madd(c, 0.6, 0.2), p.pitch)
    radius = k.madd(d, 0.008, 0.005)                       # 5..13 mm
    dy = k.div(k.sub(k.mul(kf, kp), ky), 1.7)              # knots on a face are ovals stretched along the grain
    dx = k.sub(p.x, kx)
    rel = k.div(k.m("SQRT", k.madd(dx, dx, k.mul(dy, dy))), radius)
    core = k.mul(exists, k.smooth(rel, 1.05, 0.85))
    halo = k.mul(exists, k.smooth(rel, 4.5, 1.0))
    return core, halo, rel


def rings(k, p, along, tile, density, flat_share, bend=0.0):
    """Growth rings on a board face: straight lines on rift-sawn boards, nested cathedral arches on flat-sawn ones (the face
    wanders nearer and further from the pith along the board). Returns latewood 0..1, a sawtooth: earlywood darkens
    gradually into a narrow latewood band."""
    r = p.r
    slow = k.noise(k.ring(along, tile, 1.0, z=0.0, w=k.mul(r[4], 97.0)), 0.7, detail=1.0)
    depth = k.madd(slow, 0.07, 0.004)                      # face-to-pith distance, 4..60 mm
    cx = k.mul(k.madd(r[2], 1.6, -0.3), p.pitch)           # the pith, from 30 % outside one edge to 30 % beyond the other
    dx = k.sub(p.x, cx)
    flat = k.m("SQRT", k.madd(dx, dx, k.mul(depth, depth)))
    straight = k.madd(slow, 0.012, p.x)
    dist = k.lerp(k.m("LESS_THAN", r[1], flat_share), straight, flat)
    wobble = k.noise(k.ring(along, tile, 3.0, z=k.mul(p.x, 40.0), w=k.mul(r[3], 61.0)), 1.0, detail=3.0)
    d = k.add(k.mul(dist, k.mul(density, k.madd(r[5], 0.6, 0.7))), k.madd(wobble, 1.6, bend))
    return k.smooth(k.m("FRACT", d), 0.45, 0.97, "SMOOTHERSTEP")


def streaks(k, p, along, tile, salt, k_across, k_along, detail=2.0):
    """Noise stretched along the board (k_across, k_along: noise units per metre), different on every board; 0..1."""
    w = k.mul(k.add(p.r[3], salt), 53.0)
    return k.noise(k.ring(along, tile, k_along, z=k.mul(p.x, k_across), w=w), 1.0, detail=detail)


def board_tone(k, color, r0, variation, tints):
    """The board's colour: Color times a per-board tint picked from `tints` (multipliers around 1)."""
    tint = k.cmix(variation, WHITE, k.ramp(r0, tints), clamp=False)
    return k.cmul(color, tint)


def figure_shade(k, late, streak, fibre, grain, late_dark, streak_amp, fibre_amp):
    """A brightness factor: latewood darker, plus long streaks and fine fibres, all scaled by Grain."""
    s = k.inv(k.mul(late, k.mul(grain, late_dark)))
    s = k.mul(s, k.madd(k.centred(streak), k.mul(grain, streak_amp), 1.0))
    return k.mul(s, k.madd(k.centred(fibre), k.mul(grain, fibre_amp), 1.0))


def finish(k, gout, col, rough, height, ao):
    k.put(col, gout.inputs["Base Color"])
    k.put(rough, gout.inputs["Roughness"])
    k.put(height, gout.inputs["Height"])
    k.put(ao, gout.inputs["AO"])
    gout.inputs["Metallic"].default_value = 0.0


# --- cedar ------------------------------------------------------------------------------------------------------------
CEDAR_FACE = 0.008        # m: board face above the bottom of the shadow groove
CEDAR_EASE = 0.0015       # m: radius of the eased board edges
CEDAR_GRAIN = 0.0002      # m: latewood stands this proud once the oil has raised the grain
CEDAR_FIBRE = 0.00008     # m
CEDAR_KNOT = 0.0002       # m
CEDAR_RINGS = 210.0       # rings per metre across the face (~5 mm, second-growth cedar)
CEDAR_TINTS = [(0.0, (1.28, 1.30, 1.22, 1)),               # pale straw-honey sapwood-ish board
               (0.2, (1.16, 1.10, 0.96, 1)),               # honey
               (0.42, (1.0, 1.0, 1.0, 1)),                 # the swatch tone
               (0.62, (1.10, 0.88, 0.86, 1)),              # salmon-pink
               (0.82, (0.84, 0.70, 0.62, 1)),              # red-brown heartwood
               (1.0, (0.60, 0.50, 0.44, 1))]               # dark chocolate


def cedar(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Cedar", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#9b6b43")),
        ("Board Width", "NodeSocketFloat", 0.14, 0.05, 0.4),
        ("Groove Width", "NodeSocketFloat", 0.006, 0.0, 0.03),
        ("Variation", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Grain", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Knots", "NodeSocketFloat", 0.12, 0.0, 1.0),
        ("Roughness", "NodeSocketFloat", 0.48, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed, grain = gin.outputs["Tile"], gin.outputs["Seed"], gin.outputs["Grain"]
        p = planks(k, u, tile, gin.outputs["Board Width"], seed)
        core, halo, rel = knots(k, p, v, tile, gin.outputs["Knots"], seed)
        late = rings(k, p, v, tile, CEDAR_RINGS, 0.55, k.mul(k.mul(halo, halo), 3.0))
        fibre = streaks(k, p, v, tile, 0.0, 320.0, 4.0)
        streak = streaks(k, p, v, tile, 0.37, 14.0, 0.9, detail=3.0)

        col = board_tone(k, gin.outputs["Color"], p.r[0], gin.outputs["Variation"], CEDAR_TINTS)
        col = k.gain(col, figure_shade(k, late, streak, fibre, grain, 0.42, 0.22, 0.10))
        knot_rings = k.smooth(k.m("FRACT", k.mul(rel, 2.5)), 0.3, 0.9)
        knot_col = k.cmul(gin.outputs["Color"], (0.42, 0.28, 0.22, 1))
        col = k.cmix(core, col, k.gain(knot_col, k.madd(knot_rings, -0.25, 1.0)))

        groove = k.mul(gin.outputs["Groove Width"], 0.5)
        e = k.edge(p.frac, p.pitch)
        prof = k.smooth(e, groove, k.add(groove, CEDAR_EASE))
        cavity = k.smooth(e, k.sub(groove, 0.002), k.add(groove, 0.004))
        col = k.gain(col, k.madd(cavity, 0.25, 0.75))
        surface = k.madd(late, CEDAR_GRAIN, k.madd(fibre, CEDAR_FIBRE, CEDAR_FACE))
        height = k.madd(core, CEDAR_KNOT, k.mul(prof, surface))

        rough = k.madd(late, -0.08, gin.outputs["Roughness"])
        rough = k.madd(k.inv(prof), 0.2, k.madd(core, -0.1, rough))
        finish(k, gout, col, rough, height, k.madd(cavity, 0.6, 0.4))
    return pbr_material("M_Cedar", ng, CEDAR_FACE + CEDAR_GRAIN + CEDAR_FIBRE + CEDAR_KNOT, params, rebuild=rebuild)


# --- board and batten ---------------------------------------------------------------------------------------------------
BB_BOARD = 0.001          # m: board face above the deepest saw mark
BB_BATTEN = 0.020         # m: batten face proud of the boards
BB_EASE = 0.003           # m: batten edge radius
BB_SAW = 0.0007           # m: depth of the band-saw marks and torn fibres on the rough-sawn faces
BB_SAW_PITCH = 0.009      # m: band-saw tooth marks across the boards
BB_RINGS = 160.0
BB_TINTS = [(0.0, (1.14, 1.12, 1.10, 1)), (0.5, (1.0, 1.0, 1.0, 1)), (1.0, (0.82, 0.80, 0.80, 1))]


def sawn(k, p, along, tile):
    """Rough-sawn face, 0..1: band-saw marks across the grain (pitched to divide the tile) plus torn fibres along it."""
    pitch = k.div(tile, k.m("ROUND", k.div(tile, BB_SAW_PITCH)))
    tilt = k.mul(k.centred(p.r[2], 0.05), p.x)                          # marks run a few degrees off square
    jitter = k.noise(k.ring(along, tile, 6.0, z=k.mul(p.x, 8.0), w=k.mul(p.r[4], 41.0)), 1.0, detail=2.0)
    phase = k.add(k.div(k.add(along, tilt), pitch), k.mul(jitter, 2.0))
    marks = k.smooth(k.m("PINGPONG", phase, 0.5), 0.0, 0.5)
    torn = streaks(k, p, along, tile, 0.71, 700.0, 25.0)
    return k.lerp(0.55, marks, torn)


def board_batten(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Board Batten", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#5f554b")),
        ("Board Width", "NodeSocketFloat", 0.28, 0.1, 0.6),
        ("Batten Width", "NodeSocketFloat", 0.06, 0.02, 0.15),
        ("Variation", "NodeSocketFloat", 0.6, 0.0, 2.0),
        ("Grain", "NodeSocketFloat", 0.8, 0.0, 2.0),
        ("Weathering", "NodeSocketFloat", 0.7, 0.0, 2.0),
        ("Roughness", "NodeSocketFloat", 0.78, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed, grain = gin.outputs["Tile"], gin.outputs["Seed"], gin.outputs["Grain"]
        bw = gin.outputs["Batten Width"]
        half = k.mul(bw, 0.5)
        p = planks(k, u, tile, gin.outputs["Board Width"], seed)
        # the batten over this point: centred on the board joint to the left (frac < 0.5) or to the right
        right = k.m("GREATER_THAN", p.frac, 0.5)
        count = k.m("ROUND", k.div(tile, p.pitch))
        bat_id = k.m("FLOORED_MODULO", k.add(p.id, right), count)
        bx = k.add(k.sub(p.x, k.mul(right, p.pitch)), half)               # metres across the batten
        b = Plank(bat_id, k.div(bx, bw), bw, bx, piece_randoms(k, bat_id, 3.0, seed))
        e = k.edge(p.frac, p.pitch)                                         # distance to the board joint
        on_batten = k.smooth(e, k.add(half, 0.0004), k.sub(half, 0.0004))
        batten_prof = k.smooth(e, half, k.sub(half, BB_EASE))

        def face(pl, salt):
            late = rings(k, pl, v, tile, BB_RINGS, 0.6)
            fibre = streaks(k, pl, v, tile, salt, 260.0, 3.0)
            streak = streaks(k, pl, v, tile, salt + 0.3, 10.0, 0.7, detail=3.0)
            saw = sawn(k, pl, v, tile)
            col = board_tone(k, gin.outputs["Color"], pl.r[0], gin.outputs["Variation"], BB_TINTS)
            col = k.gain(col, figure_shade(k, late, streak, fibre, grain, 0.22, 0.16, 0.10))
            col = k.gain(col, k.madd(saw, 0.10, 0.92))                     # stain pools in the saw marks
            return col, late, saw

        bcol, blate, bsaw = face(p, 0.0)
        tcol, tlate, tsaw = face(b, 0.5)
        # weathering: rain washes the stain to a silvery grey in long vertical streaks, most on the proud battens
        tv, tw = k.torus(gin.outputs["Vector"], tile, 14.0, 0.6)
        wash = k.smooth(k.noise((tv, tw), 1.0, detail=4.0, rough=0.6), 0.42, 0.75)
        wash = k.mul(k.mul(wash, gin.outputs["Weathering"]), k.lerp(on_batten, 0.5, 0.8))
        silver = k.cmul(gin.outputs["Color"], (1.45, 1.52, 1.62, 1))
        col = k.cmix(on_batten, bcol, tcol)
        col = k.cmix(k.mul(wash, 0.55), col, silver)
        shadow = k.smooth(e, k.add(half, 0.02), half)                     # grime in the corner beside each batten
        col = k.gain(col, k.madd(k.mul(shadow, k.inv(on_batten)), -0.18, 1.0))

        saw = k.lerp(on_batten, bsaw, tsaw)
        late = k.lerp(on_batten, blate, tlate)
        surface = k.madd(saw, BB_SAW, k.mul(late, 0.0002))
        height = k.add(surface, k.madd(batten_prof, BB_BATTEN, BB_BOARD))
        rough = k.madd(saw, 0.08, k.madd(wash, 0.06, gin.outputs["Roughness"]))
        ao = k.inv(k.mul(k.mul(shadow, k.inv(on_batten)), 0.5))
        finish(k, gout, col, k.mn(rough, 1.0), height, ao)
    return pbr_material("M_BoardBatten", ng, BB_BOARD + BB_BATTEN + BB_SAW + 0.0002, params, rebuild=rebuild)


# --- timber (horizontal channel shiplap) ---------------------------------------------------------------------------------
TB_FACE = 0.016           # m: board face above the bottom of the shadow channel
TB_EASE = 0.002           # m
TB_JOINT = 0.0012         # m: half-width of a butt joint
TB_GRAIN = 0.00025
TB_RINGS = 190.0
TB_TINTS = [(0.0, (1.22, 1.18, 1.10, 1)), (0.3, (1.08, 1.04, 1.0, 1)), (0.55, (1.0, 1.0, 1.0, 1)),
            (0.8, (0.88, 0.80, 0.78, 1)), (1.0, (0.70, 0.62, 0.58, 1))]


def timber(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Timber", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#8a5f3c")),
        ("Board Height", "NodeSocketFloat", 0.2, 0.08, 0.5),
        ("Channel", "NodeSocketFloat", 0.009, 0.0, 0.03),
        ("Board Length", "NodeSocketFloat", 3.0, 0.5, 6.0),
        ("Variation", "NodeSocketFloat", 0.9, 0.0, 2.0),
        ("Grain", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Knots", "NodeSocketFloat", 0.2, 0.0, 1.0),
        ("Roughness", "NodeSocketFloat", 0.55, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed, grain = gin.outputs["Tile"], gin.outputs["Seed"], gin.outputs["Grain"]
        row = planks(k, v, tile, gin.outputs["Board Height"], seed)
        length = gin.outputs["Board Length"]
        sid, sf, sp = k.cells(k.add(u, k.mul(row.r[0], length)), length, tile)
        pid = k.madd(row.id, 1000.0, sid)                                  # one piece of lumber
        p = Plank(pid, row.frac, row.pitch, row.x, piece_randoms(k, pid, 5.0, seed))
        core, halo, rel = knots(k, p, u, tile, gin.outputs["Knots"], seed)
        late = rings(k, p, u, tile, TB_RINGS, 0.7, k.mul(k.mul(halo, halo), 3.0))
        fibre = streaks(k, p, u, tile, 0.0, 300.0, 4.0)
        streak = streaks(k, p, u, tile, 0.37, 12.0, 0.8, detail=3.0)

        col = board_tone(k, gin.outputs["Color"], p.r[0], gin.outputs["Variation"], TB_TINTS)
        col = k.gain(col, figure_shade(k, late, streak, fibre, grain, 0.40, 0.22, 0.10))
        knot_col = k.cmul(gin.outputs["Color"], (0.40, 0.27, 0.22, 1))
        col = k.cmix(core, col, k.gain(knot_col, k.madd(k.smooth(k.m("FRACT", k.mul(rel, 2.5)), 0.3, 0.9), -0.25, 1.0)))

        channel = gin.outputs["Channel"]
        prof = k.mul(k.smooth(row.x, channel, k.add(channel, TB_EASE)),   # the channel along each board's lower edge
                     k.smooth(k.sub(row.pitch, row.x), 0.0, 0.0008))
        je = k.edge(sf, sp)
        joint = k.smooth(je, TB_JOINT, k.add(TB_JOINT, 0.001))
        prof = k.mul(prof, joint)
        cavity = k.mul(k.smooth(row.x, k.sub(channel, 0.003), k.add(channel, 0.006)), k.smooth(je, 0.0, 0.004))
        col = k.gain(col, k.madd(cavity, 0.3, 0.7))
        endgrain = k.smooth(je, 0.03, 0.002)                               # board ends drink the oil and darken
        col = k.gain(col, k.madd(endgrain, -0.12, 1.0))
        height = k.madd(core, 0.0002, k.mul(prof, k.madd(late, TB_GRAIN, k.madd(fibre, 0.00008, TB_FACE))))
        rough = k.madd(late, -0.08, gin.outputs["Roughness"])
        rough = k.madd(k.inv(prof), 0.2, k.madd(core, -0.1, rough))
        finish(k, gout, col, rough, height, k.madd(cavity, 0.65, 0.35))
    return pbr_material("M_Timber", ng, TB_FACE + TB_GRAIN + 0.00008 + 0.0002, params, rebuild=rebuild)


# --- charred wood (yakisugi) ---------------------------------------------------------------------------------------------
CH_BOARD = 0.0015         # m: board surface at the bottom of the char cracks
CH_SCALE = 0.003          # m: alligator scales stand this proud of the crack floors
CH_FINE = 0.0003          # m: char grit
CH_JOINT = 0.001          # m: half-width of the joint between boards
CH_COLUMN = 0.021         # m: nominal width of the scale columns across a board
CH_RIDGE = 0.0006         # m: brushed latewood ridges
CH_RINGS = 170.0


def alligator(k, p, along, tile, seed):
    """Alligator char: columns of scales across each board, rows of random length down each column, cracks wandering.
    Returns (distance to the nearest crack in m, crack width in m, per-scale random)."""
    warp = k.noise(k.ring(along, tile, 30.0, z=k.mul(p.x, 40.0), w=k.mul(p.r[4], 29.0)), 1.0, detail=2.0)
    xw = k.madd(k.centred(warp), 0.004, p.x)
    ncol = k.mx(k.m("ROUND", k.div(p.pitch, CH_COLUMN)), 1.0)
    colw = k.div(p.pitch, ncol)
    cs = k.div(xw, colw)
    cid = k.m("FLOOR", cs)
    cf = k.sub(cs, cid)
    ca, cb, cc, _ = k.hash(k.madd(p.id, 64.0, cid), 11.0, 0.0, seed)
    rows = k.madd(ca, 0.022, 0.011)                                      # scale length down the column, 11..33 mm
    vw = k.madd(k.centred(warp, 1.0), 0.006, along)
    rid, rf, rp = k.cells(k.add(vw, k.mul(cb, rows)), rows, tile)
    sa, sb, sc, _ = k.hash(k.madd(p.id, 64.0, cid), rid, 12.0, seed)
    width = k.madd(sa, 0.0016, 0.0007)
    dist = k.mn(k.edge(cf, colw), k.mul(k.edge(rf, rp), k.madd(cc, 0.6, 0.7)))
    return dist, width, sb, sc


def charred_wood(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Charred Wood", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#1d1c1f")),
        ("Board Width", "NodeSocketFloat", 0.165, 0.08, 0.3),
        ("Brushed", "NodeSocketFloat", 0.35, 0.0, 1.0),
        ("Sheen", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Roughness", "NodeSocketFloat", 0.42, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed = gin.outputs["Tile"], gin.outputs["Seed"]
        p = planks(k, u, tile, gin.outputs["Board Width"], seed)
        dist, width, sr, sr2 = alligator(k, p, v, tile, seed)
        scale = k.smooth(dist, k.mul(width, 0.5), k.madd(width, 0.5, 0.0035))   # 0 in a crack, domed to 1 on a scale
        late = rings(k, p, v, tile, CH_RINGS, 0.6)
        grit = k.noise(k.torus(gin.outputs["Vector"], tile, 1.0, 1.0), 900.0, detail=1.0)

        # brushed patches: a few boards and drifts where the brush took the char back to the grain
        tv, tw = k.torus(gin.outputs["Vector"], tile, 2.0, 0.8)
        drift = k.madd(k.centred(p.r[5], 0.25), 1.0, k.noise((tv, tw), 1.0, detail=2.0))
        brushed = k.mul(k.smooth(drift, k.sub(0.82, k.mul(gin.outputs["Brushed"], 0.4)),
                                 k.sub(0.92, k.mul(gin.outputs["Brushed"], 0.4))), gin.outputs["Brushed"])

        char = gin.outputs["Color"]
        crack_col = k.cmul(char, (0.22, 0.22, 0.22, 1))
        silver = k.cmul(char, (1.55, 1.58, 1.75, 1))                        # the sheen of a fresh scale
        top = k.cmix(k.mul(sr, gin.outputs["Sheen"]), char, silver)
        scales_col = k.cmix(scale, crack_col, k.gain(top, k.madd(grit, 0.5, 0.75)))
        ridge = k.smooth(late, 0.55, 0.9)
        brushed_col = k.cmix(ridge, k.cmul(char, (1.75, 1.35, 1.1, 1)), k.cmul(char, (0.55, 0.52, 0.5, 1)))
        col = k.cmix(brushed, scales_col, brushed_col)

        je = k.edge(p.frac, p.pitch)
        joint = k.smooth(je, CH_JOINT, k.add(CH_JOINT, 0.0008))
        col = k.cmix(joint, crack_col, col)
        scales_h = k.madd(scale, k.madd(sr2, 0.6, 0.4), 0.0)
        relief = k.lerp(brushed, k.mul(scales_h, CH_SCALE), k.mul(ridge, CH_RIDGE))
        height = k.mul(joint, k.add(CH_BOARD, k.madd(grit, CH_FINE, relief)))
        rough = k.lerp(scale, 0.95, k.madd(sr, -0.1, gin.outputs["Roughness"]))
        rough = k.lerp(brushed, rough, k.lerp(ridge, 0.75, 0.38))
        rough = k.lerp(joint, 0.95, rough)
        ao = k.mul(joint, k.lerp(brushed, k.madd(scale, 0.55, 0.45), 1.0))
        finish(k, gout, col, rough, height, k.mx(ao, 0.15))
    return pbr_material("M_CharredWood", ng, CH_BOARD + CH_SCALE + CH_FINE, params, rebuild=rebuild)


# --- deck boards ---------------------------------------------------------------------------------------------------------
DK_FACE = 0.020           # m: deck surface above the bottom of the gaps
DK_EASE = 0.003           # m: eased board edges
DK_CUP = 0.0006           # m: weathered boards cup, edges higher than the middle
DK_GRAIN = 0.0004         # m: raised latewood on weathered boards
DK_SCREW_R = 0.0035       # m: screw head radius
DK_SCREW_IN = 0.2         # screws sit this fraction of the board width in from each edge
DK_JOINT_SCREWS = 0.02    # m: at a butt joint the screws sit this far either side of it
DK_RINGS = 150.0
DK_WEATHERING = 0.7
DK_TINTS = [(0.0, (1.12, 1.12, 1.14, 1)), (0.3, (1.04, 1.02, 1.0, 1)), (0.55, (1.0, 1.0, 1.0, 1)),
            (0.8, (0.90, 0.84, 0.78, 1)), (1.0, (0.76, 0.70, 0.66, 1))]


def deck_boards(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Deck Boards", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#c9ad84")),
        ("Board Width", "NodeSocketFloat", 0.14, 0.06, 0.3),
        ("Gap", "NodeSocketFloat", 0.006, 0.0, 0.02),
        ("Board Length", "NodeSocketFloat", 3.0, 1.0, 6.0),
        ("Joist Spacing", "NodeSocketFloat", 0.4, 0.2, 0.8),
        ("Variation", "NodeSocketFloat", 0.8, 0.0, 2.0),
        ("Grain", "NodeSocketFloat", 0.9, 0.0, 2.0),
        ("Weathering", "NodeSocketFloat", DK_WEATHERING, 0.0, 2.0),
        ("Roughness", "NodeSocketFloat", 0.74, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed, grain = gin.outputs["Tile"], gin.outputs["Seed"], gin.outputs["Grain"]
        gap = gin.outputs["Gap"]
        row = planks(k, v, tile, k.add(gin.outputs["Board Width"], gap), seed)
        fw = k.sub(row.pitch, gap)                                          # the board's own width
        bx = k.sub(row.x, gap)
        # butt joints land on joists: a board is a whole number of joist spaces long, rows start a whole joist apart
        seg = k.div(tile, k.mx(k.m("ROUND", k.div(tile, gin.outputs["Board Length"])), 1.0))
        per = k.mx(k.m("ROUND", k.div(seg, gin.outputs["Joist Spacing"])), 1.0)
        jp = k.div(seg, per)
        off = k.mul(k.m("FLOOR", k.mul(row.r[0], per)), jp)
        sid, sf, sp = k.cells(k.add(u, off), seg, tile)
        pid = k.madd(row.id, 1000.0, sid)
        p = Plank(pid, k.div(bx, fw), fw, bx, piece_randoms(k, pid, 9.0, seed))
        late = rings(k, p, u, tile, DK_RINGS, 0.7)
        fibre = streaks(k, p, u, tile, 0.0, 300.0, 4.0)
        streak = streaks(k, p, u, tile, 0.37, 12.0, 0.8, detail=3.0)
        # checks: fine splits along the grain, where a stretched noise crosses its midline, only in some stretches
        chk_n = streaks(k, p, u, tile, 0.53, 90.0, 2.5, detail=1.0)
        chk_gate = k.smooth(streaks(k, p, u, tile, 0.19, 3.0, 1.2), 0.55, 0.7)
        checks = k.mul(k.smooth(k.m("ABSOLUTE", k.sub(chk_n, 0.5)), 0.006, 0.0), k.mul(chk_gate, gin.outputs["Weathering"]))

        col = board_tone(k, gin.outputs["Color"], p.r[0], gin.outputs["Variation"], DK_TINTS)
        col = k.gain(col, figure_shade(k, late, streak, fibre, grain, 0.30, 0.20, 0.10))
        grey = k.cmul(gin.outputs["Color"], (0.86, 0.90, 0.96, 1))          # weathering silvers the brown
        col = k.cmix(k.mul(k.mul(p.r[1], 0.5), gin.outputs["Weathering"]), col, grey)
        je = k.edge(sf, sp)
        col = k.gain(col, k.madd(k.smooth(je, 0.05, 0.003), -0.18, 1.0))   # board ends darker
        col = k.gain(col, k.madd(checks, -0.55, 1.0))

        # screws: two per board on every joist, a pair either side of each butt joint
        jid, jf, _ = k.cells(u, jp, tile)
        du = k.m("ABSOLUTE", k.mul(k.sub(k.m("ROUND", jf), jf), jp))
        at_joint = k.m("LESS_THAN", je, k.mul(jp, 0.5))
        du = k.m("ABSOLUTE", k.sub(du, k.mul(at_joint, DK_JOINT_SCREWS)))
        sx = k.mul(fw, DK_SCREW_IN)
        dx = k.mn(k.m("ABSOLUTE", k.sub(bx, sx)), k.m("ABSOLUTE", k.sub(bx, k.sub(fw, sx))))
        sd = k.m("SQRT", k.madd(du, du, k.mul(dx, dx)))
        head = k.smooth(sd, DK_SCREW_R, k.mul(DK_SCREW_R, 0.8))
        stain = k.mul(k.smooth(sd, 0.012, DK_SCREW_R), gin.outputs["Weathering"])
        col = k.gain(col, k.madd(stain, -0.25, 1.0))
        col = k.cmix(head, col, (0.06, 0.055, 0.05, 1))

        edge = k.mn(bx, k.sub(fw, bx))
        on_board = k.m("GREATER_THAN", bx, 0.0)
        prof = k.mul(k.smooth(edge, 0.0, DK_EASE), on_board)
        prof = k.mul(prof, k.smooth(je, 0.0005, 0.002))
        cup = k.mul(k.m("POWER", k.m("ABSOLUTE", k.sub(k.mul(p.frac, 2.0), 1.0)), 2.0), DK_CUP)
        raised = k.mul(late, k.mul(DK_GRAIN, gin.outputs["Weathering"]))
        surface = k.add(k.add(DK_FACE, cup), k.sub(raised, k.mul(checks, 0.0008)))
        height = k.mul(prof, k.sub(surface, k.mul(head, 0.0006)))
        gap_col = k.cmul(gin.outputs["Color"], (0.12, 0.10, 0.09, 1))
        col = k.cmix(prof, gap_col, col)
        cavity = k.mul(k.smooth(edge, -0.001, 0.006), on_board)
        rough = k.madd(late, 0.06, k.madd(head, -0.4, gin.outputs["Roughness"]))
        finish(k, gout, col, k.mn(rough, 1.0), height, k.madd(cavity, 0.8, 0.2))
    relief = DK_FACE + DK_CUP + DK_GRAIN * params.get("Weathering", DK_WEATHERING)
    return pbr_material("M_DeckBoards", ng, relief, params, rebuild=rebuild)


MATERIALS = {"cedar": cedar, "board_batten": board_batten, "timber": timber, "charred_wood": charred_wood,
             "deck_boards": deck_boards}
