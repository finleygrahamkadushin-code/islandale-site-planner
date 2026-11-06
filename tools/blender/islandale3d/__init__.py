"""Islandale 3D: turns the site planner's exported scene into a Blender scene with real exterior materials, and readies it for Unreal.

Run everything through Blender's own Python, headless:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/<script>.py -- <args>
Units are metres. Blender axes: X east, Y north, Z up (NAVD88 elevation)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]      # the repository
BUILD = ROOT / "build" / "3d"                            # every generated file (gitignored)
