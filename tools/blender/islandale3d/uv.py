"""World-scale UVs: one UV unit is one metre, so every procedural material is true size and the Unreal bakes tile the same way.

Walls: u runs along the wall, v is the world height (Z), so stone courses stay level from wall to wall. Give `outlines` (each mass
footprint as a closed polyline of world [x, y] metres) and a wall face lying along one takes u = arc length round that outline:
courses and carving then run unbroken round the octagon and the curved prow instead of restarting on every facet.
Sloped faces (roofs): u along the contour, v up the slope, so standing seams and shingles run downhill.
Flat faces: u, v = world x, y."""
import math

import bmesh
from mathutils import Vector

UV_MAP = "UVMeters"
WALL_NZ = 0.35        # |normal.z| below this is a wall
FLAT_NZ = 0.985       # above this is flat
MATCH_DIST = 0.75     # m: how far a wall face may sit from its outline segment (wall thickness, cladding, outline on the centre line)
MATCH_PARALLEL = 0.3  # |cos| between the face's horizontal normal and the segment direction must be under this


def outline_segments(outlines):
    """Closed polylines -> (ax, ay, dx, dy, length, s0) per segment; s0 = arc length at its start."""
    segs = []
    for poly in outlines or []:
        pts = [tuple(p[:2]) for p in poly]
        if len(pts) > 2 and pts[0] == pts[-1]:
            pts = pts[:-1]
        s = 0.0
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-6:
                continue
            segs.append((a[0], a[1], dx / L, dy / L, L, s))
            s += L
    return segs


def _match(segs, c, nh):
    """The outline segment a wall face (centre c, horizontal unit normal nh) lies along, or None."""
    best, best_d = None, MATCH_DIST
    for seg in segs:
        ax, ay, dx, dy, L, _ = seg
        if abs(nh[0] * dx + nh[1] * dy) > MATCH_PARALLEL:
            continue
        rx, ry = c[0] - ax, c[1] - ay
        t = rx * dx + ry * dy
        if t < -MATCH_DIST or t > L + MATCH_DIST:
            continue
        d = abs(rx * dy - ry * dx)
        if d < best_d:
            best, best_d = seg, d
    return best


def apply_uv_meters(obj, outlines=None, name=UV_MAP):
    """Write a metre-scale UV map called `name` onto a mesh object (world space, so the object's transform is honoured).
    Returns the number of wall faces that followed an outline."""
    me = obj.data
    mw = obj.matrix_world
    nmat = mw.to_3x3().inverted_safe().transposed()
    segs = outline_segments(outlines)
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.loops.layers.uv.get(name) or bm.loops.layers.uv.new(name)
    followed = 0
    for f in bm.faces:
        n = (nmat @ f.normal)
        if n.length < 1e-9:
            continue
        n.normalize()
        pts = [mw @ l.vert.co for l in f.loops]
        if abs(n.z) < WALL_NZ:
            nh = Vector((n.x, n.y))
            nh.normalize()
            c = mw @ f.calc_center_median()
            seg = _match(segs, c, nh) if segs else None
            if seg:
                ax, ay, dx, dy, _, s0 = seg
                us = [s0 + (p.x - ax) * dx + (p.y - ay) * dy for p in pts]
                followed += 1
            else:
                tx, ty = -nh.y, nh.x
                us = [p.x * tx + p.y * ty for p in pts]
            vs = [p.z for p in pts]
        elif abs(n.z) < FLAT_NZ:
            t = Vector((-n.y, n.x, 0.0)).normalized()     # along the contour
            s = n.cross(t).normalized()                   # up the slope
            if s.z < 0:
                s.negate()
            us = [p.dot(t) for p in pts]
            vs = [p.dot(s) for p in pts]
        else:
            us = [p.x for p in pts]
            vs = [p.y for p in pts]
        for l, u, v in zip(f.loops, us, vs):
            l[layer].uv = (u, v)
    bm.to_mesh(me)
    bm.free()
    if me.uv_layers.get(name):
        me.uv_layers.active = me.uv_layers[name]
        me.uv_layers[name].active_render = True
    return followed
