"""Shorthand for the site materials' node groups (site.py): a look written as formulas on sockets (g.mul(a, b),
g.noise(p, 8), g.mix(f, a, b)) rather than node-by-node wiring, plus the seamless building blocks they share.

Everything here keeps the material contract (common.py): noise and Voronoi read 4D points from `torus4d`, so they repeat
every Tile; `dir_point` rotates the frame by an integer direction (i, j) before the torus, which still tiles, so streaks and
blades need not run along u or v; `cells` is a Voronoi on a jittered grid that wraps every Tile and stays flat in the
surface, for paving whose stones must keep an even size (a 4D Voronoi cut by the torus gives slivers at that scale)."""
import math as _math
from collections import namedtuple

import bpy

from .common import node, torus4d

P4 = namedtuple("P4", "vec w")                 # a point that a 4D Noise or Voronoi reads: (Vector socket, W socket)
Cells = namedtuple("Cells", "f1 edge cell_id rel")

SEED_STEP = (17.31, 31.7, 23.9, 11.3)          # one Seed step moves this far through noise space: an unrelated pattern
COLUMN = 40                                    # nodes per column in the node editor
NOT_A_NEIGHBOUR = 1e3                          # cells(): pushes the nearest cell out of its own edge-distance minimum
SAME_POINT = 1e-5

_MIX_SOCKETS = {"FLOAT": (2, 3, 0), "VECTOR": (4, 5, 1), "RGBA": (6, 7, 2)}   # (A, B, Result) per data type
_VALUE_OPS = {"DOT_PRODUCT", "LENGTH", "DISTANCE"}


def srgb(hexcode):
    """'#b5a68c' -> linear RGBA, which colour sockets and ramps hold."""
    h = hexcode.lstrip("#")

    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4)) + (1.0,)


class Graph:
    """Builds into one fresh group (the 5-tuple new_group returns). Inputs are read as g["Name"]; u, v, tile and seed
    are ready-made sockets. Methods take numbers or sockets wherever a node input would."""

    def __init__(self, nodes, links, gin, gout):
        self.nodes, self.links, self.gin, self.gout = nodes, links, gin, gout
        self._count = 0
        self.u, self.v, _ = self.split(gin.outputs["Vector"])
        self.tile, self.seed = gin.outputs["Tile"], gin.outputs["Seed"]

    def __getitem__(self, name):
        return self.gin.outputs[name]

    def new(self, typ, inputs=None, **props):
        loc = (-1000 + (self._count // COLUMN) * 220, 2400 - (self._count % COLUMN) * 120)
        self._count += 1
        return node(self.nodes, typ, loc, inputs, **props)

    def feed(self, sock, value):
        if value is None:
            return
        if isinstance(value, bpy.types.NodeSocket):
            self.links.new(value, sock)
        else:
            sock.default_value = value

    def output(self, name, value):
        self.feed(self.gout.inputs[name], value)

    # -- scalar maths -------------------------------------------------------------------------------------------
    def op(self, operation, a, b=None, c=None, clamp=False):
        n = self.new("ShaderNodeMath", operation=operation, use_clamp=clamp)
        for i, x in enumerate((a, b, c)):
            self.feed(n.inputs[i], x)
        return n.outputs[0]

    def add(self, a, b):
        return self.op("ADD", a, b)

    def sub(self, a, b):
        return self.op("SUBTRACT", a, b)

    def mul(self, a, b, clamp=False):
        return self.op("MULTIPLY", a, b, clamp=clamp)

    def div(self, a, b):
        return self.op("DIVIDE", a, b)

    def madd(self, a, b, c):
        return self.op("MULTIPLY_ADD", a, b, c)

    def lo(self, a, b):
        return self.op("MINIMUM", a, b)

    def hi(self, a, b):
        return self.op("MAXIMUM", a, b)

    def sat(self, a):
        return self.op("ADD", a, 0.0, clamp=True)

    def total(self, *xs):
        acc = xs[0]
        for x in xs[1:]:
            acc = self.add(acc, x)
        return acc

    def highest(self, *xs):
        acc = xs[0]
        for x in xs[1:]:
            acc = self.hi(acc, x)
        return acc

    def remap(self, x, a0, a1, b0=0.0, b1=1.0, smooth=False, clamp=True):
        """x from [a0, a1] to [b0, b1] (a0 < a1), linear or smoothstep."""
        n = self.new("ShaderNodeMapRange", data_type="FLOAT", clamp=clamp,
                     interpolation_type="SMOOTHSTEP" if smooth else "LINEAR")
        for i, val in enumerate((x, a0, a1, b0, b1)):
            self.feed(n.inputs[i], val)
        return n.outputs[0]

    def step(self, x, a0, a1):
        return self.remap(x, a0, a1, smooth=True)

    def ridge(self, x):
        """1 at x = 0.5, falling to 0 at 0 and 1: the zero-crossings of a noise, as thin lines."""
        return self.sub(1.0, self.op("ABSOLUTE", self.madd(x, 2.0, -1.0)))

    # -- vectors, colours -------------------------------------------------------------------------------------
    def vop(self, operation, a, b=None, c=None):
        n = self.new("ShaderNodeVectorMath", operation=operation)
        for i, x in enumerate((a, b, c)):
            self.feed(n.inputs[i], x)
        return n.outputs[1 if operation in _VALUE_OPS else 0]

    def combine(self, x, y, z=0.0):
        n = self.new("ShaderNodeCombineXYZ")
        for i, val in enumerate((x, y, z)):
            self.feed(n.inputs[i], val)
        return n.outputs[0]

    def split(self, vec):
        n = self.new("ShaderNodeSeparateXYZ")
        self.feed(n.inputs[0], vec)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def mix(self, f, a, b, kind="RGBA", blend="MIX"):
        """A where f = 0, B where f = 1 (f clamped)."""
        n = self.new("ShaderNodeMix", data_type=kind)
        if kind == "RGBA":
            n.blend_type = blend
        ia, ib, io = _MIX_SOCKETS[kind]
        for i, val in ((0, f), (ia, a), (ib, b)):
            self.feed(n.inputs[i], val)
        return n.outputs[io]

    def lerp(self, f, a, b):
        return self.mix(f, a, b, "FLOAT")

    def tint(self, col, amount):
        """Colour times a scalar (brightness), as a colour."""
        return self.mix(1.0, col, self.combine(amount, amount, amount), blend="MULTIPLY")

    def ramp(self, fac, stops, interp="LINEAR"):
        """Colour Ramp from [(position, linear RGBA)], in order."""
        n = self.new("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        els = cr.elements
        els[1].position, els[1].color = stops[-1]
        els[0].position, els[0].color = stops[0]
        for pos, col in stops[1:-1]:
            els.new(pos).color = col
        self.feed(n.inputs[0], fac)
        return n.outputs[0]

    # -- seamless sources ---------------------------------------------------------------------------------------
    def point(self, a=None, b=None):
        """The seeded torus point of the surface (u, v), or of the coordinates (a, b) when given (e.g. a warped u, v)."""
        vec_in = self.gin.outputs["Vector"] if a is None else self.combine(a, b)
        vec, w = torus4d(self.nodes, self.links, vec_in, self.tile, loc=(-1300, 2400 - (self._count % COLUMN) * 120))
        vec = self.vop("MULTIPLY_ADD", SEED_STEP[:3], self.seed, vec)
        return P4(vec, self.madd(self.seed, SEED_STEP[3], w))

    def dir_point(self, i, j):
        """The seeded torus point of the rotated frame a = i u + j v, b = -j u + i v. Integer i, j keep it tiling; the
        frame is sqrt(i^2 + j^2) times finer than metres, which stretch() divides back out."""
        if (i, j) == (1, 0):
            return self.point()
        a = self.madd(self.u, float(i), self.mul(self.v, float(j)))
        b = self.madd(self.u, float(-j), self.mul(self.v, float(i)))
        return self.point(a, b)

    def offset(self, p, d):
        """The same field, somewhere else: decorrelates layers that share a point."""
        return P4(self.vop("ADD", p.vec, d[:3]), self.add(p.w, d[3]))

    def stretch(self, p, ka, kb):
        """Scale the point's first (a/u) circle by ka and second (b/v) circle by kb: noise read at Scale 1 then has ka
        features per frame unit along a and kb along b."""
        return P4(self.vop("MULTIPLY", p.vec, (ka, ka, kb)), self.mul(p.w, kb))

    def noise(self, p, scale, detail=2.0, roughness=0.5, lacunarity=2.0, distortion=0.0, kind="FBM"):
        """4D noise; returns (factor, colour). FBM is normalised to about 0..1 round 0.5."""
        n = self.new("ShaderNodeTexNoise", noise_dimensions="4D", noise_type=kind)
        self.links.new(p.vec, n.inputs[0])
        self.links.new(p.w, n.inputs[1])
        for i, val in ((2, scale), (3, detail), (4, roughness), (5, lacunarity), (8, distortion)):
            self.feed(n.inputs[i], val)
        return n.outputs[0], n.outputs[1]

    def voronoi(self, p, scale, feature="F1", randomness=1.0):
        """4D Voronoi node (outputs Distance, Color, Position, W in scaled units except Position)."""
        n = self.new("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature=feature)
        self.links.new(p.vec, n.inputs[0])
        self.links.new(p.w, n.inputs[1])
        self.feed(n.inputs[2], scale)
        self.feed(n.inputs[8], randomness)
        return n

    def white(self, vec, w):
        """Per-id randomness: (value, colour) of 4D White Noise at (vec, w)."""
        n = self.new("ShaderNodeTexWhiteNoise", noise_dimensions="4D")
        self.feed(n.inputs[0], vec)
        self.feed(n.inputs[1], w)
        return n.outputs[0], n.outputs[1]

    def warp(self, p, amount, scale, detail=3.0):
        """(u, v) pushed about by up to +-amount m of smooth noise of the given scale; still periodic."""
        _, col = self.noise(p, scale, detail)
        dx, dy, _ = self.split(col)
        return (self.madd(self.sub(dx, 0.5), self.mul(amount, 2.0), self.u),
                self.madd(self.sub(dy, 0.5), self.mul(amount, 2.0), self.v))

    def cells(self, u, v, pitch, randomness=1.0, salt=0.0):
        """Voronoi over a jittered grid of about `pitch` m cells that wraps every Tile (true pitch = Tile / round(Tile /
        pitch)), so stones keep an even size. Returns Cells in metres: f1 to the nearest feature point, edge to the
        nearest cell border (exact for the 3 x 3 neighbourhood), cell_id (wrapped i, j: hash it with white()), and rel,
        the vector from the point to its cell's feature point."""
        count = self.hi(self.op("ROUND", self.div(self.tile, pitch)), 1.0)
        q = self.div(self.tile, count)
        su, sv = self.div(u, q), self.div(v, q)
        iu, iv = self.op("FLOOR", su), self.op("FLOOR", sv)
        frac_back = self.combine(self.sub(iu, su), self.sub(iv, sv))          # cell corner minus the point
        ni = {d: self.op("FLOORED_MODULO", self.add(iu, float(d)), count) for d in (-1, 0, 1)}
        nj = {d: self.op("FLOORED_MODULO", self.add(iv, float(d)), count) for d in (-1, 0, 1)}
        w_hash = self.add(self.seed, salt)
        jitter, lo_j = (randomness, randomness, 0.0), 0.5 - 0.5 * randomness
        offsets, d1, o1, id1 = [], None, None, None
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                cid = self.combine(ni[di], nj[dj])
                _, h = self.white(cid, w_hash)
                o = self.vop("MULTIPLY_ADD", h, jitter, self.vop("ADD", frac_back, (di + lo_j, dj + lo_j, 0.0)))
                d = self.vop("LENGTH", o)
                offsets.append(o)
                if d1 is None:
                    d1, o1, id1 = d, o, cid
                    continue
                closer = self.op("LESS_THAN", d, d1)
                o1 = self.mix(closer, o1, o, "VECTOR")
                id1 = self.mix(closer, id1, cid, "VECTOR")
                d1 = self.lo(d, d1)
        edge = None
        for o in offsets:   # distance to the bisector with each neighbour: (|o|^2 - |o1|^2) / (2 |o - o1|)
            diff = self.vop("SUBTRACT", o, o1)
            e = self.vop("DOT_PRODUCT", self.vop("ADD", o, o1), self.vop("NORMALIZE", diff))
            e = self.madd(self.op("LESS_THAN", self.vop("LENGTH", diff), SAME_POINT), NOT_A_NEIGHBOUR, e)
            edge = e if edge is None else self.lo(edge, e)
        return Cells(self.mul(d1, q), self.mul(self.mul(edge, 0.5), q), id1, self.vop("MULTIPLY", o1, self.combine(q, q, q)))

    def fibres(self, along, across, sharpness=0.86, salt=0.0, pairs=((1, 0), (2, 1), (1, 2))):
        """Matted straight fibres (grass blades, straw, kelp strands) in six directions, all tiling: thin ridges of noise
        stretched `along` / `across` features per metre. Returns 0..1 (1 on a fibre); sharpness thins them."""
        out = None
        for k, (i, j) in enumerate(pairs):
            p = self.dir_point(i, j)
            length = _math.hypot(i, j)
            for m, (ka, kb) in enumerate(((along, across), (across, along))):
                q = self.offset(self.stretch(p, ka / length, kb / length),
                                (3.1 * k + 1.7 * m + salt, 5.3 * m + salt, 2.9 * k, 7.7 * m + 0.3 * k))
                n, _ = self.noise(q, 1.0, 1.5, 0.5)
                f = self.step(self.ridge(n), sharpness, 1.0)
                out = f if out is None else self.hi(out, f)
        return out
