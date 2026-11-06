"""Bring the planner's export into Blender: import the .glb, read its manifest, sort everything into collections and index
every mesh by what it is (planner object, part, mass, edge, wall kind ...), so styling never has to guess from names.

The export's top-level nodes are Terrain, Earthworks, Water and Objects; under Objects there is one node per planner object
("<name> #<id>") and under it that object's meshes, whose glTF extras (part, mi, ei, oid, wallKind ...) Blender's importer
keeps as custom properties."""
import json
import pathlib
from dataclasses import dataclass, field

import bpy

ROOTS = ("Terrain", "Earthworks", "Water", "Objects")
BUILDING_TYPES = ("house", "shop", "shed")
SITE_TYPES = ("pad", "bridge", "deck", "pool", "septic", "garden", "pond", "berm", "cut")
COLLECTIONS = ("Terrain", "Water", "Earthworks", "Buildings", "Site", "Trees", "Other")


@dataclass
class Item:
    """One imported mesh object and what the planner says it is."""
    ob: bpy.types.Object
    root: str                    # Terrain | Earthworks | Water | Objects
    props: dict                  # the mesh's extras, with the planner object's own extras filled in underneath
    planner: dict | None = None  # the manifest's entry for its planner object

    @property
    def part(self):
        return self.props.get("part")

    @property
    def kind(self):
        """building | site | tree | terrain | earthworks | water | other"""
        if self.root != "Objects":
            return self.root.lower()
        t = self.props.get("t") or (self.planner or {}).get("t")
        if t in BUILDING_TYPES:
            return "building"
        if t == "tree" or (self.planner or {}).get("tree"):
            return "tree"
        return "site" if t in SITE_TYPES else "other"


@dataclass
class Site:
    manifest: dict
    items: list = field(default_factory=list)
    objects: dict = field(default_factory=dict)      # oid -> manifest object
    collections: dict = field(default_factory=dict)  # name -> bpy collection

    def buildings(self):
        """oid -> [Item] for every planner building, in manifest order."""
        out = {}
        for it in self.items:
            if it.kind == "building":
                out.setdefault(it.props.get("oid"), []).append(it)
        return out


def _props(ob):
    """An object's glTF extras: object custom properties, then its mesh's, ignoring Blender's own bookkeeping keys."""
    out = {}
    for src in (getattr(ob, "data", None), ob):
        if src is None:
            continue
        for k in src.keys():
            if k.startswith("_") or k in ("cycles", "is_group", "is_relief_m", "is_params"):
                continue
            v = src[k]
            if hasattr(v, "to_dict"):
                v = v.to_dict()
            elif hasattr(v, "to_list"):
                v = v.to_list()
            out[k] = v
    return out


def _root(ob):
    while ob.parent:
        ob = ob.parent
    for r in ROOTS:
        if ob.name == r or ob.name.startswith(r + "."):
            return r
    return None


def _inherited(ob):
    """Extras of the object and every ancestor, nearest winning, so a mesh knows its planner object's oid, name and type."""
    chain = []
    while ob:
        chain.append(_props(ob))
        ob = ob.parent
    merged = {}
    for p in reversed(chain):
        merged.update(p)
    if "oid" not in merged and "id" in merged:
        merged["oid"] = merged["id"]
    return merged


def _collection(parent, name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in parent.children:
        parent.children.link(c)
    return c


def load(glb, manifest_path=None):
    """Import the export into the current scene and return a Site index. The manifest sits beside the glb by default."""
    glb = pathlib.Path(glb)
    manifest_path = pathlib.Path(manifest_path) if manifest_path else glb.with_name(glb.stem + ".manifest.json")
    manifest = json.loads(manifest_path.read_text())
    before, colls_before = set(bpy.data.objects), set(bpy.data.collections)
    bpy.ops.import_scene.gltf(filepath=str(glb), import_shading="NORMALS", merge_vertices=False)
    new = [o for o in bpy.data.objects if o not in before]
    site = Site(manifest=manifest)
    for o in manifest.get("objects", []):
        site.objects[o.get("oid", o.get("id"))] = o
    top = _collection(bpy.context.scene.collection, "Islandale")
    for name in COLLECTIONS:
        site.collections[name] = _collection(top, name)
    for ob in new:
        root = _root(ob)
        props = _inherited(ob)
        planner = site.objects.get(props.get("oid"))
        it = Item(ob=ob, root=root or "Objects", props=props, planner=planner)
        target = {"building": "Buildings", "site": "Site", "tree": "Trees", "terrain": "Terrain", "earthworks": "Earthworks",
                  "water": "Water"}.get(it.kind, "Other")
        coll = site.collections[target]
        if it.kind == "building":
            name = props.get("objName") or (planner or {}).get("name") or f"Building {props.get('oid')}"
            coll = _collection(coll, name)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
        if ob.type == "MESH":
            site.items.append(it)
    for c in set(bpy.data.collections) - colls_before:     # the importer's own collection, now empty
        if not c.objects and not c.children and c.name not in COLLECTIONS and c != top:
            bpy.data.collections.remove(c)
    return site
