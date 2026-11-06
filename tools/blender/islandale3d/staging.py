"""Light, sea and cameras for the site: the planner's own sun model (48.46 deg N), a sea to the horizon at the planner's tide,
an aerial from over the bay, and for each building a three-quarter view and a close look at its main wall.

Azimuths are compass bearings (0 = north, 90 = east); Blender's sky texture uses the same convention for sun_rotation."""
import math

import bmesh
import bpy
from mathutils import Vector

LAT = 48.46                   # deg: the planner's sun latitude
SOLAR_NOON = 12.3             # h: the planner's local solar noon
DECLINATION = {"jun": 23.44, "sep": 0.0, "dec": -23.44}
FT = 0.3048
DETAIL_FACES = 12             # outward wall faces tried for a close-up, biggest first
EYE = 1.65                    # m: camera height above the ground
SUN_POWER = 4.0               # sun lamp irradiance (W/m2 in Blender's scale), matched to the sky's brightness below
SKY_STRENGTH = 0.35
HERO_LENS, DETAIL_LENS, AERIAL_LENS = 30, 35, 32
DICING_RATE = 1.5             # px per micropolygon edge under adaptive subdivision
MAX_SUBDIVISIONS = 7          # caps dicing on close-ups, which otherwise run the GPU out of memory
BASE_CLEARANCE = 0.6          # m above the building's lowest point that the hero view must see
AERIAL_OUT, AERIAL_UP = 0.85, 0.45   # aerial eye: this many building-group spans out over the bay, and up
VIEW_TRIES = (35, -35, 60, -60, 10, -10, 100, -100, 150, -150, 180)   # deg off the building's front, in order of preference


def sun_angles(season="jun", hour=17.0):
    """(azimuth, elevation) in degrees, exactly as the planner's updateSun computes them."""
    lat, decl = math.radians(LAT), math.radians(DECLINATION[season])
    H = math.radians((hour - SOLAR_NOON) * 15)
    sin_el = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(H)
    el = math.asin(sin_el)
    cos_az = (math.sin(decl) - math.sin(lat) * sin_el) / (math.cos(lat) * math.cos(el))
    az = math.acos(max(-1.0, min(1.0, cos_az)))
    if H > 0:
        az = 2 * math.pi - az
    return math.degrees(az), math.degrees(el)


def sky_and_sun(az, el):
    sc = bpy.context.scene
    world = bpy.data.worlds.get("Islandale Sky") or bpy.data.worlds.new("Islandale Sky")
    sc.world = world
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for typ in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
        try:
            sky.sky_type = typ
            break
        except TypeError:
            continue
    sky.sun_disc = False                       # the lamp below makes the sun; the sky only fills
    sky.sun_elevation = math.radians(max(el, 1.0))
    sky.sun_rotation = math.radians(az)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = SKY_STRENGTH
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    lamp = bpy.data.lights.get("Sun") or bpy.data.lights.new("Sun", "SUN")
    lamp.energy = SUN_POWER if el > 0 else 0.0
    lamp.angle = math.radians(0.55)
    sun = bpy.data.objects.get("Sun") or bpy.data.objects.new("Sun", lamp)
    if sun.name not in sc.collection.objects:
        sc.collection.objects.link(sun)
    a, e = math.radians(az), math.radians(el)
    toward = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    sun.rotation_euler = (-toward).to_track_quat("-Z", "Y").to_euler()
    return sun


def sea(level, size, material, collection):
    """A sea plane `size` metres across at `level` (NAVD88 m), so the bay runs out to the horizon."""
    me = bpy.data.meshes.new("Sea")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Sea", me)
    ob.location.z = level
    collection.objects.link(ob)
    if material:
        me.materials.append(material)
    return ob


class Ground:
    """Ground height by ray-casting straight down onto the terrain and earthworks only."""

    def __init__(self, site):
        self.ground = {it.ob for it in site.items if it.kind in ("terrain", "earthworks")}
        self.dg = bpy.context.evaluated_depsgraph_get()

    def z(self, x, y, top=500.0):
        origin = Vector((x, y, top))
        for _ in range(64):
            hit, loc, _n, _i, ob, _m = bpy.context.scene.ray_cast(self.dg, origin, Vector((0, 0, -1)))
            if not hit:
                return None
            if ob in self.ground or (ob.original in self.ground):
                return loc.z
            origin = loc - Vector((0, 0, 0.01))
        return None


def _bbox(obs):
    pts = [ob.matrix_world @ Vector(c) for ob in obs for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _camera(name, eye, look, lens, collection):
    cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, bpy.data.cameras.new(name))
    cam.location = eye
    cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 5000
    if cam.name not in collection.objects:
        collection.objects.link(cam)
    return cam


def _clear_view(eye, targets, own, others_boxes, dg):
    """True if eye is outside other buildings and nothing but the building itself stands between eye and every target."""
    for lo, hi in others_boxes:
        if lo.x - 0.5 < eye.x < hi.x + 0.5 and lo.y - 0.5 < eye.y < hi.y + 0.5 and eye.z < hi.z + 0.5:
            return False
    for look in targets:
        d = look - eye
        hit, _loc, _n, _i, ob, _m = bpy.context.scene.ray_cast(dg, eye, d.normalized(), distance=d.length * 0.97)
        if hit and ob not in own and ob.original not in own:
            return False
    return True


def building_cameras(site, ground, tide, collection):
    """A hero three-quarter view and a wall close-up per building. Returns the cameras made."""
    cams = []
    dg = bpy.context.evaluated_depsgraph_get()
    groups = site.buildings()
    boxes = {oid: _bbox([it.ob for it in items]) for oid, items in groups.items()}
    for oid, items in groups.items():
        planner = site.objects.get(oid, {})
        name = planner.get("name") or items[0].props.get("objName") or f"Building {oid}"
        own = {it.ob for it in items}
        walls = [it.ob for it in items if it.part == "wall"] or [it.ob for it in items]
        lo, hi = _bbox(walls)
        centre = (lo + hi) / 2
        radius = max((hi - lo).xy.length / 2, 3.0)
        rot = math.radians(planner.get("rot", 0.0))
        front = Vector((math.sin(rot), -math.cos(rot)))            # the planner's local +z (front, toward the bay)
        others = [b for k, b in boxes.items() if k != oid]
        look = Vector((centre.x, centre.y, lo.z + (hi.z - lo.z) * 0.45))
        base = Vector((centre.x, centre.y, lo.z + BASE_CLEARANCE))        # the hero must see the building meet the ground
        hero = None
        for dist_k in (2.4, 3.0, 1.9):
            for off in VIEW_TRIES:
                a = math.radians(off)
                d = Vector((front.x * math.cos(a) - front.y * math.sin(a), front.x * math.sin(a) + front.y * math.cos(a)))
                xy = centre.xy + d * (radius * dist_k + 4.0)
                gz = ground.z(xy.x, xy.y)
                if gz is None or gz < tide + 0.3:
                    continue
                eye = Vector((xy.x, xy.y, gz + EYE))
                if _clear_view(eye, (look, base), own, others, dg):
                    hero = eye
                    break
            if hero:
                break
        safe = name.replace("’", "").replace("'", "")
        if hero:
            cams.append(_camera(f"CAM {safe}", hero, look, HERO_LENS, collection))
        detail = _detail_view(walls, centre, ground, own, others, dg)
        if detail:
            cams.append(_camera(f"CAM {safe} detail", *detail, DETAIL_LENS, collection))
    return cams


def _detail_view(walls, centre, ground, own, others, dg):
    """Eye and target for a close look at an outward wall face, slightly off-square so relief shows: the biggest face
    with a clear view, trying up to DETAIL_FACES of them, biggest first (a wall facing a slope or a tree can't be seen).
    Faces whose normal points back toward the building's centre are its inner skin and are skipped."""
    faces = []
    for ob in walls:
        mw = ob.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        for p in ob.data.polygons:
            n = (nm @ p.normal).normalized()
            if abs(n.z) > 0.3 or n.xy.dot((mw @ p.center).xy - centre.xy) <= 0:
                continue
            faces.append((p.area * mw.to_3x3().determinant() ** (2 / 3), mw @ p.center, n))
    faces.sort(key=lambda f: -f[0])
    for _, c, n in faces[:DETAIL_FACES]:
        side = Vector((-n.y, n.x, 0)).normalized()
        for flip in (1, -1):
            for dist in (3.4, 2.6, 4.5):
                eye_xy = c.xy + n.xy * dist + side.xy * 1.1 * flip
                gz = ground.z(eye_xy.x, eye_xy.y)
                eye = Vector((eye_xy.x, eye_xy.y, max(c.z, (gz or c.z) + 1.4)))
                if _clear_view(eye, (c,), own, others, dg):
                    return eye, c
    return None


def aerial_camera(site, ground, tide, collection):
    """From over the bay, looking back at the buildings: the direction where the ground falls lowest within 60 m."""
    groups = site.buildings()
    obs = [it.ob for items in groups.values() for it in items] or [it.ob for it in site.items]
    lo, hi = _bbox(obs)
    centre = (lo + hi) / 2
    best = None
    for k in range(16):
        a = 2 * math.pi * k / 16
        d = Vector((math.sin(a), math.cos(a)))
        z = ground.z(centre.x + d.x * 60, centre.y + d.y * 60)
        z = tide - 5 if z is None else z
        if best is None or z < best[0]:
            best = (z, d)
    d = best[1]
    span = max((hi - lo).xy.length, 30.0)
    eye = Vector((centre.x + d.x * span * AERIAL_OUT, centre.y + d.y * span * AERIAL_OUT, tide + span * AERIAL_UP))
    return _camera("CAM Aerial over the bay", eye, Vector((centre.x, centre.y, lo.z + 2)), AERIAL_LENS, collection)


def render_settings(res=(1920, 1080), samples=128):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.cycles.dicing_rate = DICING_RATE
    sc.cycles.max_subdivisions = MAX_SUBDIVISIONS
    sc.cycles.offscreen_dicing_scale = 8.0
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.use_persistent_data = True
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
