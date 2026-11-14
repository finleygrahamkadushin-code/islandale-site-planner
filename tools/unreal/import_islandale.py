"""6G: build the Islandale level in Unreal from 6F's export (PLAN-6G.md). SKELETON: the phases are laid out, and the
plan they carry out is islandale_plan.py; the Unreal calls are filled in during 6G, each one checked against the installed
engine (dump_api.py). Runs inside Unreal, safe to run twice:

    UnrealEditor-Cmd <IslandaleUE>.uproject -run=pythonscript -unattended -nosplash \
        -script="tools/unreal/import_islandale.py --scene <build/3d/unreal/scene> [--only textures,masters,...]"

Phases, in order (each finds what an earlier run made and replaces it, never duplicates it):
  textures   import every map 6F's slots need, with its sRGB and compression settings
  masters    the master materials: opaque (with Nanite displacement), glass, water, foliage, wainscot, terrain, colour
  instances  one material instance per slot, its textures and numbers set from materials.json and scene.json
  meshes     import each group's .glb (Nanite on, full-precision UVs) and bind each slot to its instance
  level      /Game/Islandale/Maps/Islandale: the groups at the origin, sun, sky, fog, post, the cameras"""
import argparse
import json
import pathlib
import sys

import unreal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import api_check  # noqa: E402
import islandale_plan  # noqa: E402

PHASES = ("textures", "masters", "instances", "meshes", "level")


def log(msg):
    unreal.log(f"ISLANDALE {msg}")


def run_textures(plan):
    raise NotImplementedError("6G: AssetImportTask per texture, then set srgb / compression_settings / flip_green_channel")


def run_masters(plan):
    raise NotImplementedError("6G: MaterialFactoryNew + MaterialEditingLibrary expressions, recompile_material")


def run_instances(plan):
    raise NotImplementedError("6G: MaterialInstanceConstantFactoryNew, set_material_instance_*_parameter_value")


def run_meshes(plan):
    raise NotImplementedError("6G: InterchangeManager.import_asset with a tuned pipeline, StaticMesh.set_material per slot")


def run_level(plan):
    raise NotImplementedError("6G: LevelEditorSubsystem.new_level/load_level, delete actors tagged ACTOR_TAG, spawn, save")


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True)
    ap.add_argument("--only", default=",".join(PHASES))
    a = ap.parse_args(argv)
    scene_dir = pathlib.Path(a.scene)
    scene = json.loads((scene_dir / "scene.json").read_text())
    materials_json = islandale_plan.load_materials(scene, scene_dir)
    api_check.require(api_check.IMPORT_6G + api_check.IMPORT_6G_SOURCE, log)   # before anything is changed
    plan = islandale_plan.plan(scene, materials_json, scene_dir)
    todo = [p for p in a.only.split(",") if p]
    unknown = sorted(set(todo) - set(PHASES))
    if unknown:
        raise SystemExit(f"unknown phases {unknown}; choose from {PHASES}")
    for phase in PHASES:
        if phase in todo:
            log(f"phase {phase}")
            globals()[f"run_{phase}"](plan)


if __name__ == "__main__":
    main(sys.argv[1:])
