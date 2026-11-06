"""Ledgestone: a dry-stacked, offset ledgestone veneer of natural thin stone with tight dark shadow joints and no mortar.

The layout is hand-laid, not a grid. Courses vary in height (about 40-160 % of Course Height) and their joints step rather
than run: a course stone is sometimes two or three thin stones stacked (each now and then cut short again), and on alternate
courses an occasional tall stone spans two courses. Each course has its own stone pitch (70-140 % of Stone Length) and
offset and every stone its own jittered length, so vertical joints stagger. Vertical joints slant a little, so some stones
are wedges or trapezoids; every stone draws back from its neighbours by its own amount, tapering along its length, so the
shadow joints vary in width; corners are rounded and outlines chipped, sometimes with a chunk out of an edge.

Each stone sits at its own depth with a slightly tilted split face: broad lumps, faceted cleavage, fine bedding ridges and
grain, rolling over at the edges. Colour is per stone from a six-colour palette (weighted by the Share inputs), blended a
little toward a second pick, then varied inside the stone by mottling, bedding streaks, iron staining and lighter weathered
edges and high points. Joints are dark, recessed to Height 0 and dark in the AO output.

Height: 0 = the backing in the joints; stone faces stand Joint Depth + up to Protrusion + up to Face Roughness proud of it.

Inputs (lengths in metres):
  Tile, Seed                  the exact repeat (TILE_DEFAULT) and the layout's random seed
  Course Height               mean course height (courses run about 4-16 cm at the default)
  Stone Length                mean stone length (stones run about 12-70 cm at the default)
  Joint Width                 the dry-stack gap; each stone adds up to half as much again on each side
  Joint Depth                 how far the shallowest stone face stands in front of the joint backing
  Protrusion                  how much further the proudest stones stand out
  Face Roughness              relief of the split face (lumps, facets, bedding, grain)
  Split Chance, Tall Chance   how often a course stone is two or three thin stones; how often one spans two courses
  Color 1-6, Share 1-6        the palette and how often each colour is picked (relative weights)
  Joint Color                 the shadowed backing between stones
  Stain Color, Stain Amount   iron staining in patches on some stones
  Weathering                  lighter, chalkier edges and high points (0-1)"""
from .common import OUTPUTS, TILE_DEFAULT, new_group, node, pbr_material, torus4d

GROUP_NAME = "IS Ledgestone"

SEED_STRIDE = 17.0        # hash channels are seed * stride + channel, so seeds never share a channel
ROW_JITTER = 0.30         # course boundaries move up to this many course pitches: heights 0.4-1.6 x Course Height
LEN_JITTER = 0.28         # stone joints move up to this many stone pitches along the course
PITCH_SPREAD = (0.7, 1.4)  # each course scales Stone Length by a factor in this range
EDGE_SLANT = 0.25         # most a vertical joint leans (m across per m up): wedges and trapezoids
SLANT_CAP = 0.12          # ... capped at this many stone pitches, so joints never cross
MIN_SPLIT2, MIN_SPLIT3 = 0.075, 0.11   # m: a course this tall may hold two (three) thin stones
THREE_SHARE = 0.35        # of split stones, the share split into three
CUT_CHANCE = 0.45         # a thin stone of a split is cut short again this often
WARP_SCALE, WARP_AMP = 7.0, 0.004      # gentle wander of every joint line (noise scale, m)
CHIP_SCALE, CHIP_AMP = 38.0, 0.0022    # fine chipping of the outline
CHUNK_SCALE, CHUNK_GAIN, CHUNK_FROM = 11.0, 0.08, 0.62   # now and then a chunk out of an edge
CORNER_RADIUS = (0.005, 0.02)          # m: per-stone corner rounding
GAP_TAPER = 0.6           # joint-width change along a stone's top and bottom, as a fraction of Joint Width
FACE_TILT = (0.02, 0.05)  # most a face tilts along u and v (m per m) ...
TILT_CAP = 0.003          # ... capped at this many metres either way
EDGE_ROLL = (0.004, 0.012)             # m: radius of the rounded-over stone edge
OFFSET_SPAN = 97.0        # per-stone shift of the noise space, so neighbouring stones never share texture
LUMP_SCALE, FACET_SCALE, GRAIN_SCALE = 6.0, 16.0, 70.0
BED_PITCH = (0.006, 0.016)             # m: bedding ridge spacing per stone
FACE_MIX = (0.42, 0.28, 0.10, 0.20)    # lumps, facets, grain, bedding: shares of Face Roughness
FACE_SMOOTHEST = 0.5      # the smoothest stones carry this fraction of Face Roughness
JOINT_AO = 0.18
PALETTE_BLEND = 0.3       # most a stone leans toward its second palette pick


def _srgb(r, g, b):
    """0-255 sRGB -> linear RGBA, as colour sockets want."""
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), 1.0)


WARM = {"Color 1": _srgb(170, 138, 102), "Color 2": _srgb(198, 176, 145), "Color 3": _srgb(122, 94, 72),
        "Color 4": _srgb(160, 106, 68), "Color 5": _srgb(118, 118, 124), "Color 6": _srgb(84, 72, 66),
        "Share 1": 1.0, "Share 2": 0.7, "Share 3": 0.8, "Share 4": 0.45, "Share 5": 0.35, "Share 6": 0.3,
        "Joint Color": _srgb(58, 52, 48), "Stain Color": _srgb(150, 84, 42), "Stain Amount": 0.5}
COOL = {"Color 1": _srgb(172, 172, 168), "Color 2": _srgb(130, 130, 128), "Color 3": _srgb(70, 70, 72),
        "Color 4": _srgb(204, 202, 196), "Color 5": _srgb(114, 120, 128), "Color 6": _srgb(168, 152, 128),
        "Share 1": 1.0, "Share 2": 0.9, "Share 3": 0.35, "Share 4": 0.6, "Share 5": 0.45, "Share 6": 0.2,
        "Joint Color": _srgb(50, 50, 52), "Stain Color": _srgb(132, 102, 72), "Stain Amount": 0.2,
        "Course Height": 0.075, "Stone Length": 0.42, "Joint Width": 0.005}

INPUTS = (("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0),
          ("Seed", "NodeSocketFloat", 0.0, 0.0, 1000.0),
          ("Course Height", "NodeSocketFloat", 0.10, 0.03, 0.4),
          ("Stone Length", "NodeSocketFloat", 0.34, 0.1, 1.5),
          ("Joint Width", "NodeSocketFloat", 0.008, 0.0, 0.03),
          ("Joint Depth", "NodeSocketFloat", 0.012, 0.002, 0.05),
          ("Protrusion", "NodeSocketFloat", 0.016, 0.0, 0.05),
          ("Face Roughness", "NodeSocketFloat", 0.008, 0.0, 0.03),
          ("Split Chance", "NodeSocketFloat", 0.35, 0.0, 1.0),
          ("Tall Chance", "NodeSocketFloat", 0.14, 0.0, 1.0),
          *((f"Color {i}", "NodeSocketColor", WARM[f"Color {i}"]) for i in range(1, 7)),
          *((f"Share {i}", "NodeSocketFloat", WARM[f"Share {i}"], 0.0, 10.0) for i in range(1, 7)),
          ("Joint Color", "NodeSocketColor", WARM["Joint Color"]),
          ("Stain Color", "NodeSocketColor", WARM["Stain Color"]),
          ("Stain Amount", "NodeSocketFloat", WARM["Stain Amount"], 0.0, 1.0),
          ("Weathering", "NodeSocketFloat", 0.5, 0.0, 1.0))
DEFAULTS = {spec[0]: spec[2] for spec in INPUTS}

# hash channels (the z of the White Noise lookup)
ROW_CH, COURSE_CH, JOINT_CH, STONE_CH, SPLIT_CH, CUT_CH, ATTR_CH = range(7)


class _Graph:
    """Terse arithmetic on one node tree. Values are sockets or plain numbers; numbers fold in Python."""
    _FOLD = {"ADD": lambda a, b: a + b, "SUBTRACT": lambda a, b: a - b, "MULTIPLY": lambda a, b: a * b,
             "DIVIDE": lambda a, b: a / b, "MINIMUM": min, "MAXIMUM": max}

    def __init__(self, nodes, links):
        self.nodes, self.links = nodes, links
        self._count = 0

    def new(self, typ, inputs=None, **props):
        i = self._count
        self._count += 1
        return node(self.nodes, typ, (-1100 + (i // 45) * 190, 2400 - (i % 45) * 110), inputs, **props)

    def put(self, value, socket):
        if isinstance(value, (int, float, tuple)):
            socket.default_value = value
        else:
            self.links.new(value, socket)

    def m(self, op, a, b=None, c=None):
        args = [x for x in (a, b, c) if x is not None]
        if op in self._FOLD and all(isinstance(x, (int, float)) for x in args):
            return self._FOLD[op](*args)
        n = self.new("ShaderNodeMath", operation=op)
        for i, x in enumerate((a, b, c)):
            if x is not None:
                self.put(x, n.inputs[i])
        return n.outputs[0]

    def add(self, a, b): return self.m("ADD", a, b)
    def sub(self, a, b): return self.m("SUBTRACT", a, b)
    def mul(self, a, b): return self.m("MULTIPLY", a, b)
    def div(self, a, b): return self.m("DIVIDE", a, b)
    def mn(self, a, b): return self.m("MINIMUM", a, b)
    def mx(self, a, b): return self.m("MAXIMUM", a, b)
    def lt(self, a, b): return self.m("LESS_THAN", a, b)
    def gt(self, a, b): return self.m("GREATER_THAN", a, b)
    def floor(self, a): return self.m("FLOOR", a)
    def wrap(self, i, n): return self.m("FLOORED_MODULO", i, n)

    def lerp(self, a, b, t):
        if all(isinstance(x, (int, float)) for x in (a, b, t)):
            return a + (b - a) * t
        return self.m("MULTIPLY_ADD", self.sub(b, a), t, a)

    def pick(self, cond, a, b):
        """cond (0 or 1) ? b : a"""
        return self.lerp(a, b, cond)

    def signed(self, r, amp):
        """A 0..1 random as -amp..amp."""
        return self.mul(self.sub(r, 0.5), 2.0 * amp)

    def cap(self, x, lim):
        return self.mx(self.mn(x, lim), -lim)

    def remap(self, x, a, b, lo=0.0, hi=1.0, smooth=False):
        n = self.new("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR", clamp=True)
        for i, val in enumerate((x, a, b, lo, hi)):
            self.put(val, n.inputs[i])
        return n.outputs[0]

    def vec3(self, x, y, z):
        n = self.new("ShaderNodeCombineXYZ")
        for i, val in enumerate((x, y, z)):
            self.put(val, n.inputs[i])
        return n.outputs[0]

    def xyz(self, vec):
        n = self.new("ShaderNodeSeparateXYZ")
        self.links.new(vec, n.inputs[0])
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def vmath(self, op, a, b=None, scale=None):
        n = self.new("ShaderNodeVectorMath", operation=op)
        self.put(a, n.inputs[0])
        if b is not None:
            self.put(b, n.inputs[1])
        if scale is not None:
            self.put(scale, n.inputs[3])
        return n.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs[0]

    def hash3(self, x, y, z):
        """Three independent 0..1 randoms of (x, y, z); integer ids in, so the result repeats with the tile."""
        wn = self.new("ShaderNodeTexWhiteNoise", noise_dimensions="3D")
        self.links.new(self.vec3(x, y, z), wn.inputs["Vector"])
        sep = self.new("ShaderNodeSeparateColor")
        self.links.new(wn.outputs["Color"], sep.inputs[0])
        return sep.outputs[0], sep.outputs[1], sep.outputs[2]

    def noise4(self, vec, w, scale, detail=2.0, rough=0.5, distortion=0.0):
        n = self.new("ShaderNodeTexNoise", noise_dimensions="4D",
                     inputs={"Scale": scale, "Detail": detail, "Roughness": rough, "Distortion": distortion})
        self.links.new(vec, n.inputs["Vector"])
        self.put(w, n.inputs["W"])
        return n.outputs["Fac"]

    def mixc(self, fac, a, b, blend="MIX"):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for sock, val in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            self.put(val, sock)
        return n.outputs[2]

    def cscale(self, col, s):
        return self.vmath("SCALE", col, scale=s)


class _Inputs:
    """The group's input sockets by short name, plus hash channels offset by the seed."""

    def __init__(self, g, gin):
        self.g, self.out = g, gin.outputs
        self._chan = {}

    def __getitem__(self, name):
        return self.out[name]

    def ch(self, c):
        if c not in self._chan:
            self._chan[c] = self.g.m("MULTIPLY_ADD", self.out["Seed"], SEED_STRIDE, float(c))
        return self._chan[c]


def _jittered_cell(g, f, bounds):
    """f: position in cells past index k; bounds: where boundaries k-1, k, k+1, k+2 sit, in cells past k (each moved less than
    half a cell). Returns (offset of the holding cell from k, its start, its end), all in cells past k."""
    bm, b0, b1, b2 = bounds
    below = g.lt(f, b0)
    above = g.sub(1.0, g.lt(f, b1))
    off = g.sub(above, below)
    start = g.add(b0, g.add(g.mul(below, g.sub(bm, b0)), g.mul(above, g.sub(b1, b0))))
    end = g.add(b1, g.add(g.mul(below, g.sub(b0, b1)), g.mul(above, g.sub(b2, b1))))
    return off, start, end


def _tall_allowed(g, row, n):
    """Tall stones start only on even courses (never the last, which wraps onto course 0), so two never overlap."""
    return g.mul(g.sub(1.0, g.wrap(row, 2.0)), g.lt(row, g.sub(n, 1.5)))


def _courses(g, inp, vw):
    """The course holding each point. Courses have jittered heights; ids wrap so the layout repeats every Tile."""
    n = g.mx(g.m("ROUND", g.div(inp["Tile"], inp["Course Height"])), 2.0)
    pitch = g.div(inp["Tile"], n)
    y = g.div(vw, pitch)
    k = g.floor(y)
    f = g.sub(y, k)

    def jitter(i):
        return g.signed(g.hash3(g.wrap(i, n), 0.0, inp.ch(ROW_CH))[0], ROW_JITTER)

    off, start, end = _jittered_cell(g, f, [g.add(o, jitter(g.add(k, o))) for o in (-1.0, 0.0, 1.0, 2.0)])
    r = g.add(k, off)
    prev_start = g.add(g.sub(off, 1.0), jitter(g.sub(r, 1.0)))
    next_end = g.add(g.add(off, 2.0), jitter(g.add(r, 2.0)))
    row, row_prev = g.wrap(r, n), g.wrap(g.sub(r, 1.0), n)
    below, above = g.mul(g.sub(f, start), pitch), g.mul(g.sub(end, f), pitch)
    return {"row": row, "row_prev": row_prev, "below": below, "above": above, "h": g.add(below, above),
            "h_prev": g.mul(g.sub(start, prev_start), pitch), "h_next": g.mul(g.sub(next_end, end), pitch),
            "allow": _tall_allowed(g, row, n), "allow_prev": _tall_allowed(g, row_prev, n)}


def _course_stones(g, inp, uw, row, vloc):
    """The stone of course `row` at u (vloc: height above that course's middle, which slants its joints).
    Returns the stone id (wrapped), its neighbours' ids and the distances to its left and right ends."""
    hc = g.hash3(row, 1.0, inp.ch(COURSE_CH))
    n = g.mx(g.m("ROUND", g.div(inp["Tile"], g.mul(inp["Stone Length"], g.lerp(*PITCH_SPREAD, hc[0])))), 1.0)
    pitch = g.div(inp["Tile"], n)
    x = g.add(g.div(uw, pitch), hc[1])
    k = g.floor(x)
    f = g.sub(x, k)
    lean = g.div(vloc, pitch)

    def bound(o):
        hj = g.hash3(g.wrap(g.add(k, o), n), row, inp.ch(JOINT_CH))
        return g.add(o, g.add(g.signed(hj[0], LEN_JITTER), g.cap(g.mul(g.signed(hj[1], EDGE_SLANT), lean), SLANT_CAP)))

    off, start, end = _jittered_cell(g, f, [bound(o) for o in (-1.0, 0.0, 1.0, 2.0)])
    c = g.add(k, off)
    return {"cell": g.wrap(c, n), "prev": g.wrap(g.sub(c, 1.0), n), "next": g.wrap(g.add(c, 1.0), n),
            "left": g.mul(g.sub(f, start), pitch), "right": g.mul(g.sub(end, f), pitch)}


def _is_tall(g, inp, cell, row, allow):
    return g.mul(allow, g.lt(g.hash3(cell, row, inp.ch(STONE_CH))[1], inp["Tall Chance"]))


def _split(g, inp, rows, own, own_tall):
    """Split a course stone into two or three thin stones. Returns (layer index, distances to the layer's bottom and top)."""
    flags = g.hash3(own["cell"], rows["row"], inp.ch(STONE_CH))
    ok = g.sub(1.0, own_tall)
    two = g.mul(g.mul(g.lt(flags[0], inp["Split Chance"]), g.gt(rows["h"], MIN_SPLIT2)), ok)
    three = g.mul(g.mul(g.lt(flags[0], g.mul(inp["Split Chance"], THREE_SHARE)), g.gt(rows["h"], MIN_SPLIT3)), ok)
    hs = g.hash3(own["cell"], rows["row"], inp.ch(SPLIT_CH))
    t1 = g.pick(two, 2.0, g.pick(three, g.lerp(0.36, 0.64, hs[0]), g.lerp(0.27, 0.40, hs[0])))
    t2 = g.pick(three, 2.0, g.lerp(0.60, 0.73, hs[1]))
    q = g.div(rows["below"], rows["h"])
    a1, a2 = g.gt(q, t1), g.gt(q, t2)
    lo = g.add(g.mul(a1, t1), g.mul(a2, g.sub(t2, t1)))
    hi1, hi2 = g.mn(t1, 1.0), g.mn(t2, 1.0)
    hi = g.add(hi1, g.add(g.mul(a1, g.sub(hi2, hi1)), g.mul(a2, g.sub(1.0, hi2))))
    bottom = g.mul(g.sub(q, lo), rows["h"])
    top = g.add(g.mul(g.sub(hi, q), rows["h"]), g.mul(own_tall, rows["h_next"]))
    return g.add(a1, a2), two, bottom, top


def _layout(g, inp, uw, vw):
    """Every point's stone: an id pair (x, y) for hashing, and distances to its left, right, bottom and top edges (m)."""
    rows = _courses(g, inp, vw)
    own = _course_stones(g, inp, uw, rows["row"], g.sub(rows["below"], g.mul(rows["h"], 0.5)))
    low = _course_stones(g, inp, uw, rows["row_prev"], g.add(rows["below"], g.mul(rows["h_prev"], 0.5)))
    in_tall = _is_tall(g, inp, low["cell"], rows["row_prev"], rows["allow_prev"])
    own_tall = _is_tall(g, inp, own["cell"], rows["row"], rows["allow"])
    layer, split, bottom, top = _split(g, inp, rows, own, own_tall)

    # a thin stone of a split is sometimes cut short: two stones side by side in the layer
    hc = g.hash3(own["cell"], g.add(rows["row"], g.mul(layer, 0.25)), inp.ch(CUT_CH))
    cut = g.mul(split, g.lt(hc[0], CUT_CHANCE))
    length = g.add(own["left"], own["right"])
    at = g.mul(g.lerp(0.3, 0.7, hc[1]), length)
    side = g.mul(cut, g.gt(own["left"], at))
    right = g.pick(g.mul(cut, g.sub(1.0, side)), own["right"], g.sub(at, own["left"]))
    left = g.pick(side, own["left"], g.sub(own["left"], at))

    # a tall stone rising from the course below cuts this course's stones short
    right = g.pick(_is_tall(g, inp, low["next"], rows["row_prev"], rows["allow_prev"]), right, g.mn(right, low["right"]))
    left = g.pick(_is_tall(g, inp, low["prev"], rows["row_prev"], rows["allow_prev"]), left, g.mn(left, low["left"]))
    return {"id_x": g.pick(in_tall, g.add(own["cell"], g.mul(side, 0.5)), low["cell"]),
            "id_y": g.pick(in_tall, g.add(rows["row"], g.mul(layer, 0.25)), rows["row_prev"]),
            "left": g.pick(in_tall, left, low["left"]), "right": g.pick(in_tall, right, low["right"]),
            "bottom": g.pick(in_tall, bottom, g.add(rows["below"], rows["h_prev"])),
            "top": g.pick(in_tall, top, rows["above"])}


def _attributes(g, inp, st):
    """Per-stone randoms, by name."""
    names = ("pick1", "pick2", "blend", "value", "depth", "rough", "tilt_u", "tilt_v", "corner", "shrink_l", "shrink_r",
             "shrink_b", "shrink_t", "taper_b", "taper_t", "roll", "stain", "bed", "off_x", "off_y", "off_z", "off_w",
             "bed_phase", "spare")
    vals = []
    for i in range(len(names) // 3):
        vals += g.hash3(st["id_x"], st["id_y"], g.add(inp.ch(ATTR_CH), i * 0.125))
    return dict(zip(names, vals))


def _stone_space(g, a, vec, w):
    """The tile's 4D noise space shifted by a per-stone random amount."""
    off = g.vec3(g.mul(a["off_x"], OFFSET_SPAN), g.mul(a["off_y"], OFFSET_SPAN), g.mul(a["off_z"], OFFSET_SPAN))
    return g.vmath("ADD", vec, off), g.add(w, g.mul(a["off_w"], OFFSET_SPAN))


def _outline(g, inp, st, a, svec, sw):
    """Signed distance into the stone (m, > 0 inside) after the joint gap, rounded corners and chipping."""
    jw = inp["Joint Width"]
    length = g.add(st["left"], st["right"])
    along = g.sub(g.mul(g.div(st["left"], g.mx(length, 1e-4)), 2.0), 1.0)      # -1 at the left end, +1 at the right

    def gap(r, taper=None):
        s = g.mul(jw, g.lerp(0.5, 1.0, r))
        return s if taper is None else g.mx(g.add(s, g.mul(g.mul(jw, g.signed(taper, GAP_TAPER)), along)), g.mul(jw, 0.2))

    dh = g.mn(g.sub(st["left"], gap(a["shrink_l"])), g.sub(st["right"], gap(a["shrink_r"])))
    dv = g.mn(g.sub(st["bottom"], gap(a["shrink_b"], a["taper_b"])), g.sub(st["top"], gap(a["shrink_t"], a["taper_t"])))
    d = g.m("SMOOTH_MIN", dh, dv, g.lerp(*CORNER_RADIUS, a["corner"]))
    d = g.add(d, g.signed(g.noise4(svec, sw, CHIP_SCALE, detail=3.0, rough=0.6), CHIP_AMP))
    chunk = g.mx(g.sub(g.noise4(svec, sw, CHUNK_SCALE, detail=1.0), CHUNK_FROM), 0.0)
    return g.sub(d, g.mul(chunk, CHUNK_GAIN))


def _facets(g, svec, sw):
    """Faceted cleavage: each Voronoi cell a plane at a random tilt, so the face breaks into small flats and ledges."""
    pv, pw = g.vmath("SCALE", svec, scale=FACET_SCALE), g.mul(sw, FACET_SCALE)
    vor = g.new("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature="F1", inputs={"Scale": 1.0})
    g.links.new(pv, vor.inputs["Vector"])
    g.put(pw, vor.inputs["W"])
    slope = g.vmath("SUBTRACT", vor.outputs["Color"], (0.5, 0.5, 0.5))
    rel = g.vmath("SUBTRACT", pv, vor.outputs["Position"])
    plane = g.add(g.vmath("DOT_PRODUCT", slope, rel), g.mul(g.sub(pw, vor.outputs["W"]), 0.3))
    return g.remap(plane, -0.45, 0.45)


def _face(g, inp, st, a, svec, sw):
    """The split face, 0..1 (times Face Roughness): lumps, facets, grain and bedding ridges."""
    lumps = g.remap(g.noise4(svec, sw, LUMP_SCALE, detail=3.0, rough=0.55), 0.28, 0.72)
    grain = g.remap(g.noise4(svec, sw, GRAIN_SCALE, detail=3.0, rough=0.6), 0.3, 0.7)
    facets = _facets(g, svec, sw)
    pitch = g.lerp(*BED_PITCH, a["bed"])
    wobble = g.mul(g.sub(lumps, 0.5), 0.012)
    lean = g.mul(g.signed(a["tilt_u"], 0.04), st["left"])
    phase = g.add(g.div(g.add(g.add(st["bottom"], wobble), lean), pitch), g.mul(a["bed_phase"], 7.0))
    bed = g.m("POWER", g.add(g.mul(g.m("SINE", g.mul(phase, 6.283185307)), 0.5), 0.5), 3.0)
    face = g.mul(lumps, FACE_MIX[0])
    for p, share in zip((facets, grain, bed), FACE_MIX[1:]):
        face = g.m("MULTIPLY_ADD", p, share, face)
    return {"face": g.mul(face, g.lerp(FACE_SMOOTHEST, 1.0, a["rough"])), "lumps": lumps, "grain": grain, "bed": bed}


def _height(g, inp, st, a, d, face, jnoise):
    """Stone faces at Joint Depth + depth + tilt + split face, rolled over at the edges; joints at ~0."""
    length, tall = g.add(st["left"], st["right"]), g.add(st["bottom"], st["top"])
    tilt = g.add(g.mul(g.signed(a["tilt_u"], FACE_TILT[0]), g.sub(st["left"], g.mul(length, 0.5))),
                 g.mul(g.signed(a["tilt_v"], FACE_TILT[1]), g.sub(st["bottom"], g.mul(tall, 0.5))))
    base = g.add(inp["Joint Depth"], g.add(g.mul(inp["Protrusion"], a["depth"]), g.cap(tilt, TILT_CAP)))
    top = g.add(base, g.mul(face["face"], inp["Face Roughness"]))
    roll = g.lerp(*EDGE_ROLL, a["roll"])
    x = g.mx(g.mn(d, roll), 0.0)
    drop = g.sub(roll, g.m("SQRT", g.mul(x, g.sub(g.mul(roll, 2.0), x))))
    stone = g.mx(g.sub(top, drop), g.mul(inp["Joint Depth"], 0.35))
    mask = g.gt(d, 0.0)
    joint = g.mul(jnoise, 0.0015)
    relief = g.add(g.add(inp["Joint Depth"], inp["Protrusion"]), g.add(inp["Face Roughness"], TILT_CAP))
    return g.mn(g.pick(mask, joint, stone), relief), mask


def _palette(g, inp, r):
    total = inp["Share 1"]
    for i in range(2, 7):
        total = g.add(total, inp[f"Share {i}"])
    col, acc = inp["Color 1"], 0.0
    for i in range(1, 6):
        acc = g.add(acc, inp[f"Share {i}"])
        col = g.mixc(g.gt(r, g.div(acc, g.mx(total, 1e-4))), col, inp[f"Color {i + 1}"])
    return col


def _color(g, inp, a, d, face, mask, svec, sw, jnoise):
    col = g.mixc(g.mul(a["blend"], PALETTE_BLEND), _palette(g, inp, a["pick1"]), _palette(g, inp, a["pick2"]))
    mottle = g.remap(g.noise4(svec, sw, 7.0, detail=4.0, rough=0.6), 0.3, 0.7)
    weather = inp["Weathering"]
    shade = g.mul(g.lerp(0.86, 1.12, a["value"]), g.lerp(0.88, 1.1, mottle))
    shade = g.mul(shade, g.add(1.0, g.add(g.mul(g.sub(face["bed"], 0.5), 0.10),
                                           g.mul(g.mul(g.sub(face["lumps"], 0.5), 0.25), weather))))
    shade = g.mul(shade, g.lerp(0.93, 1.07, face["grain"]))
    col = g.cscale(col, shade)
    stain = g.remap(g.noise4(svec, sw, 3.5, detail=3.0, rough=0.55), 0.5, 0.72, smooth=True)
    stain = g.mul(g.mul(stain, inp["Stain Amount"]), g.mul(a["stain"], a["stain"]))
    col = g.mixc(g.mul(stain, 0.75), col, inp["Stain Color"])
    rim = g.mul(g.sub(1.0, g.remap(d, 0.0, 0.012, smooth=True)), weather)
    col = g.mixc(g.mul(rim, 0.6), col, col, blend="SCREEN")
    joint = g.cscale(inp["Joint Color"], g.lerp(0.8, 1.2, jnoise))
    return g.mixc(mask, joint, col)


def _group(rebuild=False):
    ng, nodes, links, gin, gout = new_group(GROUP_NAME, inputs=INPUTS, outputs=OUTPUTS + (("AO", "NodeSocketFloat"),),
                                            rebuild=rebuild)
    if not nodes:
        return ng
    g = _Graph(nodes, links)
    inp = _Inputs(g, gin)
    vec, w = torus4d(nodes, links, gin.outputs["Vector"], gin.outputs["Tile"])
    u, v, _ = g.xyz(gin.outputs["Vector"])
    uw = g.add(u, g.signed(g.noise4(vec, w, WARP_SCALE, detail=2.0), WARP_AMP))
    vw = g.add(v, g.signed(g.noise4(g.vmath("ADD", vec, (31.0, 17.0, 5.0)), w, WARP_SCALE, detail=2.0), WARP_AMP))
    st = _layout(g, inp, uw, vw)
    a = _attributes(g, inp, st)
    svec, sw = _stone_space(g, a, vec, w)
    d = _outline(g, inp, st, a, svec, sw)
    face = _face(g, inp, st, a, svec, sw)
    jnoise = g.remap(g.noise4(vec, w, 40.0, detail=3.0), 0.3, 0.7)
    height, mask = _height(g, inp, st, a, d, face, jnoise)
    g.links.new(_color(g, inp, a, d, face, mask, svec, sw, jnoise), gout.inputs["Base Color"])
    rough = g.add(g.lerp(0.8, 0.9, face["grain"]), g.mul(g.sub(a["rough"], 0.5), 0.06))
    g.put(g.pick(mask, 0.95, rough), gout.inputs["Roughness"])
    gout.inputs["Metallic"].default_value = 0.0
    g.put(height, gout.inputs["Height"])
    edge_ao = g.lerp(0.55, 1.0, g.remap(d, 0.0, 0.015, smooth=True))
    g.put(g.pick(mask, JOINT_AO, g.mul(edge_ao, g.lerp(0.75, 1.0, face["face"]))), gout.inputs["AO"])
    return ng


def _relief(params):
    p = {**DEFAULTS, **params}
    return p["Joint Depth"] + p["Protrusion"] + p["Face Roughness"] + TILT_CAP


def _variant(material_name, preset):
    def build(rebuild=False, **params):
        merged = {**preset, **params}
        return pbr_material(material_name, _group(rebuild), _relief(merged), merged, rebuild=rebuild)
    return build


MATERIALS = {"ledgestone_warm": _variant("M_LedgestoneWarm", WARM), "ledgestone_cool": _variant("M_LedgestoneCool", COOL)}
