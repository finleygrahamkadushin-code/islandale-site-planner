"""Metals for the cabins: rigidized stainless cladding, standing-seam roofs (painted steel and weathered copper) and dark steel trim.

rigidized_metal, rigidized_bronze ("IS Rigidized Metal")
    Deep-textured sheet like Rigidized Metals' diamond patterns: a lattice of raised diamonds (Diamond Width across, Diamond
    Height tall, Depth proud) whose four sloped facets meet in soft creases. Crease Sharpness is the exponent of the facet
    norm: 2 rounds each diamond into a dome (the dimpled 6WL look), 6-10 gives crisp pyramids; Softness rounds the valleys and
    the peaks. The finish is brushed/satin with fine streaks running up the sheet (Brushing), the tops a touch burnished. Panels
    (Panel Width x Panel Height, stack bond) meet at fine Joint Width gaps, each bowed a hair (Panel Warp) and shifted a little
    in tone and gloss (Panel Variation), so a wall reads as real cladding. bronze is the same group in a warm champagne-bronze
    PVD tint.
standing_seam ("IS Standing Seam")
    Painted steel roof, charcoal #3c4043: pans Pan Width wide running up the slope (v), Seam Width x Seam Height ribs with a
    rounded fold that catches a crisp highlight and a faint lock line, the pan flaring up into each leg, faint Oil Canning
    in the pans, a per-pan tone shift (Pan Variation) and light chalking and dirt streaks down the slope (Weathering).
copper_roof ("IS Copper Roof")
    The same seams in copper weathered to verdigris (#6aa28c, the planner's tint): Patina Amount sets how far the green has
    spread; it gathers mid-pan and runs down the slope in streaks, while the seams and drier patches stay brown copper.
steel ("IS Steel")
    Dark painted or blackened steel #3b3f44 for rails, posts, window frames and fascia: satin, faint mill-scale mottling and
    rolling marks under the finish, a fine orange-peel relief. Metallic 0 is painted; raise it for bare blackened steel.

Every group repeats exactly every Tile metres: noise through torus4d, pans, panels and the diamond lattice through
wrapped_cells' true pitch. Colours are linear RGB."""
import math as pymath

import bpy

from .common import OUTPUTS, TILE_DEFAULT, new_group, node, pbr_material, torus4d, wrapped_cells

TILE_INPUT = ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0)
SEED_INPUT = ("Seed", "NodeSocketFloat", 0.0, 0.0, 1000.0)
OUTPUTS_AO = OUTPUTS + (("AO", "NodeSocketFloat"),)
SEED_W = 7.31            # noise W offset per unit of Seed
SALT_W = 13.7            # noise W offset between independent noises in one group


def _socket(coll, key):
    """A node socket by identifier (Mix and Map Range repeat names across types), else by name."""
    for s in coll:
        if s.identifier == key:
            return s
    return coll[key]


class Graph:
    """Adds nodes to a group in tidy columns. Every method takes numbers or sockets and returns an output socket."""
    ROWS = 18

    def __init__(self, nodes, links, gin, gout):
        self.nodes, self.links, self.gin, self.gout = nodes, links, gin, gout
        self.count = 0

    def inp(self, name):
        return self.gin.outputs[name]

    def feed(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.links.new(v, sock)
        else:
            sock.default_value = v

    def out(self, name, v):
        self.feed(self.gout.inputs[name], v)

    def add(self, typ, inputs=None, **props):
        col, row = divmod(self.count, self.ROWS)
        self.count += 1
        n = node(self.nodes, typ, (-900 + 220 * col, 1500 - 170 * row), **props)
        for key, v in (inputs or {}).items():
            self.feed(_socket(n.inputs, key), v)
        return n

    def loc(self):
        """A free spot for helpers from common that place their own nodes."""
        col, row = divmod(self.count, self.ROWS)
        self.count += self.ROWS
        return (-900 + 220 * col, -1800 - 170 * row)

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.add("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.feed(n.inputs[i], v)
        return n.outputs[0]

    def lerp(self, a, b, f):
        return self.math("MULTIPLY_ADD", f, self.math("SUBTRACT", b, a), a)

    def signed(self, x, amount):
        """(x - 0.5) * 2 * amount: a 0..1 noise or hash turned into a +-amount offset."""
        return self.math("MULTIPLY", self.math("SUBTRACT", x, 0.5), self.math("MULTIPLY", amount, 2.0))

    def product(self, *factors):
        acc = factors[0]
        for f in factors[1:]:
            acc = self.math("MULTIPLY", acc, f)
        return acc

    def vmath(self, op, a, b=None):
        n = self.add("ShaderNodeVectorMath", operation=op)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        return n.outputs[0]

    def scale(self, color, s):
        n = self.add("ShaderNodeVectorMath", operation="SCALE", inputs={"Vector": color, "Scale": s})
        return n.outputs["Vector"]

    def mix_color(self, f, a, b):
        n = self.add("ShaderNodeMix", data_type="RGBA", inputs={"Factor_Float": f, "A_Color": a, "B_Color": b})
        return _socket(n.outputs, "Result_Color")

    def remap(self, x, lo, hi, to_lo=0.0, to_hi=1.0, smooth=False):
        """Clamped Map Range; lo > hi flips it."""
        n = self.add("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR",
                     clamp=True, inputs={"Value": x, "From Min": lo, "From Max": hi, "To Min": to_lo, "To Max": to_hi})
        return n.outputs["Result"]

    def separate(self, v):
        n = self.add("ShaderNodeSeparateXYZ")
        self.feed(n.inputs[0], v)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def combine(self, x, y, z):
        n = self.add("ShaderNodeCombineXYZ")
        for i, v in enumerate((x, y, z)):
            self.feed(n.inputs[i], v)
        return n.outputs[0]

    def noise(self, vec, w, scale, detail=2.0, rough=0.5, kind="FBM", distortion=0.0):
        n = self.add("ShaderNodeTexNoise", noise_dimensions="4D", noise_type=kind,
                     inputs={"Vector": vec, "W": w, "Scale": scale, "Detail": detail, "Roughness": rough,
                             "Distortion": distortion})
        return _socket(n.outputs, "Fac")

    def white(self, vec):
        n = self.add("ShaderNodeTexWhiteNoise", noise_dimensions="3D", inputs={"Vector": vec})
        return n.outputs["Value"], n.outputs["Color"]


def new_graph(name, inputs, outputs=OUTPUTS_AO, rebuild=False):
    ng, nodes, links, gin, gout = new_group(name, inputs=(TILE_INPUT, SEED_INPUT) + tuple(inputs), outputs=outputs,
                                            rebuild=rebuild)
    return ng, (Graph(nodes, links, gin, gout) if nodes else None)


def surface_coords(g):
    """(u, v) wrapped into [0, Tile): exact repeats, and small numbers for the fine lattices."""
    u, v, _ = g.separate(g.inp("Vector"))
    tile = g.inp("Tile")
    return g.math("FLOORED_MODULO", u, tile), g.math("FLOORED_MODULO", v, tile)


def seamless_noise(g, torus, scale, salt, stretch=None, w_offset=None, **kw):
    """4D noise on the group's torus, so it tiles. stretch=(su, sv) multiplies the frequency across u and along v (streaks);
    salt (and the group's Seed, and w_offset) slide it along W so noises in one group are independent."""
    vec, w = torus
    if stretch:
        su, sv = stretch
        vec = g.vmath("MULTIPLY", vec, (su, su, sv))
        w = g.math("MULTIPLY", w, sv)
    w = g.math("MULTIPLY_ADD", g.inp("Seed"), SEED_W, g.math("ADD", w, salt * SALT_W))
    if w_offset is not None:
        w = g.math("ADD", w, w_offset)
    return g.noise(vec, w, scale, **kw)


def cell_hash(g, iu, iv, salt):
    """Per-cell random (value, color) from wrapped cell ids, so it repeats with the tile."""
    return g.white(g.combine(iu, iv, g.math("ADD", g.inp("Seed"), salt * SALT_W)))


def channel(g, color, i):
    return g.separate(color)[i]


def edge_distance(g, frac, pitch):
    """Metres from a cell's nearer edge."""
    return g.math("MULTIPLY", g.math("MINIMUM", frac, g.math("SUBTRACT", 1.0, frac)), pitch)


def _param(params, name, default):
    return float(params.get(name, default))


# ---------------------------------------------------------------- rigidized metal

STAINLESS = (0.50, 0.50, 0.48, 1.0)       # satin stainless (linear; sRGB ~0.73)
PVD_BRONZE = (0.40, 0.25, 0.12, 1.0)      # champagne-bronze PVD
JOINT_COLOR = (0.035, 0.035, 0.035, 1.0)
DIAMOND_W, DIAMOND_H = 0.028, 0.056       # m, point to point: the long RGM-style diamond
EMBOSS_DEPTH = 0.0045                     # m
PANEL_WARP = 0.0025                       # m: how far a panel bows out at its middle
EDGE_ROLL = 0.006                         # m: the sheet rolls down to the joint over this
BRUSH_SCALES = (260.0, 70.0)              # streaks ~4 mm and ~14 mm across the grain
BRUSH_STRETCH = (1.0, 0.015)              # ...and tens of cm long, running up the sheet
STREAK_TONE, STREAK_ROUGH = 0.06, 0.06
PANEL_TONE, PANEL_ROUGH = 0.05, 0.04
SMUDGE_SCALE, SMUDGE_ROUGH = 1.4, 0.035
BURNISH = 0.05                            # tops of the diamonds polished by the rolls
VALLEY_TONE, VALLEY_AO = 0.86, 0.7


def diamond_relief(g, u, v):
    """0..1 relief of the diamond lattice: a = u/pu + v/pv, b = u/pu - v/pv cut the sheet into diamonds pu across and pv tall,
    and each rises as a p-norm pyramid (p = Crease Sharpness) softened at the valleys and peak by Softness."""
    tile = g.inp("Tile")
    pu = wrapped_cells(g.nodes, g.links, u, g.inp("Diamond Width"), tile, g.loc())[2]
    pv = wrapped_cells(g.nodes, g.links, v, g.inp("Diamond Height"), tile, g.loc())[2]
    su, sv = g.math("DIVIDE", u, pu), g.math("DIVIDE", v, pv)
    p = g.inp("Crease Sharpness")
    powered = []
    for coord in (g.math("ADD", su, sv), g.math("SUBTRACT", su, sv)):
        centred = g.math("ABSOLUTE", g.math("MULTIPLY_ADD", g.math("FRACT", coord), 2.0, -1.0))
        powered.append(g.math("POWER", centred, p))
    r = g.math("POWER", g.math("ADD", *powered), g.math("DIVIDE", 1.0, p))
    t = g.math("SUBTRACT", 1.0, g.math("DIVIDE", r, g.math("SUBTRACT", 1.0, g.inp("Land"))), clamp=True)
    return g.lerp(t, g.remap(t, 0.0, 1.0, smooth=True), g.inp("Softness"))


def panel_layout(g, u, v):
    """Stack-bond panels: (hash value, hash color, edge distance, bow 0..1)."""
    tile = g.inp("Tile")
    iu, fu, pw = wrapped_cells(g.nodes, g.links, u, g.inp("Panel Width"), tile, g.loc())
    iv, fv, ph = wrapped_cells(g.nodes, g.links, v, g.inp("Panel Height"), tile, g.loc())
    value, color = cell_hash(g, iu, iv, 1)
    edge = g.math("MINIMUM", edge_distance(g, fu, pw), edge_distance(g, fv, ph))
    bow = g.product(g.math("SINE", g.math("MULTIPLY", fu, pymath.pi)), g.math("SINE", g.math("MULTIPLY", fv, pymath.pi)),
                    g.remap(value, 0.0, 1.0, 0.35, 1.0))
    return value, color, edge, bow


def rigidized(rebuild=False, _name="M_RigidizedMetal", **params):
    ng, g = new_graph("IS Rigidized Metal", (
        ("Color", "NodeSocketColor", STAINLESS),
        ("Roughness", "NodeSocketFloat", 0.30, 0.0, 1.0),
        ("Diamond Width", "NodeSocketFloat", DIAMOND_W, 0.005, 0.5),
        ("Diamond Height", "NodeSocketFloat", DIAMOND_H, 0.005, 0.5),
        ("Depth", "NodeSocketFloat", EMBOSS_DEPTH, 0.0, 0.05),
        ("Crease Sharpness", "NodeSocketFloat", 6.0, 1.0, 30.0),
        ("Softness", "NodeSocketFloat", 0.6, 0.0, 1.0),
        ("Land", "NodeSocketFloat", 0.0, 0.0, 0.8),
        ("Brushing", "NodeSocketFloat", 1.0, 0.0, 3.0),
        ("Panel Width", "NodeSocketFloat", 1.2, 0.1, 10.0),
        ("Panel Height", "NodeSocketFloat", 3.0, 0.1, 10.0),
        ("Joint Width", "NodeSocketFloat", 0.004, 0.0, 0.05),
        ("Panel Warp", "NodeSocketFloat", PANEL_WARP, 0.0, 0.02),
        ("Panel Variation", "NodeSocketFloat", 1.0, 0.0, 3.0)), rebuild=rebuild)
    if g:
        _rigidized_nodes(g)
    relief = _param(params, "Depth", EMBOSS_DEPTH) + _param(params, "Panel Warp", PANEL_WARP)
    return pbr_material(_name, ng, relief, params, rebuild=rebuild)


def _rigidized_nodes(g):
    u, v = surface_coords(g)
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    relief = diamond_relief(g, u, v)
    pvalue, pcolor, edge, bow = panel_layout(g, u, v)
    half_joint = g.math("MULTIPLY", g.inp("Joint Width"), 0.5)
    roll = g.remap(edge, half_joint, g.math("ADD", half_joint, EDGE_ROLL), smooth=True)
    gap = g.remap(edge, g.math("ADD", half_joint, 0.0004), g.math("SUBTRACT", half_joint, 0.0004))
    height = g.math("MULTIPLY", roll, g.math("ADD", g.math("MULTIPLY", relief, g.inp("Depth")),
                                             g.math("MULTIPLY", bow, g.inp("Panel Warp"))))
    fine, coarse = (seamless_noise(g, torus, scale, salt, stretch=BRUSH_STRETCH, detail=3.0, rough=0.6)
                    for salt, scale in enumerate(BRUSH_SCALES, start=1))
    streak = g.lerp(fine, coarse, 0.4)
    smudge = seamless_noise(g, torus, SMUDGE_SCALE, 3, detail=4.0, rough=0.55)
    brushing, variation = g.inp("Brushing"), g.inp("Panel Variation")
    tone = g.product(g.math("ADD", 1.0, g.signed(streak, g.math("MULTIPLY", brushing, STREAK_TONE))),
                     g.math("ADD", 1.0, g.signed(pvalue, g.math("MULTIPLY", variation, PANEL_TONE))),
                     g.lerp(VALLEY_TONE, 1.0, relief))
    color = g.mix_color(gap, g.scale(g.inp("Color"), tone), JOINT_COLOR)
    rough = g.math("ADD", g.inp("Roughness"), g.signed(streak, g.math("MULTIPLY", brushing, STREAK_ROUGH)))
    rough = g.math("ADD", rough, g.signed(channel(g, pcolor, 0), g.math("MULTIPLY", variation, PANEL_ROUGH)))
    rough = g.math("ADD", rough, g.signed(smudge, SMUDGE_ROUGH))
    rough = g.math("SUBTRACT", rough, g.math("MULTIPLY", relief, BURNISH), clamp=True)
    g.out("Base Color", color)
    g.out("Roughness", g.lerp(rough, 0.6, gap))
    g.out("Metallic", g.math("SUBTRACT", 1.0, gap))
    g.out("Height", height)
    g.out("AO", g.product(g.lerp(VALLEY_AO, 1.0, relief), g.lerp(1.0, 0.3, gap)))


def rigidized_bronze(rebuild=False, **params):
    return rigidized(rebuild=rebuild, _name="M_RigidizedBronze", **{"Color": PVD_BRONZE, "Roughness": 0.28, **params})


# ---------------------------------------------------------------- standing seam roofs

CHARCOAL = (0.0452, 0.0513, 0.0561, 1.0)  # #3c4043
VERDIGRIS = (0.144, 0.361, 0.262, 1.0)    # #6aa28c
COPPER_BROWN = (0.15, 0.072, 0.040, 1.0)
PAN_WIDTH = 0.406                         # 16 in
SEAM_WIDTH, SEAM_HEIGHT = 0.025, 0.038
COPPER_SEAM_HEIGHT = 0.025
SEAM_SIDE = 0.0012                        # m: half the width of the seam's near-vertical side
FOLD_DROP = 0.005                         # m: the rounded fold falls away this much at the seam's shoulders
LOCK_DEPTH, LOCK_HALF = 0.0008, 0.0008    # the lock line along the top of the seam
FLARE, FLARE_W = 0.003, 0.03              # the pan rises into the seam's leg
OIL_CANNING = 0.0018                      # m
OIL_SCALE, OIL_STRETCH, OIL_GAIN = 1.4, (0.4, 1.0), 2.2


def seam_profile(g, u):
    """Pans across u: (pan id, fraction across the pan, seam mask, seam-top height, cove height 0..1, pan envelope)."""
    idx, frac, pitch = wrapped_cells(g.nodes, g.links, u, g.inp("Pan Width"), g.inp("Tile"), g.loc())
    d = edge_distance(g, frac, pitch)
    half = g.math("MULTIPLY", g.inp("Seam Width"), 0.5)
    rib = g.remap(d, g.math("ADD", half, SEAM_SIDE), g.math("SUBTRACT", half, SEAM_SIDE), smooth=True)
    shoulder = g.math("POWER", g.math("DIVIDE", d, half, clamp=True), 4.0)
    lock = g.remap(d, LOCK_HALF, 0.0, smooth=True)
    top = g.math("SUBTRACT", g.inp("Seam Height"), g.math("MULTIPLY_ADD", shoulder, FOLD_DROP, g.math("MULTIPLY", lock, LOCK_DEPTH)))
    cove = g.math("POWER", g.remap(d, g.math("ADD", half, FLARE_W), half, smooth=True), 2.0)
    envelope = g.math("SINE", g.math("MULTIPLY", frac, pymath.pi))
    return idx, frac, rib, top, cove, envelope, lock


def seam_height(g, torus, idx, rib, top, cove, envelope, oil_amount):
    """Pan (oil canning + cove) under the seam rib; oil canning is a soft per-pan buckle that dies out at the seams."""
    pan_value, _ = cell_hash(g, idx, 0.0, 3)
    buckle = seamless_noise(g, torus, OIL_SCALE, 3, stretch=OIL_STRETCH, w_offset=g.math("MULTIPLY", pan_value, 40.0),
                            detail=1.5, rough=0.5)
    wave = g.math("MULTIPLY", g.signed(buckle, OIL_GAIN), envelope)
    pan = g.math("MULTIPLY_ADD", g.math("ADD", 1.0, wave, clamp=False), oil_amount, g.math("MULTIPLY", cove, FLARE))
    pan = g.math("MAXIMUM", pan, 0.0)
    return g.lerp(pan, top, rib), pan_value


def roof_inputs(seam_h):
    return (("Pan Width", "NodeSocketFloat", PAN_WIDTH, 0.15, 1.0),
            ("Seam Width", "NodeSocketFloat", SEAM_WIDTH, 0.01, 0.08),
            ("Seam Height", "NodeSocketFloat", seam_h, 0.005, 0.08),
            ("Oil Canning", "NodeSocketFloat", OIL_CANNING, 0.0, 0.01))


def standing_seam(rebuild=False, **params):
    ng, g = new_graph("IS Standing Seam", (("Color", "NodeSocketColor", CHARCOAL),
                                           ("Roughness", "NodeSocketFloat", 0.40, 0.0, 1.0)) + roof_inputs(SEAM_HEIGHT) + (
        ("Pan Variation", "NodeSocketFloat", 1.0, 0.0, 3.0),
        ("Weathering", "NodeSocketFloat", 1.0, 0.0, 3.0)), rebuild=rebuild)
    if g:
        _standing_seam_nodes(g)
    return pbr_material("M_StandingSeam", ng, _param(params, "Seam Height", SEAM_HEIGHT), params, rebuild=rebuild)


def _standing_seam_nodes(g):
    u, _ = surface_coords(g)
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    idx, _, rib, top, cove, envelope, lock = seam_profile(g, u)
    height, pan_value = seam_height(g, torus, idx, rib, top, cove, envelope, g.inp("Oil Canning"))
    chalk = seamless_noise(g, torus, 0.7, 4, detail=4.0, rough=0.6)
    dirt = seamless_noise(g, torus, 22.0, 5, stretch=(1.0, 0.04), detail=3.0, rough=0.6)
    grime = g.math("MULTIPLY", g.remap(dirt, 0.5, 0.72), g.inp("Weathering"))
    tone = g.product(g.math("ADD", 1.0, g.signed(pan_value, g.math("MULTIPLY", g.inp("Pan Variation"), 0.05))),
                     g.math("ADD", 1.0, g.signed(chalk, g.math("MULTIPLY", g.inp("Weathering"), 0.06))),
                     g.math("SUBTRACT", 1.0, g.math("MULTIPLY", grime, 0.10)),
                     g.math("ADD", 1.0, g.math("MULTIPLY", rib, 0.04)))
    rough = g.math("ADD", g.inp("Roughness"), g.signed(chalk, 0.04))
    rough = g.math("ADD", rough, g.math("MULTIPLY", grime, 0.06))
    rough = g.math("ADD", rough, g.signed(pan_value, g.math("MULTIPLY", g.inp("Pan Variation"), 0.025)))
    rough = g.math("SUBTRACT", rough, g.math("MULTIPLY", rib, 0.04), clamp=True)
    g.out("Base Color", g.scale(g.inp("Color"), tone))
    g.out("Roughness", rough)
    g.out("Metallic", 0.0)
    g.out("Height", height)
    g.out("AO", g.product(g.math("SUBTRACT", 1.0, g.math("MULTIPLY", cove, 0.3)), g.math("SUBTRACT", 1.0, g.math("MULTIPLY", lock, 0.4))))


PATINA_CRUST = 0.0004                     # m: verdigris stands a hair proud of the copper


def copper_roof(rebuild=False, **params):
    ng, g = new_graph("IS Copper Roof", (("Patina Color", "NodeSocketColor", VERDIGRIS),
                                         ("Copper Color", "NodeSocketColor", COPPER_BROWN),
                                         ("Patina Amount", "NodeSocketFloat", 0.6, 0.0, 1.0),
                                         ("Streaks", "NodeSocketFloat", 1.0, 0.0, 2.0)) + roof_inputs(COPPER_SEAM_HEIGHT),
                      rebuild=rebuild)
    if g:
        _copper_nodes(g)
    relief = _param(params, "Seam Height", COPPER_SEAM_HEIGHT) + PATINA_CRUST
    return pbr_material("M_CopperRoof", ng, relief, params, rebuild=rebuild)


def _copper_nodes(g):
    u, _ = surface_coords(g)
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    idx, _, rib, top, cove, envelope, lock = seam_profile(g, u)
    height, pan_value = seam_height(g, torus, idx, rib, top, cove, envelope, g.inp("Oil Canning"))
    blotch = seamless_noise(g, torus, 0.9, 6, detail=4.0, rough=0.6)
    runs = seamless_noise(g, torus, 30.0, 7, stretch=(1.0, 0.035), detail=3.0, rough=0.65)
    grain = seamless_noise(g, torus, 120.0, 8, detail=3.0, rough=0.7)
    shade = seamless_noise(g, torus, 3.0, 9, detail=3.0, rough=0.6)
    cover = g.product(blotch, 0.55)
    cover = g.math("MULTIPLY_ADD", runs, g.math("MULTIPLY", g.inp("Streaks"), 0.45), cover)
    cover = g.math("MULTIPLY_ADD", envelope, 0.12, cover)
    cover = g.math("MULTIPLY_ADD", rib, -0.3, cover)
    cover = g.math("MULTIPLY_ADD", grain, 0.12, cover)
    cover = g.math("MULTIPLY_ADD", g.inp("Patina Amount"), 0.6, cover)
    patina = g.remap(cover, 0.78, 0.9, smooth=True)
    pale = g.mix_color(g.remap(shade, 0.45, 0.7), g.inp("Patina Color"), g.scale(g.inp("Patina Color"), 1.35))
    green = g.scale(pale, g.math("ADD", 0.85, g.math("MULTIPLY", grain, 0.3)))
    brown = g.scale(g.inp("Copper Color"), g.math("ADD", 0.75, g.math("MULTIPLY", shade, 0.6)))
    g.out("Base Color", g.mix_color(patina, brown, green))
    g.out("Roughness", g.lerp(g.math("ADD", 0.38, g.math("MULTIPLY", grain, 0.15)), g.math("ADD", 0.7, g.math("MULTIPLY", grain, 0.2)), patina))
    g.out("Metallic", g.lerp(0.75, 0.0, patina))
    g.out("Height", g.math("MULTIPLY_ADD", g.math("MULTIPLY", patina, grain), PATINA_CRUST, height))
    g.out("AO", g.product(g.math("SUBTRACT", 1.0, g.math("MULTIPLY", cove, 0.3)), g.math("SUBTRACT", 1.0, g.math("MULTIPLY", lock, 0.4))))


# ---------------------------------------------------------------- steel trim

DARK_STEEL = (0.0438, 0.0497, 0.0578, 1.0)  # #3b3f44
ORANGE_PEEL = 0.00015                       # m


def steel(rebuild=False, **params):
    ng, g = new_graph("IS Steel", (("Color", "NodeSocketColor", DARK_STEEL),
                                   ("Roughness", "NodeSocketFloat", 0.48, 0.0, 1.0),
                                   ("Metallic", "NodeSocketFloat", 0.0, 0.0, 1.0),
                                   ("Mill Scale", "NodeSocketFloat", 1.0, 0.0, 3.0),
                                   ("Orange Peel", "NodeSocketFloat", ORANGE_PEEL, 0.0, 0.002)), rebuild=rebuild)
    if g:
        _steel_nodes(g)
    return pbr_material("M_Steel", ng, _param(params, "Orange Peel", ORANGE_PEEL), params, rebuild=rebuild)


def _steel_nodes(g):
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    mottle = seamless_noise(g, torus, 2.2, 1, detail=6.0, rough=0.6, distortion=0.6)
    rolling = seamless_noise(g, torus, 40.0, 2, stretch=(0.05, 1.0), detail=3.0, rough=0.6)
    peel = seamless_noise(g, torus, 350.0, 3, detail=2.0, rough=0.5)
    hue = seamless_noise(g, torus, 0.8, 4, detail=2.0, rough=0.5)
    amount = g.inp("Mill Scale")
    tone = g.product(g.math("ADD", 1.0, g.signed(mottle, g.math("MULTIPLY", amount, 0.12))),
                     g.math("ADD", 1.0, g.signed(rolling, g.math("MULTIPLY", amount, 0.04))))
    warm = g.mix_color(g.remap(hue, 0.35, 0.65), (1.0, 1.0, 1.0, 1.0), (1.08, 1.0, 0.9, 1.0))
    color = g.add("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY",
                  inputs={"Factor_Float": g.math("MULTIPLY", amount, 0.5, clamp=True), "A_Color": g.inp("Color"), "B_Color": warm})
    rough = g.math("ADD", g.inp("Roughness"), g.signed(mottle, g.math("MULTIPLY", amount, 0.07)))
    rough = g.math("ADD", rough, g.signed(rolling, 0.03), clamp=True)
    g.out("Base Color", g.scale(_socket(color.outputs, "Result_Color"), tone))
    g.out("Roughness", rough)
    g.out("Metallic", g.inp("Metallic"))
    g.out("Height", g.math("MULTIPLY", g.remap(peel, 0.25, 0.75), g.inp("Orange Peel")))
    g.out("AO", 1.0)


MATERIALS = {"rigidized_metal": rigidized, "rigidized_bronze": rigidized_bronze, "standing_seam": standing_seam,
             "copper_roof": copper_roof, "steel": steel}
