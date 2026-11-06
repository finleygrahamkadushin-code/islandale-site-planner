"""Dress the imported scene: give every surface metre UVs, then the material styles.json asks for.

Building surfaces resolve per part (wall, roof, trim, deck ...) through the building's own entry, the planner's wall kind,
roof material and rail style, then the defaults. Walls can carry a stone wainscot: one material that switches from the
lower material to the upper at a height above the wall's base (UV v is world height on walls, so the switch is a level line).
Site surfaces resolve by role; the terrain blends meadow into beach toward the shore."""
import json
import re

import bpy

from .materials import registry
from .materials.common import node
from .uv import UV_MAP, apply_uv_meters

MIX_OUTPUTS = (("Base Color", "RGBA"), ("Roughness", "FLOAT"), ("Metallic", "FLOAT"), ("Height", "FLOAT"), ("AO", "FLOAT"))
PRINCIPLED = {"Base Color": "Base Color", "Roughness": "Roughness", "Metallic": "Metallic"}
DISPLACE_MIN_RELIEF = 0.02     # m: below this, bump alone reads the same and subdivision only costs GPU memory
DISPLACE_PARTS = ("wall", "header", "sill", "roof", "deck")   # the surfaces whose relief shows at building scale
WELD_DIST = 0.0005             # m: weld coincident vertices before displacing so corners don't crack open


def _group_node(mat):
    return next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeGroup"), None)


def _copy_group(nodes, src_node, loc):
    g = node(nodes, "ShaderNodeGroup", loc, node_tree=src_node.node_tree)
    for s in src_node.inputs:
        if s.name != "Vector" and hasattr(s, "default_value"):
            g.inputs[s.name].default_value = s.default_value
    return g


def _finish(mat, nodes, links, outs, relief):
    """Principled BSDF and world-space displacement from a dict of output sockets, as pbr_material wires them."""
    bsdf = node(nodes, "ShaderNodeBsdfPrincipled", (300, 0))
    for k, inp in PRINCIPLED.items():
        if k in outs:
            links.new(outs[k], bsdf.inputs[inp])
    mout = node(nodes, "ShaderNodeOutputMaterial", (700, 0))
    links.new(bsdf.outputs["BSDF"], mout.inputs["Surface"])
    if relief > 0 and "Height" in outs:
        disp = node(nodes, "ShaderNodeDisplacement", (300, -500), space="WORLD", inputs={"Midlevel": 0.0, "Scale": 1.0})
        links.new(outs["Height"], disp.inputs["Height"])
        links.new(disp.outputs["Displacement"], mout.inputs["Displacement"])
    mat.displacement_method = "BOTH" if relief > 0 else "BUMP"
    mat["is_relief_m"] = float(relief)


def blend_materials(name, a, b, factor_fn):
    """A material that is `a` where factor is 0 and `b` where it is 1; factor_fn(nodes, links, uv_node) -> factor socket."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    nodes, links = nt.nodes, nt.links
    uv = node(nodes, "ShaderNodeUVMap", (-1200, 0), uv_map=UV_MAP)
    ga, gb = _copy_group(nodes, _group_node(a), (-900, 300)), _copy_group(nodes, _group_node(b), (-900, -300))
    for g in (ga, gb):
        links.new(uv.outputs["UV"], g.inputs["Vector"])
    fac = factor_fn(nodes, links, uv)
    outs = {}
    for i, (out, typ) in enumerate(MIX_OUTPUTS):
        if out not in ga.outputs or out not in gb.outputs:
            continue
        mix = node(nodes, "ShaderNodeMix", (-200, 400 - 160 * i), data_type=typ)
        links.new(fac, mix.inputs["Factor"])
        links.new(ga.outputs[out], mix.inputs["A"])
        links.new(gb.outputs[out], mix.inputs["B"])
        outs[out] = mix.outputs["Result"]
    _finish(mat, nodes, links, outs, max(a.get("is_relief_m", 0.0), b.get("is_relief_m", 0.0)))
    mat["is_blend"] = [a.name, b.name]
    return mat


def wainscot_material(upper, lower, top_z):
    """`lower` (stone) up to world height top_z, `upper` above it."""
    def factor(nodes, links, uv):
        sep = node(nodes, "ShaderNodeSeparateXYZ", (-900, 0))
        links.new(uv.outputs["UV"], sep.inputs[0])
        cmp = node(nodes, "ShaderNodeMath", (-700, 0), operation="LESS_THAN", inputs={1: top_z})
        links.new(sep.outputs["Y"], cmp.inputs[0])
        return cmp.outputs[0]
    return blend_materials(f"{upper.name}_over_{lower.name}_{top_z:.2f}", upper, lower, factor)


def terrain_material(meadow, beach, shore_z, blend_m):
    """Meadow above the shore line, beach below it, mixed over blend_m by world height."""
    def factor(nodes, links, uv):
        geo = node(nodes, "ShaderNodeNewGeometry", (-1100, -200))
        sep = node(nodes, "ShaderNodeSeparateXYZ", (-900, -200))
        links.new(geo.outputs["Position"], sep.inputs[0])
        ramp = node(nodes, "ShaderNodeMapRange", (-700, -200), interpolation_type="SMOOTHSTEP",
                    inputs={"From Min": shore_z + blend_m, "From Max": shore_z - blend_m, "To Min": 0.0, "To Max": 1.0})
        links.new(sep.outputs["Z"], ramp.inputs["Value"])
        return ramp.outputs["Result"]
    return blend_materials("M_Terrain", meadow, beach, factor)


GABLE = "gable"                 # the 3D export's gable ends: styled as their building's wall


class Styler:
    """Resolves styles.json entries to materials, building each library material once."""

    def __init__(self, styles_path, allow_missing=False):
        self.styles = json.loads(open(styles_path).read())
        self.reg, self.broken = registry()
        self.allow_missing = allow_missing
        self.made = {}

    def material(self, spec):
        """spec: a key, or {"material": key, "params": {...}}. Returns a Material (None for an explicit null).
        A key no module defines is an error, unless allow_missing: then it wears the UV grid, named M_Missing_<key>."""
        if spec is None:
            return None
        key, params = (spec, {}) if isinstance(spec, str) else (spec["material"], spec.get("params") or {})
        if key not in self.reg:
            msg = (f"styles.json asks for {key!r}, which no material module defines "
                   f"(known: {sorted(self.reg)}; failed to import: {self.broken or 'none'})")
            if not self.allow_missing:
                raise KeyError(msg)
            if key not in self.made:
                print(f"WARNING {msg}; using the UV grid")
                self.made[key] = self.reg["uv_grid"]().copy()
                self.made[key].name = f"M_Missing_{key}"
            return self.made[key]
        tag = key if not params else f"{key}:{json.dumps(params, sort_keys=True)}"
        if tag not in self.made:
            mat = self.reg[key]()
            if params:
                mat = mat.copy()
                mat.name = f"{mat.name}_{len(self.made)}"
                g = _group_node(mat)
                for k, v in params.items():
                    g.inputs[k].default_value = v
                mat["is_params"] = params
            self.made[tag] = mat
        return self.made[tag]

    def building_spec(self, item):
        """The styles.json spec for one building mesh, or None to keep the planner's own material."""
        name = (item.props.get("objName") or (item.planner or {}).get("name") or "").lower()
        own = next((b["parts"] for pat, b in self.styles["buildings"].items() if pat.lower() in name), {})
        part = item.part or ""
        if part in own:
            return own[part]
        if part == GABLE and "wall" in own:          # a gable end is wall cladding above the wall top
            return own["wall"]
        return self.default_spec(item)

    def default_spec(self, item):
        """A part's material from the planner's wall kind, roof material or rail style, else defaults.parts."""
        d = self.styles["defaults"]
        part = "wall" if item.part == GABLE else (item.part or "")
        if part == "wall" and item.props.get("wallKind") in d["wall_kinds"]:
            return d["wall_kinds"][item.props["wallKind"]]
        if part == "roof" and item.props.get("roofMat") in d["roof_mats"]:
            return d["roof_mats"][item.props["roofMat"]]
        if part == "rail":
            return d["rail_styles"].get(item.props.get("railStyle") or "wood", "steel")
        return d["parts"].get(part)

    def site_spec(self, item):
        """Pads and decks dress only their own surface: a pad's parked cars and a bridge's rails resolve like any part."""
        s = self.styles["site"]
        if item.kind == "earthworks":
            return s["retaining"] if item.part == "retaining" else s["earthworks"]
        if item.kind == "water":
            return s["water"]
        t = item.props.get("t") or (item.planner or {}).get("t")
        if t in ("bridge", "deck"):
            return s[t] if item.part in (None, "deck") else self.default_spec(item)
        if t == "pad" and item.part in (None, "pad"):
            name = (item.props.get("objName") or (item.planner or {}).get("name") or "").lower()
            return next((p["material"] for p in s["pads"] if re.search(p["match"], name)), s["pad_default"])
        return None


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def dress(site, styles_path, allow_missing=False):
    """UVs and materials for the whole site. Returns (report: material name -> meshes wearing it, the Styler).
    Interior partitions and furniture keep the planner's own colours."""
    sty = Styler(styles_path, allow_missing)
    outlines = {oid: [m["outline"] for m in o.get("masses", []) if m.get("outline")] for oid, o in site.objects.items()}
    wall_base = {}
    for oid, items in site.buildings().items():
        zs = [min((it.ob.matrix_world @ v.co).z for v in it.ob.data.vertices) for it in items if it.part == "wall" and it.ob.data.vertices]
        if zs:
            wall_base[oid] = min(zs)
    report = {}
    s = sty.styles["site"]
    terrain_mat = None
    for it in site.items:
        oid = it.props.get("oid")
        apply_uv_meters(it.ob, outlines=outlines.get(oid) if it.kind == "building" else None)
        mat = None
        if it.kind == "building" and not (it.props.get("interior") or it.part == "furniture"):
            spec = sty.building_spec(it)
            if isinstance(spec, dict) and "wainscot" in spec and it.part == GABLE:
                mat = sty.material(spec["material"])          # gables sit above the wainscot
            elif isinstance(spec, dict) and "wainscot" in spec:
                w = spec["wainscot"]
                mat = wainscot_material(sty.material(spec["material"]), sty.material(w["material"]),
                                        wall_base.get(oid, 0.0) + w["height_m"])
            elif spec is not None:
                mat = sty.material(spec)
        elif it.kind == "terrain":
            if terrain_mat is None:
                shore = s["shore"]
                terrain_mat = terrain_material(sty.material(s["terrain"]), sty.material(shore["material"]),
                                               shore["below_m"], shore["blend_m"])
            mat = terrain_mat
        elif it.kind in ("site", "earthworks", "water"):
            spec = sty.site_spec(it)
            mat = sty.material(spec) if spec else None
        if mat is not None:
            assign(it.ob, mat)
            report[mat.name] = report.get(mat.name, 0) + 1
    bump_only(report)
    return report, sty


def bump_only(report):
    """Relief as bump on every material dressed here. A material set to BOTH moves the vertices of any mesh it is on,
    subdivided or not; the export's meshes are loose triangles whose UV frames differ from face to face on slopes, so
    neighbouring triangles move apart and the sky shows through the cracks. true_displacement switches back to BOTH only
    for the materials it subdivides."""
    for name in report:
        mat = bpy.data.materials.get(name)
        if mat and mat.displacement_method == "BOTH":
            mat.displacement_method = "BUMP"


def carve_inward(mat):
    """True displacement sinks the relief into the surface (its highest point on the face) instead of raising it: raised,
    3.5 cm of kurinuki swallows the door, the window frames and the header, which sit flush with the wall."""
    for n in mat.node_tree.nodes:
        if n.type == "DISPLACEMENT":
            n.inputs["Midlevel"].default_value = float(mat.get("is_relief_m", 0.0))


def true_displacement(site, min_relief=DISPLACE_MIN_RELIEF):
    """Adaptive subdivision on building meshes whose material has real relief, so stone and carving break the silhouette."""
    import bmesh
    count = 0
    for it in site.items:
        if it.kind != "building" or it.part not in DISPLACE_PARTS or not it.ob.data.materials:
            continue
        mat = it.ob.data.materials[0]
        if not mat or mat.get("is_relief_m", 0.0) < min_relief:
            continue
        bm = bmesh.new()
        bm.from_mesh(it.ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD_DIST)
        bm.to_mesh(it.ob.data)
        bm.free()
        sub = it.ob.modifiers.new("Displace detail", "SUBSURF")
        sub.subdivision_type = "SIMPLE"
        sub.use_adaptive_subdivision = True
        if mat.displacement_method != "BOTH":
            mat.displacement_method = "BOTH"
            carve_inward(mat)
        count += 1
    return count
