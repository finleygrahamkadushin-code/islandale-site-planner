"""The shape every Islandale material shares, so the scene builder, the swatch renders and the Unreal baker treat them alike.

A material is a node group "IS <Title>" holding its look, wrapped by `pbr_material` into a Material.
  Group inputs:  "Vector" first (UVMeters coordinates: metres, u along the wall, v up), then the material's own tunables.
  Group outputs: Base Color, Roughness, Metallic, Height (metres of relief: 0 = the wall's face, + outward), then optionally
                 Alpha, Transmission, Emission Color, and AO (cavity 0..1, for the baker's ORM texture).
Each material module exposes MATERIALS = {"key": build}; build(**params) returns a bpy.types.Material and reuses the datablock
of the same name unless rebuild=True. Params override the group's input defaults by input name.

Two rules keep every material bakeable for Unreal:
  - The group is a pure function of Vector and its inputs: no Geometry, Texture Coordinate, Object Info, Attribute, AO, Bevel
    or Light Path nodes inside it.
  - It has a "Tile" input (metres, default TILE_DEFAULT) and repeats exactly every Tile in u and v: noise through `torus4d`,
    cell patterns (courses, boards, panels) through `wrapped_cells`. swatch.py --tile-test measures it."""
import bpy

from ..uv import UV_MAP

OUTPUTS = (("Base Color", "NodeSocketColor"), ("Roughness", "NodeSocketFloat"), ("Metallic", "NodeSocketFloat"),
           ("Height", "NodeSocketFloat"))
OPTIONAL_OUTPUTS = (("Alpha", "NodeSocketFloat"), ("Transmission", "NodeSocketFloat"), ("Emission Color", "NodeSocketColor"),
                    ("AO", "NodeSocketFloat"))
_PRINCIPLED = {"Base Color": "Base Color", "Roughness": "Roughness", "Metallic": "Metallic", "Alpha": "Alpha",
               "Transmission": "Transmission Weight", "Emission Color": "Emission Color"}


def new_group(name, inputs=(), outputs=OUTPUTS, rebuild=False):
    """A fresh shader node group. inputs: (name, socket_type, default[, min, max]) after the leading "Vector".
    Returns (group, nodes, links, group_in, group_out); an existing group is returned untouched (nodes None) unless rebuild."""
    ng = bpy.data.node_groups.get(name)
    if ng and not rebuild:
        return ng, None, None, None, None
    if ng:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    ng.interface.new_socket("Vector", in_out="INPUT", socket_type="NodeSocketVector")
    for spec in inputs:
        s = ng.interface.new_socket(spec[0], in_out="INPUT", socket_type=spec[1])
        s.default_value = spec[2]
        if len(spec) > 3:
            s.min_value, s.max_value = spec[3], spec[4]
    for nm, typ in outputs:
        ng.interface.new_socket(nm, in_out="OUTPUT", socket_type=typ)
    nodes, links = ng.nodes, ng.links
    gin = nodes.new("NodeGroupInput")
    gin.location = (-1400, 0)
    gout = nodes.new("NodeGroupOutput")
    gout.location = (1400, 0)
    return ng, nodes, links, gin, gout


def node(nodes, typ, loc=(0, 0), inputs=None, **props):
    """Add a node, set its properties, then its unlinked input defaults (by name or index)."""
    n = nodes.new(typ)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    for k, v in (inputs or {}).items():
        n.inputs[k].default_value = v
    return n


TILE_DEFAULT = 6.0    # m: every material repeats exactly this often in u and v, so Unreal gets seamless tiling texture sets


def math(nodes, links, op, a, b=None, loc=(0, 0), clamp=False):
    """A Math node; a and b may be numbers or sockets. Returns its output socket."""
    n = node(nodes, "ShaderNodeMath", loc, operation=op, use_clamp=clamp)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            links.new(x, n.inputs[i])
    return n.outputs[0]


def torus4d(nodes, links, vec, tile, loc=(-1200, 0)):
    """Seamless noise: map UVMeters (u, v) onto a 4D torus so any 4D Noise or Voronoi (set its dimensions to '4D', feed
    Vector and W from here) repeats exactly every `tile` metres in u and v, while a noise unit stays a metre on the surface.
    tile: number or socket (usually the group's "Tile" input). Returns (vector_socket, w_socket)."""
    x, y = loc
    sep = node(nodes, "ShaderNodeSeparateXYZ", (x, y))
    links.new(vec, sep.inputs[0])
    k = math(nodes, links, "DIVIDE", 2 * 3.141592653589793, tile, (x, y - 200))       # radians per metre
    r = math(nodes, links, "DIVIDE", tile, 2 * 3.141592653589793, (x, y - 360))       # torus radius
    au = math(nodes, links, "MULTIPLY", sep.outputs["X"], k, (x + 180, y))
    av = math(nodes, links, "MULTIPLY", sep.outputs["Y"], k, (x + 180, y - 160))
    parts = [math(nodes, links, "MULTIPLY", math(nodes, links, op, ang, None, (x + 360, y - 120 * i)), r, (x + 540, y - 120 * i))
             for i, (op, ang) in enumerate((("COSINE", au), ("SINE", au), ("COSINE", av), ("SINE", av)))]
    comb = node(nodes, "ShaderNodeCombineXYZ", (x + 720, y))
    for i in range(3):
        links.new(parts[i], comb.inputs[i])
    return comb.outputs[0], parts[3]


def wrapped_cells(nodes, links, coord, pitch, tile, loc=(0, 0)):
    """Integer cell index along one axis for cells of about `pitch` metres, wrapped so the cells tile exactly every `tile`
    metres: the real pitch is tile / round(tile / pitch). Returns (index_socket, fraction_in_cell_socket, true_pitch_socket);
    hash the index (White Noise) for per-cell randomness that repeats with the tile."""
    x, y = loc
    count = math(nodes, links, "MAXIMUM", math(nodes, links, "ROUND", math(nodes, links, "DIVIDE", tile, pitch, (x, y)), None,
                                                (x + 160, y)), 1.0, (x + 320, y))
    true_pitch = math(nodes, links, "DIVIDE", tile, count, (x + 480, y))
    scaled = math(nodes, links, "DIVIDE", coord, true_pitch, (x + 480, y - 160))
    idx = math(nodes, links, "FLOOR", scaled, None, (x + 640, y - 160))
    frac = math(nodes, links, "SUBTRACT", scaled, idx, (x + 800, y - 160))
    wrapped = math(nodes, links, "FLOORED_MODULO", idx, count, (x + 800, y))
    return wrapped, frac, true_pitch


def pbr_material(name, group, relief, params=None, displacement=True, blend=False, rebuild=False):
    """Wrap a material group into a Material: UVMeters -> group -> Principled BSDF, Height -> world-space displacement.
    relief = the most the Height output can reach (m); the baker normalises height maps by it and Unreal scales by it."""
    mat = bpy.data.materials.get(name)
    if mat and not rebuild and mat.get("is_group") == group.name:
        return mat
    mat = mat or bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    nodes, links = nt.nodes, nt.links
    uv = node(nodes, "ShaderNodeUVMap", (-900, 0), uv_map=UV_MAP)
    g = node(nodes, "ShaderNodeGroup", (-600, 0), node_tree=group)
    for k, v in (params or {}).items():
        if k not in g.inputs:
            raise KeyError(f"{group.name} has no input {k!r}; it has {[s.name for s in g.inputs]}")
        g.inputs[k].default_value = v
    links.new(uv.outputs["UV"], g.inputs["Vector"])
    bsdf = node(nodes, "ShaderNodeBsdfPrincipled", (-200, 0))
    for out, inp in _PRINCIPLED.items():
        if out in g.outputs:
            links.new(g.outputs[out], bsdf.inputs[inp])
    if "Emission Color" in g.outputs:
        bsdf.inputs["Emission Strength"].default_value = 1.0
    mout = node(nodes, "ShaderNodeOutputMaterial", (200, 0))
    links.new(bsdf.outputs["BSDF"], mout.inputs["Surface"])
    if displacement and relief > 0:
        disp = node(nodes, "ShaderNodeDisplacement", (-200, -500), space="WORLD", inputs={"Midlevel": 0.0, "Scale": 1.0})
        links.new(g.outputs["Height"], disp.inputs["Height"])
        links.new(disp.outputs["Displacement"], mout.inputs["Displacement"])
        mat.displacement_method = "BOTH"
    else:
        mat.displacement_method = "BUMP"
    if blend:
        mat.surface_render_method = "BLENDED"
    mat["is_group"] = group.name
    mat["is_relief_m"] = float(relief)
    mat["is_params"] = {k: (list(v) if hasattr(v, "__len__") else v) for k, v in (params or {}).items()}
    return mat
