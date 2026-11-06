"""Debug materials. uv_grid: 0.5 m checks with a dark line every metre, so UV scale and continuity show at a glance.
tile_noise: seamless 4D noise through torus4d, a check that the tiling helpers repeat exactly."""
from .common import TILE_DEFAULT, new_group, node, pbr_material, torus4d

TILE_INPUT = ("Tile", "NodeSocketFloat", TILE_DEFAULT, 0.5, 100.0)


def uv_grid(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS UV Grid", inputs=(TILE_INPUT,), rebuild=rebuild)
    if nodes:
        chk = node(nodes, "ShaderNodeTexChecker", (-600, 200), inputs={"Scale": 2.0, "Color1": (0.85, 0.85, 0.82, 1),
                                                                        "Color2": (0.55, 0.62, 0.7, 1)})
        links.new(gin.outputs["Vector"], chk.inputs["Vector"])
        brick = node(nodes, "ShaderNodeTexBrick", (-600, -200), offset=0.0, squash=1.0,
                     inputs={"Scale": 1.0, "Mortar Size": 0.012, "Brick Width": 1.0, "Row Height": 1.0,
                             "Mortar": (0.08, 0.08, 0.08, 1)})
        links.new(gin.outputs["Vector"], brick.inputs["Vector"])
        mix = node(nodes, "ShaderNodeMix", (-200, 0), data_type="RGBA")
        links.new(brick.outputs["Fac"], mix.inputs["Factor"])
        links.new(chk.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = (0.05, 0.05, 0.05, 1)
        links.new(mix.outputs["Result"], gout.inputs["Base Color"])
        gout.inputs["Roughness"].default_value = 0.8
    return pbr_material("M_UVGrid", ng, 0.0, params, rebuild=rebuild)


def tile_noise(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Tile Noise", inputs=(TILE_INPUT,), rebuild=rebuild)
    if nodes:
        vec, w = torus4d(nodes, links, gin.outputs["Vector"], gin.outputs["Tile"])
        nz = node(nodes, "ShaderNodeTexNoise", (200, 0), noise_dimensions="4D", inputs={"Scale": 1.5, "Detail": 6.0})
        links.new(vec, nz.inputs["Vector"])
        links.new(w, nz.inputs["W"])
        links.new(nz.outputs["Color"], gout.inputs["Base Color"])
        links.new(nz.outputs["Fac"], gout.inputs["Height"])
        gout.inputs["Roughness"].default_value = 0.7
    return pbr_material("M_TileNoise", ng, 0.0, params, displacement=False, rebuild=rebuild)


MATERIALS = {"uv_grid": uv_grid, "tile_noise": tile_noise}
