"""Cast and rendered mineral surfaces: the plain foils the stone, clay and metal walls sit against.

stucco         sand-finish exterior render in warm white (#e8e4dc, the walls in the user's second photo): broad trowel
               clouds a few percent darker or lighter, a fine sand float texture about a millimetre deep, the odd hairline.
concrete       board-formed cast concrete for foundations and plinths (#8a8780): horizontal form-board bands with their
               grain printed in, a faint ridge where boards met, rows of patched form-tie holes, cement-paste blotches.
concrete_slab  broom-finished slab (#cfc7b8) for patios and floors: fine broom striations across u, tooled control joints
               on a ~1.5 m grid, gentle curing mottle.
Every group takes Tile and Seed, a Color (the mean albedo) and Roughness; sizes in metres."""
from ._wm_kit import OUTPUTS_AO, SEED_INPUT, TILE_INPUT, K, lin
from .common import new_group, pbr_material

# --- stucco ------------------------------------------------------------------------------------------------------------
STUCCO_SAND = 0.0009      # m: sand-float texture depth
STUCCO_TROWEL = 0.0012    # m: broad trowel undulation
STUCCO_CRACK = 0.0004     # m: hairline depth


def finish(k, gout, col, rough, height, ao):
    k.put(col, gout.inputs["Base Color"])
    k.put(rough, gout.inputs["Roughness"])
    k.put(height, gout.inputs["Height"])
    k.put(ao, gout.inputs["AO"])
    gout.inputs["Metallic"].default_value = 0.0


def stucco(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Stucco", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#e8e4dc")),
        ("Trowel", "NodeSocketFloat", 1.0, 0.0, 3.0),
        ("Sand", "NodeSocketFloat", 1.0, 0.0, 3.0),
        ("Cracks", "NodeSocketFloat", 0.3, 0.0, 1.0),
        ("Roughness", "NodeSocketFloat", 0.86, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        tile, seed = gin.outputs["Tile"], gin.outputs["Seed"]
        vec, w = k.torus(gin.outputs["Vector"], tile)
        w = k.add(w, seed)
        clouds = k.noise((vec, w), 0.6, detail=3.0, rough=0.55)                 # trowel passes, metres across
        swirl = k.noise((vec, k.add(w, 13.0)), 3.5, detail=2.0, rough=0.5, distortion=0.6)
        sand = k.noise((vec, k.add(w, 29.0)), 900.0, detail=1.0, rough=0.4)     # ~1 mm grains
        grit = k.noise((vec, k.add(w, 47.0)), 240.0, detail=2.0, rough=0.6)
        crack_cells = k.voronoi((vec, k.add(w, 71.0)), 1.4, feature="DISTANCE_TO_EDGE")
        crack_mask = k.smooth(k.noise((vec, k.add(w, 83.0)), 0.9, detail=2.0), 0.58, 0.68)
        crack = k.mul(k.mul(k.smooth(crack_cells.outputs["Distance"], 0.006, 0.0), crack_mask), gin.outputs["Cracks"])

        trowel = k.mul(k.add(k.centred(clouds, 1.0), k.centred(swirl, 0.4)), gin.outputs["Trowel"])
        sandy = k.mul(k.add(k.centred(sand, 1.0), k.centred(grit, 0.5)), gin.outputs["Sand"])
        shade = k.madd(trowel, 0.035, k.madd(sandy, 0.03, 1.0))
        col = k.gain(gin.outputs["Color"], k.madd(crack, -0.25, shade))
        height = k.madd(trowel, STUCCO_TROWEL * 0.5,
                        k.madd(sandy, STUCCO_SAND * 0.5, k.madd(crack, -STUCCO_CRACK, STUCCO_TROWEL + STUCCO_SAND)))
        rough = k.madd(sandy, 0.04, k.madd(trowel, -0.04, gin.outputs["Roughness"]))
        ao = k.madd(sandy, 0.08, k.madd(crack, -0.4, 0.9))
        finish(k, gout, col, k.mn(rough, 1.0), height, ao)
    return pbr_material("M_Stucco", ng, 2 * (STUCCO_TROWEL + STUCCO_SAND), params, rebuild=rebuild)


# --- board-formed concrete ---------------------------------------------------------------------------------------------
FORM_BOARD = 0.15         # m: form boards, laid horizontally
FORM_GRAIN = 0.0008       # m: grain printed from the boards
FORM_STEP = 0.0015        # m: board-to-board offset in the face
FORM_RIDGE = 0.0012       # m: grout ridge where two boards met
TIE_PITCH_U = 0.6         # m: form ties along a row
TIE_ROWS = 4              # one tie row every this many boards
TIE_RADIUS = 0.012        # m
TIE_DEPTH = 0.006         # m


def concrete(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Concrete", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#8a8780")),
        ("Board Width", "NodeSocketFloat", FORM_BOARD, 0.05, 0.4),
        ("Board Print", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Ties", "NodeSocketFloat", 1.0, 0.0, 1.0),
        ("Roughness", "NodeSocketFloat", 0.82, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed, prt = gin.outputs["Tile"], gin.outputs["Seed"], gin.outputs["Board Print"]
        bid, bfrac, bpitch = k.cells(v, gin.outputs["Board Width"], tile)
        r0, r1, r2, _ = k.hash(bid, 3.0, 0.0, seed)
        vec, w = k.torus(gin.outputs["Vector"], tile)
        w = k.add(w, seed)
        gvec, gw = k.torus(gin.outputs["Vector"], tile, 40.0, 1.5)              # grain along u, a new pattern per board
        grain = k.noise((gvec, k.add(gw, k.mul(r0, 97.0))), 1.0, detail=4.0, rough=0.6, distortion=0.3)
        blotch = k.noise((vec, w), 1.2, detail=3.0, rough=0.6)
        pores = k.noise((vec, k.add(w, 19.0)), 600.0, detail=1.0)
        bugholes = k.smooth(pores, 0.72, 0.78)

        ridge = k.smooth(k.edge(bfrac, bpitch), 0.003, 0.0)
        # form ties: a row through the middle of every TIE_ROWS-th board, on a pitch that divides the tile
        _tid, tfrac, tpitch = k.cells(u, TIE_PITCH_U, tile)
        on_row = k.m("LESS_THAN", k.m("FLOORED_MODULO", bid, TIE_ROWS), 0.5)
        du = k.mul(k.sub(tfrac, 0.5), tpitch)
        dv = k.mul(k.sub(bfrac, 0.5), bpitch)
        du2 = k.mul(du, du)
        dist = k.m("SQRT", k.add(du2, k.mul(dv, dv)))
        tie = k.mul(k.mul(k.smooth(dist, TIE_RADIUS, TIE_RADIUS * 0.7), on_row), gin.outputs["Ties"])

        tone = k.madd(k.centred(r2, 0.04), prt, k.madd(k.centred(blotch, 0.08), 1.0, 1.0))
        tone = k.madd(k.centred(grain, 0.05), prt, tone)
        col = k.gain(gin.outputs["Color"], k.madd(tie, -0.3, k.madd(bugholes, -0.2, tone)))
        height = k.add(FORM_STEP + FORM_GRAIN, k.mul(k.add(k.centred(r1, FORM_STEP), k.centred(grain, FORM_GRAIN)), prt))
        height = k.madd(ridge, FORM_RIDGE, height)
        height = k.madd(bugholes, -0.0008, k.madd(tie, -TIE_DEPTH, height))
        rough = k.madd(k.centred(blotch, 0.06), 1.0, gin.outputs["Roughness"])
        ao = k.madd(tie, -0.5, k.madd(bugholes, -0.3, k.madd(ridge, 0.05, 0.9)))
        finish(k, gout, col, rough, height, ao)
    return pbr_material("M_Concrete", ng, 2 * (FORM_STEP + FORM_GRAIN) + FORM_RIDGE, params, rebuild=rebuild)


# --- broom-finished slab ------------------------------------------------------------------------------------------------
SLAB_JOINT = 1.5          # m: control-joint grid
SLAB_JOINT_W = 0.006      # m
SLAB_JOINT_D = 0.004      # m
SLAB_BROOM = 0.0006       # m


def concrete_slab(rebuild=False, **params):
    ng, nodes, links, gin, gout = new_group("IS Concrete Slab", inputs=(
        TILE_INPUT, SEED_INPUT,
        ("Color", "NodeSocketColor", lin("#cfc7b8")),
        ("Joint Spacing", "NodeSocketFloat", SLAB_JOINT, 0.5, 6.0),
        ("Broom", "NodeSocketFloat", 1.0, 0.0, 2.0),
        ("Roughness", "NodeSocketFloat", 0.88, 0.0, 1.0)), outputs=OUTPUTS_AO, rebuild=rebuild)
    if nodes:
        k = K(nodes, links)
        u, v, _ = k.sep(gin.outputs["Vector"])
        tile, seed = gin.outputs["Tile"], gin.outputs["Seed"]
        _ui, ufrac, upitch = k.cells(u, gin.outputs["Joint Spacing"], tile)
        _vi, vfrac, vpitch = k.cells(v, gin.outputs["Joint Spacing"], tile)
        half = SLAB_JOINT_W * 0.5
        joint = k.mx(k.smooth(k.edge(ufrac, upitch), half, half - 0.002), k.smooth(k.edge(vfrac, vpitch), half, half - 0.002))
        vec, w = k.torus(gin.outputs["Vector"], tile)
        w = k.add(w, seed)
        bvec, bw = k.torus(gin.outputs["Vector"], tile, 2.0, 260.0)            # bristle lines run along u
        broom = k.noise((bvec, k.add(bw, 5.0)), 1.0, detail=3.0, rough=0.6, distortion=0.4)
        mottle = k.noise((vec, w), 0.8, detail=3.0, rough=0.55)
        speck = k.smooth(k.noise((vec, k.add(w, 31.0)), 400.0, detail=1.0), 0.66, 0.72)

        b = k.mul(k.centred(broom, 1.0), gin.outputs["Broom"])
        tone = k.madd(k.centred(mottle, 0.07), 1.0, k.madd(b, 0.025, 1.0))
        col = k.gain(gin.outputs["Color"], k.madd(joint, -0.35, k.madd(speck, -0.12, tone)))
        height = k.madd(joint, -SLAB_JOINT_D, k.madd(b, SLAB_BROOM * 0.5, SLAB_BROOM))
        rough = k.madd(b, 0.04, k.madd(k.centred(mottle, 0.05), 1.0, gin.outputs["Roughness"]))
        ao = k.madd(joint, -0.5, k.madd(b, 0.06, 0.92))
        finish(k, gout, col, k.mn(rough, 1.0), height, ao)
    return pbr_material("M_ConcreteSlab", ng, 2 * SLAB_BROOM, params, rebuild=rebuild)


MATERIALS = {"stucco": stucco, "concrete": concrete, "concrete_slab": concrete_slab}
