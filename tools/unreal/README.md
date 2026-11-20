# Unreal tools

Scripts that run inside Unreal Engine 5.8 (the editor's Python), fed by `tools/blender/export_unreal.py` (6F). Plans: `PLAN-6F.md`, `PLAN-6G.md`. **All Unreal work happens on Finley's Windows PC** (Unreal crashes on the Mac): start at `HANDOFF-PC.md`.

```
build/3d/unreal/textures/   6E: one seamless 6 m tile per material + materials.json
build/3d/unreal/scene/      6F: <group>.glb (one static mesh each, in site coordinates) + scene.json
```

| File | What it does |
|---|---|
| `dump_api.py` | Records which `unreal.*` names exist in the installed engine, with their docstrings, so every call is checked rather than guessed. `-script="tools/unreal/dump_api.py <out.json> [names.txt]"` |
| `check_6f.py` | 6F's check-in B in a throwaway project: imports every `.glb`, checks bounds, north, ground contact and the tide, and captures a top-down view and every scene.json camera to PNG |
| `islandale_plan.py` | 6G's plan (textures, masters, instances, meshes, level actors) worked out from scene.json and materials.json. Pure Python; `python3 tools/unreal/islandale_plan.py <scene.json>` prints it |
| `import_islandale.py` | 6G's importer. **Skeleton**: the phases are laid out; their Unreal calls come in 6G |
| `tests/test_plan.py` | Tests of the plan: `python3 tools/unreal/tests/test_plan.py` |
| `api_check.py` | The self-check every script runs first: the Unreal names it needs, looked up before anything is changed; a missing one is named |
| `pc_run.py` | The one-command run on the PC (inside the editor, no arguments): checks the bundle, self-checks, imports, checks, takes the screenshots, and logs each step in plain words to `<bundle>/pc-runs/<date-time>/run_log.txt` |
| `run_islandale_pc.bat` | Double-click on Windows: makes the project from `project_template/` and starts the editor with `pc_run.py` |
| `project_template/` | The Unreal project: plugins and rendering settings (Lumen, Nanite, VSM, hardware ray tracing, DirectX 12) |
| `HANDOFF-PC.md` | The brief for a Claude session on the PC |

Run a script with the editor's commandlet (no window):

```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" /path/To/Project.uproject \
    -run=pythonscript -unattended -nosplash -script="tools/unreal/<script>.py <args>"
```

The project must enable the Python Editor Script Plugin and Editor Scripting Utilities; Interchange is on by default.

**Axes:** Unreal = (100x, −100y, 100z) cm from Blender: +X east, +Y south (north is −Y), Z up (NAVD88 × 100). This is Blender's glTF exporter (x, z, −y) followed by Interchange's `ConvertVec3` (x, z, y) and ×100, both read from the installed sources.
