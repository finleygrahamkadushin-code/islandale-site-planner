"""Node-building shorthand for the wood and masonry materials (wood.py, masonry.py). Private: the registry skips "_" modules.

K wraps one node group under construction so a pattern reads like the maths it is: every method takes numbers or sockets
and returns an output socket (noise, voronoi and hash return what the pattern needs). The seamless-tiling vocabulary:
  - torus(): common.torus4d with a different noise frequency along u and v (grain, broom marks), still exact on the Tile.
  - ring(): one coordinate wrapped onto a circle, for noise that runs along a board but restarts on every board.
  - cells(): common.wrapped_cells, plus hash() of the wrapped ids for per-cell randomness that repeats with the Tile."""
import math as _m

from .common import OUTPUTS, TILE_DEFAULT, node, torus4d, wrapped_cells

TAU = 2 * _m.pi
TILE_INPUT = ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0)
SEED_INPUT = ("Seed", "NodeSocketFloat", 0.0, 0.0, 1000.0)
OUTPUTS_AO = OUTPUTS + (("AO", "NodeSocketFloat"),)     # the contract outputs plus cavity for the baker's ORM
COLUMN = 44            # nodes per column when laying the group out for a human to read


def lin(hexstr, alpha=1.0):
    """'#rrggbb' in sRGB (how the planner stores colours) -> linear RGBA for a colour socket default."""
    h = hexstr.lstrip("#")

    def chan(s):
        c = int(s, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (chan(h[0:2]), chan(h[2:4]), chan(h[4:6]), alpha)


def _const(x):
    return isinstance(x, (int, float, tuple, list))


class K:
    """Terse node building inside one group."""

    def __init__(self, nodes, links):
        self.nodes, self.links = nodes, links
        self.count = 0

    def put(self, x, sock):
        if _const(x):
            sock.default_value = x
        else:
            self.links.new(x, sock)

    def new(self, typ, ins=None, **props):
        self.count += 1
        loc = (-1100 + 210 * (self.count // COLUMN), 2000 - 95 * (self.count % COLUMN))
        n = node(self.nodes, typ, loc, **props)
        for key, v in (ins or {}).items():
            self.put(v, n.inputs[key])
        return n

    # --- scalar maths -------------------------------------------------------------------------------------------------
    def m(self, op, a, b=None, c=None, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b, c)):
            if x is not None:
                self.put(x, n.inputs[i])
        return n.outputs[0]

    def add(self, a, b):
        return self.m("ADD", a, b)

    def sub(self, a, b):
        return self.m("SUBTRACT", a, b)

    def mul(self, a, b):
        return self.m("MULTIPLY", a, b)

    def div(self, a, b):
        return self.m("DIVIDE", a, b)

    def madd(self, a, b, c):
        return self.m("MULTIPLY_ADD", a, b, c)

    def mn(self, a, b):
        return self.m("MINIMUM", a, b)

    def mx(self, a, b):
        return self.m("MAXIMUM", a, b)

    def inv(self, a):
        return self.m("SUBTRACT", 1.0, a)

    def edge(self, frac, pitch):
        """Distance (m) from a point in a cell to the nearer cell boundary."""
        x = self.mul(frac, pitch)
        return self.mn(x, self.sub(pitch, x))

    def smooth(self, x, e0, e1, interp="SMOOTHSTEP"):
        """0 below e0, 1 above e1 (e0 > e1 flips it)."""
        n = self.new("ShaderNodeMapRange", clamp=True, interpolation_type=interp,
                     ins={"Value": x, "From Min": e0, "From Max": e1, "To Min": 0.0, "To Max": 1.0})
        return n.outputs["Result"]

    def remap(self, x, a, b, c, d, clamp=True):
        n = self.new("ShaderNodeMapRange", clamp=clamp, ins={"Value": x, "From Min": a, "From Max": b, "To Min": c, "To Max": d})
        return n.outputs["Result"]

    def lerp(self, f, a, b):
        n = self.new("ShaderNodeMix", data_type="FLOAT", clamp_factor=True, ins={"Factor": f, "A": a, "B": b})
        return n.outputs["Result"]

    # --- colour --------------------------------------------------------------------------------------------------------
    def cmix(self, f, a, b, blend="MIX", clamp=True):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=clamp, ins={"Factor": f, "A": a, "B": b})
        return n.outputs["Result"]

    def cmul(self, a, b, f=1.0):
        return self.cmix(f, a, b, "MULTIPLY", clamp=False)

    def gain(self, col, x):
        """Colour times a scalar (a brightness factor)."""
        return self.cmul(col, self.gray(x))

    def gray(self, x):
        return self.xyz(x, x, x)

    def ramp(self, f, stops, interp="LINEAR"):
        """stops: [(position, rgba), ...] -> colour socket."""
        n = self.new("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = interp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (pos, col) in zip(cr.elements, stops):
            el.position, el.color = pos, col
        self.put(f, n.inputs[0])
        return n.outputs["Color"]

    # --- vectors -------------------------------------------------------------------------------------------------------
    def xyz(self, x, y, z):
        n = self.new("ShaderNodeCombineXYZ")
        for i, c in enumerate((x, y, z)):
            self.put(c, n.inputs[i])
        return n.outputs[0]

    def sep(self, v):
        n = self.new("ShaderNodeSeparateXYZ")
        self.put(v, n.inputs[0])
        return n.outputs["X"], n.outputs["Y"], n.outputs["Z"]

    def vmul(self, v, s):
        n = self.new("ShaderNodeVectorMath", operation="MULTIPLY")
        self.put(v, n.inputs[0])
        self.put(s, n.inputs[1])
        return n.outputs["Vector"]

    def vadd(self, v, s):
        n = self.new("ShaderNodeVectorMath", operation="ADD")
        self.put(v, n.inputs[0])
        self.put(s, n.inputs[1])
        return n.outputs["Vector"]

    # --- seamless coordinates ------------------------------------------------------------------------------------------
    def torus(self, vec, tile, ku=1.0, kv=1.0):
        """common.torus4d with ku noise units per metre along u and kv along v; still repeats exactly every tile."""
        tv, tw = torus4d(self.nodes, self.links, vec, tile, loc=(-1500, -900))
        return self.vmul(tv, (ku, ku, kv)), self.mul(tw, kv)

    def ring(self, coord, tile, k=1.0, z=0.0, w=0.0):
        """`coord` wrapped onto a circle (k noise units per metre along it, exact every tile) as a 4D point (vec, w); z and w
        carry the other dimensions, e.g. metres across a board plus a per-board offset."""
        ang = self.mul(coord, self.div(TAU, tile))
        rad = self.mul(self.div(tile, TAU), k)
        return self.xyz(self.mul(self.m("COSINE", ang), rad), self.mul(self.m("SINE", ang), rad), z), w

    def cells(self, coord, pitch, tile):
        """common.wrapped_cells: (wrapped id, fraction in cell, true pitch)."""
        return wrapped_cells(self.nodes, self.links, coord, pitch, tile, loc=(-1300, 1800))

    # --- textures ------------------------------------------------------------------------------------------------------
    def noise(self, vw, scale, detail=2.0, rough=0.5, lac=2.0, distortion=0.0, typ="FBM"):
        """4D noise at (vec, w); returns the Factor socket (about 0.5 +- 0.2 for FBM)."""
        vec, w = vw
        n = self.new("ShaderNodeTexNoise", noise_dimensions="4D", noise_type=typ,
                     ins={"Vector": vec, "W": w, "Scale": scale, "Detail": detail, "Roughness": rough, "Lacunarity": lac,
                          "Distortion": distortion})
        return n.outputs[0]

    def voronoi(self, vw, scale, feature="F1", rand=1.0, metric="EUCLIDEAN"):
        """4D Voronoi at (vec, w); returns the node (Distance, Color, Position, W, Radius)."""
        vec, w = vw
        return self.new("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature=feature, distance=metric,
                        ins={"Vector": vec, "W": w, "Scale": scale, "Randomness": rand})

    def hash(self, a, b=0.0, c=0.0, seed=0.0):
        """Three independent uniform randoms 0..1 (plus a fourth) for the integer ids a, b, c and the seed."""
        n = self.new("ShaderNodeTexWhiteNoise", noise_dimensions="4D", ins={"Vector": self.xyz(a, b, c), "W": seed})
        r, g, bl = self.sep(n.outputs["Color"])
        return r, g, bl, n.outputs["Value"]

    def centred(self, x, amp=1.0):
        """A 0..1 noise factor recentred to about -amp..amp."""
        return self.mul(self.sub(x, 0.5), 2.0 * amp)
