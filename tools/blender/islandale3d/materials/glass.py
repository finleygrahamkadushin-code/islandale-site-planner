"""Window glass for the cabins.

glass ("IS Glass", M_Glass)
    Clear architectural float glass: fully transmissive, near-mirror smooth (Roughness ~0.02, with faint smudges and
    cleaning marks varying it by Smudges), a faint green-blue Tint, IOR 1.52 and thin-walled, since windows are single faces.
glass_tinted (M_GlassTinted)
    The same group in the planner's curtain-wall tint #8fbccb with Reflectivity 0.12: a coated, slightly mirrored pane.

Reflectivity drives the Metallic output, so the coating's tinted mirror bakes into the texture set like any other channel.
Height is 0: glass has no relief. Tint is a transmittance, so it runs lighter than the opaque-albedo range on purpose."""
from .common import OUTPUTS, pbr_material, torus4d
from .metals import new_graph, seamless_noise

CLEAR_TINT = (0.86, 0.92, 0.90, 1.0)       # float glass, the faint green of its iron
CURTAIN_TINT = (0.275, 0.503, 0.597, 1.0)  # #8fbccb
GLASS_IOR = 1.52
GLASS_OUTPUTS = OUTPUTS + (("Alpha", "NodeSocketFloat"), ("Transmission", "NodeSocketFloat"))
SMUDGE_ROUGH = 0.04


def glass(rebuild=False, _name="M_Glass", **params):
    ng, g = new_graph("IS Glass", (("Tint", "NodeSocketColor", CLEAR_TINT),
                                   ("Roughness", "NodeSocketFloat", 0.02, 0.0, 1.0),
                                   ("Reflectivity", "NodeSocketFloat", 0.0, 0.0, 1.0),
                                   ("Smudges", "NodeSocketFloat", 1.0, 0.0, 3.0)), outputs=GLASS_OUTPUTS, rebuild=rebuild)
    if g:
        _glass_nodes(g)
    return pbr_glass(_name, ng, params, rebuild)


def _glass_nodes(g):
    torus = torus4d(g.nodes, g.links, g.inp("Vector"), g.inp("Tile"), g.loc())
    smear = seamless_noise(g, torus, 3.0, 1, stretch=(1.0, 0.3), detail=4.0, rough=0.65, distortion=0.8)
    smudge = g.math("MULTIPLY", g.remap(smear, 0.55, 0.8, smooth=True), g.inp("Smudges"))
    g.out("Base Color", g.inp("Tint"))
    g.out("Roughness", g.math("MULTIPLY_ADD", smudge, SMUDGE_ROUGH, g.inp("Roughness"), clamp=True))
    g.out("Metallic", g.inp("Reflectivity"))
    g.out("Height", 0.0)
    g.out("Alpha", 1.0)
    g.out("Transmission", 1.0)


def pbr_glass(name, ng, params, rebuild):
    """pbr_material, then the two things the group can't say: float glass's IOR, and a thin wall for single-face panes."""
    mat = pbr_material(name, ng, 0.0, params, displacement=False, rebuild=rebuild)
    bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    bsdf.inputs["IOR"].default_value = GLASS_IOR
    bsdf.inputs["Thin Wall"].default_value = True
    return mat


def glass_tinted(rebuild=False, **params):
    return glass(rebuild=rebuild, _name="M_GlassTinted", **{"Tint": CURTAIN_TINT, "Reflectivity": 0.12, **params})


MATERIALS = {"glass": glass, "glass_tinted": glass_tinted}
