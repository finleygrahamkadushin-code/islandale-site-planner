# Phase 6, the rest: 6E to 6J

Status: **plan, waiting for Finley's OK** (Nov 6 2026, branch `claude/phase-6-rest-plan`). 6A–6D are done and merged (main 0209bd5, hosted home v12); their history and the export contract are in `PLAN-PHASE6.md`.

Written Nov 6, after 6D was signed off. It covers 6E to 6J: how they split into sessions and branches, in what order, and where each one stops for you.

## Three tracks, each in its own session and worktree

The tracks never touch the same files, so they can run side by side. Within a track the parts go one after another, because each builds on the last.

| Track | Parts, in order | Where the code goes | Session |
|---|---|---|---|
| **U · Unreal** | 6E → 6F → 6G | `tools/blender/` (`bake_textures.py`, `export_unreal.py`), `tools/unreal/` (new) | One session, worktree branch per part: `claude/phase-6e-bake`, `-6f-unreal-export`, `-6g-unreal-import` |
| **S · Sheets** | 6H → 6I | `src/export/sheets/` (a `site/` and a `section/` folder, plus a line each in `DrawingSheets.tsx`) | One session: `claude/phase-6h-site-sheet`, then `claude/phase-6i-sections` |
| **R · Render button** | 6J | `src/present/render/` (new), one button and one command (`src/ui/TopBar.tsx`, `src/layout/commands.ts`) | Its own session, started **after 6H is merged**, so the top bar and commands aren't edited by two tracks at once |

This session stays the **coordinator**. It starts the track sessions, reads their notes, and merges into `main` only when you say so. Notes between sessions go in the shared notes folder, not in the repo.

## When: the order of sittings

1. **Sitting 1 (now):**
   - Start Track U on 6E and Track S on 6H, side by side.
   - Each writes its part's plan into this file and **stops for your OK** (check-in A).
2. **Sitting 2:**
   - With your OK, both code their part.
   - 6E ends with a tiled preview of every baked material; 6H ends with a printed (PDF) site sheet. Both **stop for your review** (check-in B).
3. **Sitting 3:**
   - Merge whichever you sign off (check-in C), one at a time.
   - Track U goes on to 6F, Track S to 6I, and Track R starts 6J.
4. **Sittings 4 and on:** the same rhythm for 6F, 6I and 6J, then 6G last (the biggest part: the Unreal level).

**About 6 sittings in all**, if each part takes one.

## The check-ins (every part, every track)

| | When | What you get | Nothing goes on until you say |
|---|---|---|---|
| **A · Plan** | Before any code | The part's plan in this file: files, tests, decisions. A short summary in chat | "OK", or your changes |
| **B · Show** | Once it works | Renders, a tiled texture sheet, a printed sheet, a screenshot in UE, or a Render-button still: something to look at, not only test results | "Signed off", or notes (another round of B) |
| **C · Merge** | After B | What would merge, that `main` hasn't moved, and that the tests pass on the merge | "Merge" (and "push", and "republish" for app parts) |

- **Push:** each track session may push **its own branch** so the work is backed up on GitHub. Only you can say to push `main`.
- **Hosted home:** republished only after an app part (6H, 6I, 6J) is merged, and only when you say.
- **Something unexpected:** if a part needs a bigger change than its plan, a new dependency, or an edit outside its track's files, the session stops and asks.

## Each part in brief (its full plan comes at check-in A)

- **6E · Bake for Unreal** (`tools/blender/bake_textures.py`):
  - Bakes one 6 m seamless tile per material: BaseColor, ORM, Height and Normal, at 2048 px. It also writes `materials.json`.
  - Each map's seam is measured.
  - Check-in B: a contact sheet of every tile, shown 2 × 2.
  - The trees' new materials are included.
- **6F · Unreal scene export** (`tools/blender/export_unreal.py`):
  - Assembles the scene as `build_scene` does, with UV0 = UVMeters / 6, and exports one `.glb` per group (terrain, sea, earthworks, site, trees, each building). It also writes `scene.json`: sun, tide, cameras, axes, the wainscot and terrain blends.
  - It also fixes the **lantern corner seam** left from 6D: a straight mass's walls are welded into one mesh per building before export.
  - Check-in B: the files open in UE 5.8 with north and ground contact right.
- **6G · Unreal import** (`tools/unreal/import_islandale.py`):
  - Master materials, one instance per material, Nanite meshes, and the level with sky, sun, fog and the cameras. Safe to run twice.
  - The UE 5.8 Python API is checked against the installed engine, not guessed.
  - Its check-in A also settles whether Xcode's Metal toolchain is needed (see "What needs installing").
  - Check-in B: a screenshot from each camera.
- **6H · Site plan sheet:**
  - The lot, contours, buildings, walks, setback bands and the buffer line, with the 5E code-check and coverage notes, a north arrow and a scale bar, at true scale.
  - Check-in B: a PDF at 1" = 20' on Tabloid, with the 5E numbers matching the app.
- **6I · Section sheets:**
  - One long and one cross section per building, with the cut chosen on its plan sheet. They show floor, walls, roof, the cut ground and openings, with heights in NAVD88.
  - Check-in B: PDFs of every Scheme C building at 1/4" = 1'-0".
- **6J · Render button:**
  - `three-gpu-pathtracer` from the current camera or a saved view, with progress and Stop, saved as PNG. The live view stays as it is.
  - Check-in B: a Golden hour still of Scheme C rendered on your Mac in a few minutes.

## What I need from you along the way

- **At check-in A for each part:** OK the plans.
- **SketchUp:** open 6B's `.glb` in SketchUp when you can. It isn't installed here; if it can't open the file, 6B adds an `.obj` download.
- **6J:** say yes or no to adding `three-gpu-pathtracer`.
- **Installs:** an external SSD before 6E, and Xcode before 6G if Unreal asks for it (see "What needs installing").
- **Reference photos:** say whether your three reference photos should be kept somewhere (they're only in the old textures worktree's `build/`, which isn't in git).
- **GitHub Pages:** still open, and nothing is published until you ask.

## Phase 6 is done when

- The class deliverables come straight out of the app: plan, elevation, foundation, site and section sheets, PNG snapshots and Render-button stills.
- Blender renders (done) and an Unreal level of Scheme C come out of `tools/`.
- Everything is merged into `main`, and the hosted home carries the app parts.

## What needs installing (checked on this Mac, Nov 6)

The Mac is a MacBook Pro M4 Pro with 24 GB of memory, a 16-core GPU, macOS 15.7.9, and about 91 GB free.

| What | Needed for | On this Mac | Do |
|---|---|---|---|
| Node 24 + npm 11 | the app, the tests, `export_scene.mjs` | ✅ v24.22.0, npm 11.19.1 | nothing |
| Git + GitHub CLI | branches, pushes | ✅ git 2.39.5, gh 2.103.3 | nothing |
| Playwright's Chromium | e2e tests, the headless export | ✅ chromium 1248 | nothing (`npx playwright install chromium` if it goes missing) |
| The repo's npm packages | everything in `src/` | ✅ after `npm ci` | run `npm ci` in a new worktree; old worktrees had stale `node_modules` |
| Blender 5.2 LTS | 6E, 6F, the renders | ✅ 5.2.2 LTS | nothing; its own Python (with numpy) runs every script, so no separate Python install |
| Unreal Engine 5.8 | 6F's check, 6G | ✅ 5.8.4, with `UnrealEditor-Cmd` and the Python script plugin | **6G:** enable the Python Editor Script Plugin and Interchange in the project (both ship with the engine) |
| **Xcode + Metal toolchain** | 6G: Unreal compiles its Metal shaders with it | ❌ only the Command Line Tools; no `metal` compiler | **Probably needed before 6G.** Install Xcode from the App Store (~15 GB), open it once, then run `xcodebuild -downloadComponent MetalToolchain`. 6G's plan checks first whether UE 5.8 starts without it |
| `three-gpu-pathtracer` (npm) | 6J | ❌ not a dependency | **6J, with your OK:** `npm install three-gpu-pathtracer` (MIT licence) |
| SketchUp + a glTF importer extension | the last check of 6B | ❌ not installed | **Optional:** only if you want the `.glb` in SketchUp. Otherwise Blender and Twinmotion open it |
| Twinmotion 2026.2 | optional quick looks at the `.glb` | ✅ installed | nothing |
| **External SSD** (1–2 TB, USB-C / Thunderbolt) | `build/3d/`: bakes (a few GB), the Unreal project (tens of GB) | — | **Recommended before 6E–6G**; 91 GB free will run short. An SSD, not a USB stick (too slow and wears out). Keep the code on GitHub, never on the drive only |
