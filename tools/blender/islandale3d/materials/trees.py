"""Tree materials for the app's low-poly madrones (6D): bark on the trunk and limbs, leaves on the crown.

madrone_bark  Pacific madrone bark: smooth cinnamon-red new bark, with thin papery strips of older dark-brown bark curling
              off it in long patches, and a faint grain along the limb.
leaves        A madrone crown seen from 5-50 m: glossy dark evergreen leaves in clumps, lighter where they catch the sun,
              with a few red-brown dead leaves.

Both are pure functions of the UVMeters coordinates and repeat every Tile, like every material here (common.py)."""
from .common import pbr_material, torus4d
from .metals import _param, new_graph, seamless_noise

BARK_RED = (0.42, 0.11, 0.05, 1.0)      # linear; sRGB ~#ac5c3e, fresh madrone bark
BARK_OLD = (0.13, 0.07, 0.045, 1.0)     # the peeling dark-brown outer bark
BARK_PEEL = 0.004                       # m: how far a peeling strip stands off the smooth bark
LEAF_DARK = (0.035, 0.075, 0.03, 1.0)   # linear; sRGB ~#365131
LEAF_LIT = (0.11, 0.19, 0.06, 1.0)
LEAF_DEAD = (0.25, 0.09, 0.04, 1.0)
LEAF_RELIEF = 0.03                      # m: clump relief, read as bump


def madrone_bark(rebuild=False, **params):
    ng, g = new_graph("IS Madrone Bark", (("Red", "NodeSocketColor", BARK_RED),
                                          ("Old Bark", "NodeSocketColor", BARK_OLD),
                                          ("Peel", "NodeSocketFloat", 0.35, 0.0, 1.0),
                                          ("Peel Height", "NodeSocketFloat", BARK_PEEL, 0.0, 0.02)), rebuild=rebuild)
    if g:
        _bark_nodes(g)
    return pbr_material("M_MadroneBark", ng, _param(params, "Peel Height", BARK_PEEL), params, rebuild=rebuild)


def _bark_nodes(g):
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    strips = seamless_noise(g, torus, 3.0, 1, stretch=(1.0, 0.25), detail=4.0, rough=0.55, distortion=0.4)
    grain = seamless_noise(g, torus, 60.0, 2, stretch=(1.0, 0.08), detail=2.0, rough=0.5)
    mottle = seamless_noise(g, torus, 1.5, 3, detail=3.0, rough=0.5)
    cut = g.math("SUBTRACT", 0.75, g.math("MULTIPLY", g.inp("Peel"), 0.4))
    old = g.remap(strips, cut, g.math("ADD", cut, 0.04), smooth=True)        # 1 on a peeling strip
    red = g.scale(g.inp("Red"), g.math("ADD", 0.8, g.math("MULTIPLY", mottle, 0.4)))
    brown = g.scale(g.inp("Old Bark"), g.math("ADD", 0.75, g.math("MULTIPLY", grain, 0.5)))
    g.out("Base Color", g.mix_color(old, red, brown))
    g.out("Roughness", g.lerp(g.math("ADD", 0.35, g.math("MULTIPLY", grain, 0.1)), 0.8, old))
    g.out("Metallic", 0.0)
    g.out("Height", g.math("MULTIPLY", g.math("ADD", old, g.math("MULTIPLY", grain, 0.15)), g.inp("Peel Height")))
    g.out("AO", g.math("SUBTRACT", 1.0, g.math("MULTIPLY", old, 0.25)))


def leaves(rebuild=False, **params):
    ng, g = new_graph("IS Leaves", (("Dark", "NodeSocketColor", LEAF_DARK),
                                    ("Lit", "NodeSocketColor", LEAF_LIT),
                                    ("Dead", "NodeSocketColor", LEAF_DEAD),
                                    ("Dead Amount", "NodeSocketFloat", 0.06, 0.0, 0.5),
                                    ("Clump Height", "NodeSocketFloat", LEAF_RELIEF, 0.0, 0.2)), rebuild=rebuild)
    if g:
        _leaf_nodes(g)
    return pbr_material("M_Leaves", ng, _param(params, "Clump Height", LEAF_RELIEF), params, rebuild=rebuild)


def _leaf_nodes(g):
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    clumps = seamless_noise(g, torus, 4.0, 1, detail=3.0, rough=0.6, distortion=0.3)
    leaf = seamless_noise(g, torus, 45.0, 2, detail=2.0, rough=0.5)
    dead = seamless_noise(g, torus, 25.0, 3, detail=1.0, rough=0.5)
    lit = g.remap(clumps, 0.45, 0.7, smooth=True)
    green = g.mix_color(lit, g.inp("Dark"), g.inp("Lit"))
    green = g.scale(green, g.math("ADD", 0.8, g.math("MULTIPLY", leaf, 0.4)))
    is_dead = g.remap(dead, g.math("SUBTRACT", 0.75, g.inp("Dead Amount")), 0.78, smooth=True)
    g.out("Base Color", g.mix_color(g.math("MULTIPLY", is_dead, 0.8), green, g.inp("Dead")))
    g.out("Roughness", g.math("ADD", 0.45, g.math("MULTIPLY", leaf, 0.2)))
    g.out("Metallic", 0.0)
    g.out("Height", g.math("MULTIPLY", g.math("MULTIPLY_ADD", leaf, 0.3, clumps), g.inp("Clump Height")))
    g.out("AO", g.math("ADD", 0.6, g.math("MULTIPLY", clumps, 0.4)))


MATERIALS = {"madrone_bark": madrone_bark, "leaves": leaves}
