"""Blender's frame to Unreal's, and the rotations 6G gives its lights and cameras. Pure.

Blender: metres, X east, Y north, Z up (NAVD88). Blender's glTF exporter writes (x, z, -y). The installed UE 5.8.4 Interchange
reader maps glTF (x, y, z) to (x, z, y) (GLTFCore/Private/GLTF/ConversionUtilities.h, ConvertVec3) and scales by 100
(InterchangeGltfPrivate.h, GltfUnitConversionMultiplier). Together: Unreal = (100 x, -100 y, 100 z) cm, so +X east,
+Y south (north is -Y), Z up.

Unreal rotators: forward = (cos P cos Y, cos P sin Y, sin P) (FRotator::Vector, Core/Private/Math/UnrealMath.cpp), in
degrees. A DirectionalLight shines along its forward; a camera looks along its forward."""
from __future__ import annotations

import math

CM_PER_M = 100.0
BLENDER_TO_UE = ((CM_PER_M, 0.0, 0.0), (0.0, -CM_PER_M, 0.0), (0.0, 0.0, CM_PER_M))
FRAMES = {
    "blender": "metres; +X east, +Y north, +Z up (NAVD88 elevation)",
    "gltf": "metres; +X east, +Y up, -Z north (Blender's exporter writes (x, z, -y))",
    "unreal": "centimetres; +X east, +Y south (north = -Y), +Z up (NAVD88 elevation x 100); every actor at the origin",
    "blender_to_unreal": [list(r) for r in BLENDER_TO_UE],
    "unreal_rotator": "degrees; forward = (cos P cos Y, cos P sin Y, sin P); a DirectionalLight shines along forward",
}
FILMBACK_MM = 36.0            # Blender's default sensor width; the cameras keep it (sensor_fit AUTO = horizontal here)


def to_ue(p) -> tuple[float, float, float]:
    """A Blender point (m) in Unreal (cm)."""
    x, y, z = p
    return (x * CM_PER_M, -y * CM_PER_M, z * CM_PER_M)


def dir_to_ue(d) -> tuple[float, float, float]:
    """A Blender direction in Unreal axes (unscaled)."""
    x, y, z = d
    return (x, -y, z)


def toward_sun(azimuth_deg: float, elevation_deg: float) -> tuple[float, float, float]:
    """Unit vector toward the sun in Blender's frame; azimuth from north, clockwise (as staging.sun_angles)."""
    a, e = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))


def rotator(d) -> dict:
    """Unreal pitch, yaw, roll (degrees) whose forward is the direction d (in Unreal axes)."""
    x, y, z = d
    n = math.sqrt(x * x + y * y + z * z)
    if n < 1e-12:
        raise ValueError("a rotator needs a direction, not a zero vector")
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, z / n))))
    yaw = math.degrees(math.atan2(y, x)) if abs(x) + abs(y) > 1e-12 else 0.0
    return {"pitch": round(pitch, 6), "yaw": round(yaw, 6), "roll": 0.0}


def forward(rot: dict) -> tuple[float, float, float]:
    """The inverse of rotator: FRotator::Vector."""
    p, y = math.radians(rot["pitch"]), math.radians(rot["yaw"])
    return (math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p))


def sun_rotator(azimuth_deg: float, elevation_deg: float) -> dict:
    """The DirectionalLight's rotation: it shines from the sun, along -toward_sun."""
    tx, ty, tz = dir_to_ue(toward_sun(azimuth_deg, elevation_deg))
    return rotator((-tx, -ty, -tz))


def camera_rotator(eye_m, look_m) -> dict:
    """A camera at eye looking at look (Blender metres), as an Unreal rotator."""
    e, t = to_ue(eye_m), to_ue(look_m)
    return rotator((t[0] - e[0], t[1] - e[1], t[2] - e[2]))


def horizontal_fov_deg(lens_mm: float, filmback_mm: float = FILMBACK_MM) -> float:
    return math.degrees(2 * math.atan(filmback_mm / (2 * lens_mm)))
