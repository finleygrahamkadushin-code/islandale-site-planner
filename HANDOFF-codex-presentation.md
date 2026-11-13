# Handoff to Codex: the Unreal track (6F, then 6G) before presentation day

Fri Nov 13, 2026. For Codex, working on Finley's Mac. Finley presents the Islandale site planner on **Sun Nov 15 (Mon Nov 16 at the latest)**, and wants an **Unreal walkthrough** of Scheme C in the talk. Your job is the Unreal track: **6F (export the scene for Unreal) and then 6G (import it into UE 5.8 as a level)**.

Claude sessions are finishing the web app at the same time (`src/`, `e2e/`, the plan documents). You and they never touch the same files. The overall schedule is in `PLAN-PRESENTATION.md`.

## Deadlines

| When | You deliver | Finley's check |
|---|---|---|
| Fri Nov 13, early afternoon | **6F plan** (check-in A): a short section in `PLAN-PHASE6-REST.md` under 6F: files, tests, the open questions | "OK" or changes |
| Fri Nov 13, evening | **6F working** (check-in B): the `.glb` files and `scene.json`, opened in UE 5.8, with a screenshot showing north and ground contact are right | "Signed off" |
| Sat Nov 14, 6 pm | **6G working** (check-in B): the level opens; one screenshot from each camera | "Signed off" |
| **Sat Nov 14, 8 pm** | **Go / fallback decision.** If 6G isn't producing a level, stop 6G and do fallback A (below) | Finley picks |
| **Sun Nov 15, noon** | **Freeze.** Everything committed on your branches, with a final report | Merge OK (a Claude session merges) |

Stop and wait at each check. Don't start 6G's code before 6F is signed off.

## Read first (only these)

1. `CLAUDE.md`: the project rules. They apply to you too: real units (metres inside, feet in the UI), NAVD88 elevations, one part per branch, small commits, keep things runnable.
2. `tools/blender/README.md`: the pipeline, its commands, the material contract, the gotchas.
3. `HANDOFF-blender-ue5.md`, section **3, "Unreal handoff"**: the spec for `export_unreal.py` and `import_islandale.py`. Ignore its 6E bullets (done).
4. `PLAN-PHASE6-REST.md`, "Each part in brief", 6F and 6G; and `PLAN-PHASE6.md`, the 6F and 6G rows.
5. `PLAN-6E.md`: what the bake wrote (`materials.json`, the four maps per set and their encodings).

Don't read `src/` beyond `src/export/model3d/` (the `.glb` and manifest contract) unless the export forces you to.

## Set up

```bash
cd /Users/finleygraham-kadushin/islandale-site-planner
git fetch
git worktree add ../islandale-codex-6f -b codex/phase-6f-unreal-export origin/main
cd ../islandale-codex-6f
npm ci
```

- **The baked textures (6E)** are 28 sets, 2.5 GB, and took hours. They live only in a worktree that isn't in git: `/Users/finleygraham-kadushin/islandale-site-planner/.claude/worktrees/max-height-county-code-e8e9f9/build/3d/unreal/textures/`. A copy is at `/Users/finleygraham-kadushin/islandale-site-planner/build/3d/unreal/textures/` (made Fri Nov 13; read from the copy). **Never move, rewrite or delete either one.** Take a textures-folder argument in your scripts rather than hard-coding a path.
- **Disk:** about 43 GB free. Keep exports and the UE project under your worktree's `build/` (gitignored), and report how big they get.
- A stopped agent left a scratch UE project at `.claude/worktrees/house-exterior-textures-3b6cc5/build/3d/unreal/IslandaleUE/`. Look at it, but make your own project under your worktree's `build/3d/unreal/`.

## Tools on this Mac

| Tool | Path / command |
|---|---|
| Blender 5.2.2 LTS (its own Python with numpy) | `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P <script> -- <args>` |
| Scene export from the app | `node tools/export/export_scene.mjs --port 5199` (starts its own dev server). **Always pass `--port 5199`**: Claude sessions use 5173–5197 for their own servers |
| Export checker | `Blender … -P tools/blender/check_export.py -- --glb build/3d/export/c-prow-lantern.glb` |
| Scene builder (what 6F assembles from) | `tools/blender/build_scene.py`, the `islandale3d` package |
| Unreal Engine 5.8.4 | `/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor` (GUI) and `UnrealEditor-Cmd` (headless, `-run=pythonscript -script=…`) |
| Xcode Metal toolchain | installed; Unreal compiles Metal shaders with it. The first project open can take a long time |

## 6F · Unreal scene export (branch `codex/phase-6f-unreal-export`)

Write `tools/blender/export_unreal.py` (Blender, headless):

- Assemble the scene the way `build_scene.py` does, from the app's export (`build/3d/export/*.glb` plus its manifest), Scheme C.
- Set UV0 = UVMeters / 6, so one UV unit is one 6 m baked tile.
- Export **one `.glb` per group**: terrain, sea, earthworks, site, trees, and one per building.
- **Weld each straight mass's walls into one mesh per building** before export. This fixes the "lantern corner seam" left from 6D.
- Write `scene.json`: the sun's azimuth and elevation, the tide, the hero cameras, the axis conventions (Blender Z-up metres to UE Z-up centimetres, and which way is north), the wainscot blend (`below_world_z`) and the terrain blend (`z_smoothstep`), and for each mesh which material key it wears.
- Tests in `tools/blender/tests/` (numpy-only first, then a small Blender run), in the style of `test_bake_numpy.py`: the UV scale, the weld (no duplicate verts on the lantern corner), `scene.json`'s fields, and one file per group.
- **Done when:** the files import into UE 5.8, with the buildings sitting on the ground, north the right way, and the scale right (a 6 m tile is 600 UE units). Show it with a screenshot.

## 6G · Unreal import (branch `codex/phase-6g-unreal-import`, cut from 6F's branch after sign-off)

Write `tools/unreal/import_islandale.py` (UE editor Python) and a `tools/unreal/README.md` with the commands:

- **Textures:** BaseColor sRGB; ORM and Height linear; Normal as a normal map (DirectX green-down, as 6E wrote them).
- **Materials:** a master material (Nanite tessellation displacement only if 5.8 supports it from Python, otherwise plain); glass and water masters; a layered world-Z blend master for the wainscot and terrain; one material instance per key from `materials.json`.
- **Meshes:** Interchange import with Nanite on.
- **Level** `/Game/Islandale/Maps/Islandale`: SkyAtmosphere, a DirectionalLight from `scene.json`'s sun, SkyLight, ExponentialHeightFog, a PostProcessVolume, and a CineCameraActor per hero camera. Add a **simple camera path** (a Level Sequence through the hero cameras): this is what Finley will play on the day.
- **Safe to run twice:** a second run updates the assets instead of duplicating them.
- **Check the 5.8 Python API against the installed engine** (`unreal` module help, or the engine's Python stubs), never from memory. Run headless with `UnrealEditor-Cmd … -run=pythonscript`, time-boxed. If headless is blocked, write down the in-editor steps.
- **Done when:** the level opens and there's a screenshot from each camera.

## Fallback A (if 6G isn't working by Sat 8 pm)

Stop 6G and make something that walks:

1. Drag 6F's `.glb` files into a fresh UE 5.8 project (Interchange, Nanite on).
2. Add a DirectionalLight with the sun angles from `scene.json`, plus SkyAtmosphere, SkyLight and fog.
3. Give the main materials their baked BaseColor and Normal by hand where the import missed them.
4. Make one Level Sequence that flies through the hero cameras.
5. Write the steps into `tools/unreal/README.md`, so the scripted version can pick up after the presentation.

If 6F itself slips, say so straight away. Then Finley falls back to the Blender renders (already signed off) and a planner fly-through, and nothing more is needed from you.

## Rules

- **Your files only:** `tools/blender/export_unreal.py`, `tools/blender/tests/`, `tools/unreal/`, a 6F/6G section in `PLAN-PHASE6-REST.md`, and `HANDOFF-blender-ue5.md` if a fact there is wrong. Small additions to `tools/blender/islandale3d/` are fine if 6F needs them; say so in the commit message. **Don't edit `src/`, `e2e/`, `PLAN.md`, `PLAN-REVIEW-FIXES.md` or `PLAN-PRESENTATION.md`**: Claude sessions are editing those.
- **Never touch the root checkout** (`/Users/finleygraham-kadushin/islandale-site-planner` itself): other sessions use it. Work only in your worktree.
- **Git:** conventional commits (`feat(unreal): …`, `test(blender): …`, `fix(blender): …`), small, with no attribution lines. **Never use bare `git stash`**: the stash is shared with other sessions. You may push **your own branches** to `origin` as a backup. Never push or merge `main`; a Claude session merges after Finley's OK.
- **Something unexpected** (a bigger change than the plan, a new dependency, an edit outside your files): stop and ask Finley.
- **Long jobs** (a full export, a headless UE run, a shader compile): run them in the background with a time limit, and log to a file under `build/`.
- **Don't regenerate the 6E bake.** If a set is missing or broken, report it, and bake only that set with `--keys`.

## Report at each check

- What works, with the screenshot or file to look at.
- The commands to reproduce it, from the worktree root.
- What isn't done or wasn't checked.
- Sizes of the exports and the UE project.
- Anything in this handoff that turned out wrong.
