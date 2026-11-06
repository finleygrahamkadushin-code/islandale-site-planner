"""Kurinuki: earthen wall panels carved like a kurinuki pot, for the Gathering prow.

Kurinuki ("hollowed out") pots are carved from a solid block of clay with knives, planes and wire instead of thrown. The skin
is a field of irregular, nearly flat cuts that meet in crisp arrises; wire-cut faces carry fine parallel ripples and torn grog;
wood firing (Shigaraki, Iga, Bizen) adds iron-red flashing, charcoal carbon-trap shadows and natural ash glaze that melts to a
pale green glass on up-facing cuts and runs down from them. At wall scale the cuts are a hand's width or two.

How it is built
  Cuts: 4D Voronoi cells about Facet Size across (on the torus, so they tile). Each cell is cut as the tangent plane of a
    smooth carved form B (a low noise) at the cell's centre, tilted and set back a little at random. Two neighbouring cuts
    meet in their lower envelope where they slope apart (an arris) and the upper one where they slope together (a crease),
    taken over the nearest and second-nearest cells, so the surface is continuous and only the cut lines are sharp.
  Arrises crumble and tear where the clay pulled away from the blade; wire-cut faces get ripples across the cut direction.
  Grog and feldspar grains burst through the skin (white specks, some plucked out as pits); iron spots bleed rust halos.
  Firing: a slow field of iron-red flash, stronger on cuts facing the fire; carbon trap in drifts; ash melts on the cuts that
    face up, gathers in creases and runs down in drips, glossy where thick. With Glaze Cover the same carving wears a thick
    glaze (shino): fine marks soften, fire colour shows where the glaze is thin on the arrises, carbon traps in specks.

Parameters
  Tile, Seed: the repeat (m) and the layout.
  Facet Size (m): mean width of a cut. Facet Stretch: cuts run this many times longer up the wall than across it.
  Relief (m): total depth, arris top to deepest hollow; Height spans 0..Relief.
  Edge Softness (m of height): how much arrises and creases round over; a fraction of a mm for raw clay, a few under glaze.
  Clay Color, Flash Color, Carbon Color, Ash Glaze Color and the Flash, Carbon and Ash Amounts: the firing.
  Striation: share of cuts made with the wire, and how strongly they ripple. Speckle: grog and feldspar grains.
  Iron Spots: dark iron specks with rusty halos. Clay Roughness: the bare body (or the glaze, with Glaze Cover).
  Glaze Cover: 0 bare wood-fired clay, 1 a thick glaze (shino) over the carving."""
from collections import namedtuple

import bpy

from .common import TILE_DEFAULT, new_group, node, pbr_material, torus4d

GROUP = "IS Kurinuki"
PI = 3.141592653589793

FACET_SIZE = 0.16           # m: mean cut width
RELIEF = 0.035              # m: arris top to deepest hollow
FACET_SCALE_K = 0.62        # 4D Voronoi scale x Facet Size: its sections through the torus come out about Facet Size across
FACET_RANDOMNESS = 1.0
FIELD_WAVE = 3.2            # the carved form B undulates this many cuts per wavelength
FIELD_GAIN = 2.2            # B's amplitude, in Relief
FIELD_EPS = 0.01            # m: finite-difference step for B's slope at a cell centre
JITTER_SLOPE = 1.10         # random extra tilt of each cut, in Relief / Facet Size
JITTER_DEPTH = 0.08         # random set-back of each cut, in Relief
CREASE_SLOPE_MIN = 0.02     # floor on the slope change across a crease when turning a height gap into a distance
CHIP_WIDTH = 0.012          # m: how far tearing reaches in from an arris
CHIP_DEPTH = 0.16           # in Relief
STRIA_PITCH = 0.0045        # m: wire ripple spacing across the cut
STRIA_LENGTH = 0.09         # m: how far a ripple runs before it wanders
STRIA_DEPTH = 0.0006        # m: peak-to-peak ripple
GRAIN_SPACING = 0.007       # m: grog grain lattice
GRAIN_RADIUS = 0.30         # in grain cells
GRAIN_MAX_SHARE = 0.32      # grains per cell at Speckle 1
GRAIN_BUMP = 0.0003         # m
GRAIN_PIT = 0.0007          # m
IRON_SPACING = 0.035        # m
IRON_MAX_SHARE = 0.45
IRON_RADIUS = 0.08          # in iron cells
SKIN_SCALE = 140.0          # sandy body texture (~7 mm)
SKIN_DEPTH = 0.00025        # m
PEEL_SCALE = 230.0          # the glaze's orange-peel (yuzu hada)
PEEL_DEPTH = 0.0004         # m
ASH_THICKNESS = 0.0007      # m of glass where the ash runs thick
DRIP_SCALE = 22.0           # ash drips: narrow across ...
DRIP_STRETCH = 0.11         # ... and this much stretched downwards
CAVITY_REF = 0.22           # in Relief: how far below B a crease must sit to count as a full hollow
FIRE_DIR = (0.75, 0.35, 0.0)  # cuts sloping this way (rising toward +u, then +v) face the fire and flash harder
FELDSPAR = (0.80, 0.76, 0.68)  # sRGB
IRON = (0.14, 0.075, 0.045)
RUST = (0.52, 0.27, 0.12)

# 4D offsets per noise, scaled by Seed, so each field is its own pattern and Seed reshuffles them all
SALT = {"cuts": (1.37, -2.11, 0.73, 1.91), "form": (-0.61, 1.73, 2.29, -1.17), "tear": (2.41, 0.37, -1.53, 0.83),
        "grain": (-1.79, -0.97, 1.21, 2.63), "iron": (0.53, 2.87, -0.79, -1.41), "flash": (1.11, 1.47, 0.29, -2.03),
        "carbon": (-2.33, 0.61, 1.67, 0.47), "ash": (0.89, -1.63, -2.17, 1.39), "skin": (2.03, 1.19, 0.91, -0.67),
        "drip": (-1.07, 2.39, 0.57, 1.83), "peel": (1.59, -0.43, -1.97, -2.51)}

Cell = namedtuple("Cell", "plane slope delta rand")
Facets = namedtuple("Facets", "height slope delta rand ridge crease")


def _lin(r, g, b):
    """sRGB -> linear RGBA, so colours read as they would in a paint chart."""
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return (f(r), f(g), f(b), 1.0)


def _sock(coll, ident):
    return next(s for s in coll if s.identifier == ident)


class _Graph:
    """Terse node building inside one group: every input takes a number, a tuple or a socket."""
    ROWS = 40

    def __init__(self, nodes, links):
        self.nodes, self.links, self.count = nodes, links, 0

    def loc(self):
        self.count += 1
        return (-1000 + 180 * (self.count // self.ROWS), 1200 - 60 * (self.count % self.ROWS))

    def new(self, typ, **props):
        return node(self.nodes, typ, self.loc(), **props)

    def feed(self, sock, x):
        if x is None:
            return
        if isinstance(x, bpy.types.NodeSocket):
            self.links.new(x, sock)
        else:
            sock.default_value = x

    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b, c)):
            self.feed(n.inputs[i], x)
        return n.outputs[0]

    def vm(self, op, a, b=None, scale=None):
        n = self.new("ShaderNodeVectorMath", operation=op)
        self.feed(n.inputs[0], a)
        self.feed(n.inputs[1], b)
        self.feed(n.inputs[3], scale)
        return n.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs[0]

    def sep(self, v):
        n = self.new("ShaderNodeSeparateXYZ")
        self.feed(n.inputs[0], v)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def comb(self, x, y, z=0.0):
        n = self.new("ShaderNodeCombineXYZ")
        for i, c in enumerate((x, y, z)):
            self.feed(n.inputs[i], c)
        return n.outputs[0]

    def mix(self, fac, a, b, kind="FLOAT"):
        n = self.new("ShaderNodeMix", data_type=kind)
        suffix = {"FLOAT": "Float", "VECTOR": "Vector", "RGBA": "Color"}[kind]
        self.feed(_sock(n.inputs, "Factor_Float"), fac)
        self.feed(_sock(n.inputs, f"A_{suffix}"), a)
        self.feed(_sock(n.inputs, f"B_{suffix}"), b)
        return _sock(n.outputs, f"Result_{suffix}")

    def smooth(self, e0, e1, x):
        """smoothstep(e0, e1, x); e0 > e1 runs it backwards."""
        n = self.new("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        for i, v in enumerate((x, e0, e1, 0.0, 1.0)):
            self.feed(n.inputs[i], v)
        return n.outputs[0]

    def noise(self, coords, scale, detail=2.0, rough=0.5, distortion=0.0, dims="4D"):
        n = self.new("ShaderNodeTexNoise", noise_dimensions=dims, noise_type="FBM")
        vec, w = coords
        self.feed(n.inputs["Vector"], vec)
        if w is not None:
            self.feed(n.inputs["W"], w)
        for k, v in (("Scale", scale), ("Detail", detail), ("Roughness", rough), ("Distortion", distortion)):
            self.feed(n.inputs[k], v)
        return n.outputs[0]

    def voronoi(self, coords, scale, feature="F1", randomness=1.0):
        n = self.new("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature=feature)
        vec, w = coords
        self.feed(n.inputs["Vector"], vec)
        self.feed(n.inputs["W"], w)
        self.feed(n.inputs["Scale"], scale)
        self.feed(n.inputs["Detail"], 0.0)
        self.feed(n.inputs["Randomness"], randomness)
        return n


INPUTS = (
    ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0),
    ("Seed", "NodeSocketFloat", 0.0, 0.0, 1000.0),
    ("Facet Size", "NodeSocketFloat", FACET_SIZE, 0.03, 1.0),
    ("Facet Stretch", "NodeSocketFloat", 1.3, 0.5, 3.0),
    ("Relief", "NodeSocketFloat", RELIEF, 0.0, 0.1),
    ("Edge Softness", "NodeSocketFloat", 0.0008, 0.0, 0.01),
    ("Clay Color", "NodeSocketColor", _lin(0.62, 0.44, 0.27)),
    ("Flash Color", "NodeSocketColor", _lin(0.66, 0.30, 0.15)),
    ("Carbon Color", "NodeSocketColor", _lin(0.17, 0.15, 0.13)),
    ("Ash Glaze Color", "NodeSocketColor", _lin(0.62, 0.64, 0.38)),
    ("Flash Amount", "NodeSocketFloat", 0.45, 0.0, 1.0),
    ("Carbon Amount", "NodeSocketFloat", 0.35, 0.0, 1.0),
    ("Ash Amount", "NodeSocketFloat", 0.12, 0.0, 1.0),
    ("Striation", "NodeSocketFloat", 0.3, 0.0, 1.0),
    ("Speckle", "NodeSocketFloat", 0.5, 0.0, 1.0),
    ("Iron Spots", "NodeSocketFloat", 0.3, 0.0, 1.0),
    ("Clay Roughness", "NodeSocketFloat", 0.86, 0.0, 1.0),
    ("Glaze Cover", "NodeSocketFloat", 0.0, 0.0, 1.0),
)
OUTPUTS = (("Base Color", "NodeSocketColor"), ("Roughness", "NodeSocketFloat"), ("Metallic", "NodeSocketFloat"),
           ("Height", "NodeSocketFloat"), ("AO", "NodeSocketFloat"))


class _Ctx:
    """The group's inputs and the derived sockets every stage shares."""

    def __init__(self, g, gin):
        self.g, self.gin = g, gin
        self.inp = {s.name: s for s in gin.outputs if s.name}
        i = self.inp
        self.tile, self.seed, self.relief = i["Tile"], i["Seed"], i["Relief"]
        self.u, self.v, _ = g.sep(i["Vector"])
        self.half = g.m("MULTIPLY", self.tile, 0.5)
        self.neg_half = g.m("MULTIPLY", self.tile, -0.5)
        self.radius = g.m("DIVIDE", self.tile, 2 * PI)               # metres per radian round the torus
        self.facet = g.m("MAXIMUM", i["Facet Size"], 0.01)
        self.soft = g.m("MAXIMUM", i["Edge Softness"], 1e-5)
        self.torus = torus4d(g.nodes, g.links, i["Vector"], self.tile, loc=g.loc())
        self.field_scale = g.m("DIVIDE", 1.0, g.m("MULTIPLY", self.facet, FIELD_WAVE))
        self.field_amp = g.m("MULTIPLY", self.relief, FIELD_GAIN)
        self.slope_ref = g.m("DIVIDE", self.relief, self.facet)       # a typical cut's tilt (rise per run)

    def coords(self, salt, ku=1.0, kv=1.0, base=None):
        """Seeded 4D torus coordinates; ku, kv shrink the u and v circles, stretching features along them (still exact)."""
        g = self.g
        vec, w = base or self.torus
        if ku != 1.0 or kv != 1.0:
            vec = g.vm("MULTIPLY", vec, g.comb(ku, ku, kv))
            w = g.m("MULTIPLY", w, kv)
        off = SALT[salt]
        return (g.vm("ADD", vec, g.vm("SCALE", off[:3], scale=self.seed)),
                g.m("MULTIPLY_ADD", self.seed, off[3], w))

    def unseed(self, salt, vec, w):
        g, off = self.g, SALT[salt]
        return g.vm("SUBTRACT", vec, g.vm("SCALE", off[:3], scale=self.seed)), g.m("MULTIPLY_ADD", self.seed, -off[3], w)

    def form(self, u=None, v=None):
        """The smooth carved form B (m) at (u, v), or at the shading point."""
        g = self.g
        base = None if u is None else torus4d(g.nodes, g.links, g.comb(u, v), self.tile, loc=g.loc())
        fac = g.noise(self.coords("form", base=base), self.field_scale, detail=1.0)
        return g.m("MULTIPLY", g.m("SUBTRACT", fac, 0.5), self.field_amp)


def _cell(ctx, vor):
    """One Voronoi cell's cut: the tangent plane of B at the cell's centre, plus its own random tilt and set-back."""
    g = ctx.g
    pos, w = ctx.unseed("cuts", vor.outputs["Position"], vor.outputs["W"])
    x, y, z = g.sep(pos)
    uc = g.m("MULTIPLY", g.m("ARCTAN2", y, x), ctx.radius)      # the centre, back on the wall (m)
    vc = g.m("MULTIPLY", g.m("ARCTAN2", w, z), ctx.radius)
    du = g.m("WRAP", g.m("SUBTRACT", ctx.u, uc), ctx.half, ctx.neg_half)
    dv = g.m("WRAP", g.m("SUBTRACT", ctx.v, vc), ctx.half, ctx.neg_half)
    delta = g.comb(du, dv)
    b0 = ctx.form(uc, vc)
    bu = ctx.form(g.m("ADD", uc, FIELD_EPS), vc)
    bv = ctx.form(uc, g.m("ADD", vc, FIELD_EPS))
    grad = g.vm("SCALE", g.comb(g.m("SUBTRACT", bu, b0), g.m("SUBTRACT", bv, b0)), scale=1.0 / FIELD_EPS)
    rand = vor.outputs["Color"]
    jitter = g.vm("SCALE", g.vm("SUBTRACT", rand, (0.5, 0.5, 0.0)), scale=g.m("MULTIPLY", ctx.slope_ref, 2 * JITTER_SLOPE))
    slope = g.vm("ADD", grad, g.comb(*g.sep(jitter)[:2]))
    setback = g.m("MULTIPLY", g.sep(rand)[2], g.m("MULTIPLY", ctx.relief, -JITTER_DEPTH))
    plane = g.m("ADD", g.m("ADD", b0, setback), g.vm("DOT_PRODUCT", slope, delta))
    return Cell(plane, slope, delta, rand)


def _facets(ctx):
    """Join the nearest two cuts: lower envelope at an arris, upper at a crease (symmetric in the pair, so continuous)."""
    g = ctx.g
    coords = ctx.coords("cuts", 1.0, g.m("DIVIDE", 1.0, ctx.inp["Facet Stretch"]))
    scale = g.m("DIVIDE", FACET_SCALE_K, ctx.facet)
    c1 = _cell(ctx, g.voronoi(coords, scale, "F1", FACET_RANDOMNESS))
    c2 = _cell(ctx, g.voronoi(coords, scale, "F2", FACET_RANDOMNESS))
    apart = g.vm("DOT_PRODUCT", g.vm("SUBTRACT", c2.slope, c1.slope), g.vm("SUBTRACT", c1.delta, c2.delta))
    ridge = g.m("LESS_THAN", apart, 0.0)
    height = g.mix(ridge, g.m("SMOOTH_MAX", c1.plane, c2.plane, ctx.soft), g.m("SMOOTH_MIN", c1.plane, c2.plane, ctx.soft))
    gap = g.m("SUBTRACT", c1.plane, c2.plane)
    lead = g.m("MULTIPLY", gap, g.m("MULTIPLY_ADD", ridge, 2.0, -1.0))     # > 0: the second cut is the one you see
    sel = g.smooth(g.m("MULTIPLY", ctx.soft, -1.0), ctx.soft, lead)
    turn = g.m("MAXIMUM", g.vm("DISTANCE", c1.slope, c2.slope), CREASE_SLOPE_MIN)
    crease = g.m("DIVIDE", g.m("ABSOLUTE", gap), turn)                     # m from the line where the two cuts meet
    pick = lambda a, b: g.mix(sel, a, b, "VECTOR")  # noqa: E731
    return Facets(height, pick(c1.slope, c2.slope), pick(c1.delta, c2.delta), pick(c1.rand, c2.rand), ridge, crease)


def _rand(g, value, k):
    """Another 0..1 random from a per-cell one."""
    return g.m("FRACT", g.m("MULTIPLY", value, k))


def _wire(ctx, f):
    """Wire ripples across the visible cut (m, about 0) and the share of the cut that is wire-cut (0..1)."""
    g = ctx.g
    r1, r2, r3 = g.sep(f.rand)
    theta = g.m("MULTIPLY", _rand(g, r1, 7.31), PI)
    c, s = g.m("COSINE", theta), g.m("SINE", theta)
    du, dv, _ = g.sep(f.delta)
    across = g.m("ADD", g.m("MULTIPLY", du, c), g.m("MULTIPLY", dv, s))
    along = g.m("SUBTRACT", g.m("MULTIPLY", dv, c), g.m("MULTIPLY", du, s))
    pos = g.comb(g.m("DIVIDE", across, STRIA_PITCH), g.m("DIVIDE", along, STRIA_LENGTH), g.m("MULTIPLY", r2, 37.0))
    rip = g.noise((pos, None), 1.0, detail=3.0, rough=0.6, distortion=0.4, dims="3D")
    strength = g.m("SUBTRACT", ctx.inp["Striation"], _rand(g, r3, 5.17))
    wired = g.smooth(-0.05, 0.25, strength)
    return g.m("MULTIPLY", g.m("SUBTRACT", rip, 0.5), g.m("MULTIPLY", wired, 2 * STRIA_DEPTH)), wired


def _grains(ctx):
    """Grog and feldspar: (white grain 0..1, dark grain 0..1, height m, pit 0..1)."""
    g = ctx.g
    vor = g.voronoi(ctx.coords("grain"), 1.0 / GRAIN_SPACING, "F1", 1.0)
    r1, r2, r3 = g.sep(vor.outputs["Color"])
    present = g.m("LESS_THAN", r1, g.m("MULTIPLY", ctx.inp["Speckle"], GRAIN_MAX_SHARE))
    radius = g.m("MULTIPLY_ADD", r2, GRAIN_RADIUS * 0.6, GRAIN_RADIUS * 0.6)
    core = g.m("MULTIPLY", g.smooth(radius, g.m("MULTIPLY", radius, 0.7), vor.outputs["Distance"]), present)
    plucked = g.m("LESS_THAN", r3, 0.3)
    pit = g.m("MULTIPLY", core, plucked)
    proud = g.m("SUBTRACT", core, pit)
    dark = g.m("MULTIPLY", proud, g.m("LESS_THAN", _rand(g, r2, 3.7), 0.22))
    white = g.m("SUBTRACT", proud, dark)
    h = g.m("SUBTRACT", g.m("MULTIPLY", proud, GRAIN_BUMP), g.m("MULTIPLY", pit, GRAIN_PIT))
    return white, dark, h, pit


def _iron(ctx):
    """Iron spots: (core 0..1, halo 0..1)."""
    g = ctx.g
    vor = g.voronoi(ctx.coords("iron"), 1.0 / IRON_SPACING, "F1", 1.0)
    r1, r2, _ = g.sep(vor.outputs["Color"])
    present = g.m("LESS_THAN", r1, g.m("MULTIPLY", ctx.inp["Iron Spots"], IRON_MAX_SHARE))
    radius = g.m("MULTIPLY_ADD", r2, IRON_RADIUS, IRON_RADIUS * 0.4)
    d = vor.outputs["Distance"]
    core = g.m("MULTIPLY", g.smooth(radius, g.m("MULTIPLY", radius, 0.6), d), present)
    halo = g.m("MULTIPLY", g.smooth(g.m("MULTIPLY", radius, 3.2), radius, d), present)
    return core, halo


def _build(rebuild):
    ng, nodes, links, gin, gout = new_group(GROUP, inputs=INPUTS, outputs=OUTPUTS, rebuild=rebuild)
    if not nodes:
        return ng
    g = _Graph(nodes, links)
    ctx = _Ctx(g, gin)
    i = ctx.inp
    f = _facets(ctx)
    cover = i["Glaze Cover"]
    bare = g.m("SUBTRACT", 1.0, g.m("MULTIPLY", cover, 0.75))               # how much fine carving shows through

    # where the cut sits against the carved form: + on arrises, - in creases
    cav = g.m("DIVIDE", g.m("SUBTRACT", f.height, ctx.form()), g.m("MULTIPLY", ctx.relief, CAVITY_REF))
    hollow = g.smooth(0.15, 1.0, g.m("MULTIPLY", cav, -1.0))
    proud = g.smooth(0.2, 1.0, cav)
    su, sv, _ = g.sep(g.vm("SCALE", f.slope, scale=g.m("DIVIDE", 1.0, ctx.slope_ref)))
    facing_up = g.m("MULTIPLY", sv, -1.0)                                    # cuts leaning back catch the falling ash
    facing_fire = g.vm("DOT_PRODUCT", g.comb(su, sv), FIRE_DIR)

    # torn arrises
    tear = g.noise(ctx.coords("tear"), 1.0 / CHIP_WIDTH, detail=3.0, rough=0.65)
    reach = g.m("MAXIMUM", g.m("MULTIPLY", CHIP_WIDTH, g.m("MULTIPLY_ADD", tear, 2.2, -0.5)), 1e-5)
    torn = g.m("MULTIPLY", g.smooth(reach, 0.0, f.crease), f.ridge)
    chip = g.m("MULTIPLY", torn, g.m("MULTIPLY", ctx.relief, CHIP_DEPTH))

    ripple, wired = _wire(ctx, f)
    white, dark, grain_h, pit = _grains(ctx)
    iron_core, iron_halo = _iron(ctx)
    skin = g.noise(ctx.coords("skin"), SKIN_SCALE, detail=4.0, rough=0.6)
    peel = g.noise(ctx.coords("peel"), PEEL_SCALE, detail=2.0, rough=0.5)

    # firing
    flash_n = g.noise(ctx.coords("flash"), 0.45, detail=3.0, rough=0.55)
    carbon_n = g.noise(ctx.coords("carbon"), 0.6, detail=4.0, rough=0.6)
    ash_n = g.noise(ctx.coords("ash"), 0.5, detail=3.0, rough=0.5)
    drip_n = g.noise(ctx.coords("drip", 1.0, DRIP_STRETCH), DRIP_SCALE, detail=3.0, rough=0.5)
    mottle = g.noise(ctx.coords("skin"), 11.0, detail=4.0, rough=0.6)
    r_cut = _rand(g, g.sep(f.rand)[2], 11.3)

    kiln_flash = g.smooth(0.38, 0.72, g.m("ADD", g.m("MULTIPLY_ADD", facing_fire, 0.12, flash_n),
                                         g.m("MULTIPLY", g.m("SUBTRACT", r_cut, 0.5), 0.14)))
    thin_glaze = g.m("MULTIPLY", g.m("MAXIMUM", proud, torn), g.smooth(0.3, 0.6, flash_n))
    flash = g.m("MULTIPLY", g.mix(cover, kiln_flash, thin_glaze), i["Flash Amount"], clamp=True)
    carbon_field = g.m("MULTIPLY_ADD", hollow, 0.12, carbon_n)
    carbon_patch = g.smooth(g.m("SUBTRACT", 0.78, g.m("MULTIPLY", i["Carbon Amount"], 0.3)), 0.8, carbon_field)
    carbon_speck = g.m("MULTIPLY", g.smooth(0.66, 0.72, mottle), cover)
    carbon = g.m("MULTIPLY", g.m("MAXIMUM", carbon_patch, carbon_speck), g.m("MINIMUM", g.m("MULTIPLY", i["Carbon Amount"], 2.5), 1.0))

    ash_zone = g.smooth(0.36, 0.62, ash_n)
    drips = g.m("MULTIPLY", g.smooth(0.58, 0.7, drip_n), g.smooth(0.45, 0.7, ash_n))
    ash_lay = g.m("ADD", g.m("MULTIPLY", g.smooth(0.0, 0.9, facing_up), 0.8), g.m("MULTIPLY", hollow, 0.9))
    ash = g.m("MULTIPLY", g.m("ADD", g.m("MULTIPLY", ash_zone, ash_lay), drips), g.m("MULTIPLY", i["Ash Amount"], 1.4), clamp=True)
    glass = g.smooth(0.45, 0.85, ash)                                      # melted through: glossy and pooled

    # colour
    tone = g.m("MULTIPLY_ADD", g.m("SUBTRACT", mottle, 0.5), 0.35, 1.0)
    col = g.mix(flash, g.vm("SCALE", i["Clay Color"], scale=tone), i["Flash Color"], "RGBA")
    col = g.mix(carbon, col, i["Carbon Color"], "RGBA")
    col = g.mix(g.m("MULTIPLY", iron_halo, 0.55), col, _lin(*RUST), "RGBA")
    col = g.mix(g.m("MULTIPLY", white, g.m("SUBTRACT", 1.0, g.m("MULTIPLY", glass, 0.6))), col, _lin(*FELDSPAR), "RGBA")
    col = g.mix(g.m("MAXIMUM", dark, iron_core), col, _lin(*IRON), "RGBA")
    col = g.mix(g.m("MULTIPLY", pit, 0.6), col, g.vm("SCALE", col, scale=0.45), "RGBA")
    thin_ash = g.vm("SCALE", i["Ash Glaze Color"], scale=0.85)
    col = g.mix(g.m("MULTIPLY", g.smooth(0.05, 0.5, ash), 0.55), col, thin_ash, "RGBA")
    pooled = g.mix(hollow, i["Ash Glaze Color"], g.vm("SCALE", i["Ash Glaze Color"], scale=0.62), "RGBA")
    col = g.mix(glass, col, pooled, "RGBA")
    links.new(col, gout.inputs["Base Color"])

    # roughness
    rough = g.m("SUBTRACT", i["Clay Roughness"], g.m("MULTIPLY", flash, 0.05))
    rough = g.mix(g.m("MULTIPLY", g.m("MAXIMUM", white, iron_core), cover), rough, 0.35)
    rough = g.mix(g.smooth(0.05, 0.5, ash), rough, 0.55)
    rough = g.mix(glass, rough, g.m("SUBTRACT", 0.3, g.m("MULTIPLY", hollow, 0.1)))
    links.new(rough, gout.inputs["Roughness"])
    gout.inputs["Metallic"].default_value = 0.0

    # height: the carving, then everything smaller, softened under glaze and glass
    fine = g.m("ADD", g.m("ADD", ripple, grain_h), g.m("MULTIPLY", g.m("SUBTRACT", skin, 0.5), 2 * SKIN_DEPTH))
    fine = g.m("MULTIPLY", fine, g.m("MULTIPLY", bare, g.m("SUBTRACT", 1.0, g.m("MULTIPLY", glass, 0.8))))
    glaze = g.m("ADD", g.m("MULTIPLY", g.m("MULTIPLY", g.m("SUBTRACT", peel, 0.5), 2 * PEEL_DEPTH), cover),
                g.m("MULTIPLY", glass, ASH_THICKNESS))
    pinholes = g.m("MULTIPLY", g.m("MULTIPLY", pit, cover), -GRAIN_PIT)
    h = g.m("SUBTRACT", f.height, g.m("MULTIPLY", chip, bare))
    h = g.m("ADD", g.m("ADD", h, fine), g.m("ADD", glaze, pinholes))
    height = g.m("MINIMUM", g.m("MAXIMUM", g.m("MULTIPLY_ADD", ctx.relief, 0.5, h), 0.0), ctx.relief)
    links.new(height, gout.inputs["Height"])

    # cavity for the ORM bake
    ao = g.m("SUBTRACT", 1.0, g.m("MULTIPLY", hollow, 0.45))
    ao = g.m("SUBTRACT", ao, g.m("MULTIPLY", pit, 0.5))
    ao = g.m("SUBTRACT", ao, g.m("MULTIPLY", g.m("MULTIPLY", torn, bare), 0.15), clamp=True)
    links.new(ao, gout.inputs["AO"])
    return ng


def _material(name, defaults, rebuild, params):
    p = {**defaults, **params}
    return pbr_material(name, _build(rebuild), float(p.get("Relief", RELIEF)), p, rebuild=rebuild)


SHINO = {"Clay Color": _lin(0.82, 0.78, 0.70), "Flash Color": _lin(0.78, 0.47, 0.27), "Carbon Color": _lin(0.30, 0.29, 0.28),
         "Ash Glaze Color": _lin(0.80, 0.79, 0.70), "Flash Amount": 0.75, "Carbon Amount": 0.3, "Ash Amount": 0.0,
         "Striation": 0.45, "Speckle": 0.45, "Iron Spots": 0.75, "Clay Roughness": 0.52, "Glaze Cover": 1.0,
         "Edge Softness": 0.0025}


def kurinuki(rebuild=False, **params):
    """Warm wood-fired clay: Shigaraki buff with iron-red flashing, carbon drifts and green ash glass."""
    return _material("M_Kurinuki", {}, rebuild, params)


def kurinuki_shino(rebuild=False, **params):
    """Carved under a thick white shino: ivory glaze, fire-orange on the arrises, iron spots and carbon-trap specks."""
    return _material("M_Kurinuki_Shino", SHINO, rebuild, params)


MATERIALS = {"kurinuki": kurinuki, "kurinuki_shino": kurinuki_shino}
