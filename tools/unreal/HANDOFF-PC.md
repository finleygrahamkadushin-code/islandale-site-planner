# Islandale in Unreal on the PC: start here

This brief is for a fresh Claude Code session on Finley's Windows PC (RTX 5090), with no other context. Unreal does all the Unreal work and rendering for the Islandale project on this PC, because Unreal crashes on the Mac where everything else is made.

**What Islandale is:** a site planner app for one waterfront lot. Scheme C ("C · Prow & Lantern") has four cabins: the Gathering prow, the Family lantern, the Family twin pod and the Elders' wedge. The Mac exports the scene from Blender as a **bundle**:
- one `.glb` per group (terrain, sea, earthworks, site, trees, each cabin);
- `scene.json` (sun, tide, cameras, materials, blends);
- the baked 6 m seamless textures with `materials.json`.

Your job is phase **6G**: a polished Unreal level of Scheme C. The deadline is **Nov 19, 2026**.

## 1. Install and check first

1. **Unreal Engine 5.8.x** from the Epic Games launcher. The Mac had 5.8.4. Any 5.8 patch should do, but say which one you have.
2. **Git**, and this repo: `git clone https://github.com/<Finley's GitHub>/islandale-site-planner` (ask Finley for the URL), then `git checkout scheme-c-only`. All the Unreal scripts are in `tools/unreal/`. You need no Node, npm or Blender here, and no Python beyond the editor's own.
3. **The bundle** (about 2.7 GB, from the USB drive): copy its folder (the one holding `scene\`, `textures\` and `README.md`) to `build\3d\unreal\` inside the repo, so `build\3d\unreal\scene\scene.json` exists. (`build\` is ignored by git.) Elsewhere is fine too: pass the folder to the launcher, or set `ISLANDALE_BUNDLE`.
4. **The project:** `tools\unreal\run_islandale_pc.bat` makes one at `%USERPROFILE%\Documents\IslandaleUE` from `tools\unreal\project_template\` on its first run, with these turned on:
   - plugins: Python Editor Script Plugin, Editor Scripting Utilities, Interchange, Movie Render Queue;
   - rendering: Lumen, Nanite, Virtual Shadow Maps, hardware ray tracing on DirectX 12.

   To use your own project instead, enable those plugins and set `ISLANDALE_PROJECT`.

## 2. Commands, in order

1. **Check the bundle in Unreal** (the 6F check, already passed in Blender on the Mac, never yet on Windows). Either:
   - `tools\unreal\run_islandale_pc.bat` (double-click, or run it in a terminal);
   - or `"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe" "%USERPROFILE%\Documents\IslandaleUE\IslandaleUE.uproject" -unattended -nosplash -ExecutePythonScript="<repo>\tools\unreal\pc_run.py"`.

   It runs in three steps:
   1. it checks the bundle;
   2. **it self-checks Unreal**: every Python class and function the scripts use is looked up first, and any missing one is named in the log before anything changes;
   3. it imports the 9 `.glb` files, builds a check level, checks bounds, north, ground and tide, and saves a screenshot from above and from each of the 9 cameras.

   Results go in `<bundle>\pc-runs\<date-time>\`: `run_log.txt` in plain words, `check.json` and the PNGs. The first run compiles shaders for a long while, perhaps 10–40 minutes.
2. **Read `run_log.txt`.** It ends `ALL CHECKS PASSED` or names what failed and in which step. If the self-check listed missing 6G names, plan around them before step 3.
3. **Build the level (6G):** write `tools/unreal/import_islandale.py`. Today it is a skeleton: its five phases are laid out, it self-checks first, and its plan comes from `tools/unreal/islandale_plan.py`, which is pure Python and tested. Read `PLAN-6G.md` first. It has:
   - the phases;
   - every Unreal API with how it was confirmed (and which were not);
   - the displacement route (`MaterialExpressionMakeMaterialAttributes`, because the material's Displacement pin is hidden from Python);
   - the axes;
   - the lighting lessons.

   Run the asset phases in the commandlet (`UnrealEditor-Cmd.exe … -run=pythonscript -script="…"`) and the level phase in the editor (`-ExecutePythonScript`). The commandlet cannot place actors.
4. Keep `pc_run.py` working: when 6G's importer exists, add it as a step there, so Finley can run the whole thing by double-click.

**Axes:** Unreal = (100x, −100y, 100z) cm from Blender. +X is east, +Y south (north is −Y), Z up, in NAVD88 metres × 100. Put every mesh at the origin with no rotation; the vertices are already in site coordinates. Each sun and camera rotation in `scene.json` is already an Unreal rotator (degrees).

## 3. What done looks like for 6G

- `/Game/Islandale/Maps/Islandale` opens.
- Every mesh is there, with every material slot bound to its instance (`MI_<slot>`): no grey or default materials.
- Sky: SkyAtmosphere and a SkyLight with real-time capture.
- Sun: a DirectionalLight at `scene.json`'s rotation, marked as the atmosphere sun.
- ExponentialHeightFog, a PostProcessVolume with fixed exposure, and the 9 CineCameraActors from `scene.json`.
- The import is safe to run twice.
- One still per camera plus a top-down view, rendered on the 5090 (Movie Render Queue; the Path Tracer is welcome for finals). Shadow sides must not be black; the scene captures in the 6F check were.

## 4. What to send back to the Mac

Copy back on the USB drive, or commit and push a branch if Finley says so:
- the `pc-runs\<date-time>\` folder (log, `check.json`, screenshots);
- the 6G stills;
- the Unreal version you used;
- the self-check's list of missing names, if any;
- any changes to `tools/unreal/` on a branch cut from `scheme-c-only` (for example `claude/phase-6g-unreal-import`), with small commits. Never push or merge `scheme-c-only` or `main` without Finley's say.
