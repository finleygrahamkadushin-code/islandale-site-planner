# Islandale Site Planner — working rules

Read `PLAN.md` first. We are rebuilding the planner as a Vite + TypeScript + React Three Fiber app, Islandale only for now. The old single-file planner lives at `legacy/islandale-planner.html` for reference and data extraction. Edit it only through appended `ext:` blocks at the end of the file (Phase 3C: `ext:autosave`, `ext:openings-fit`), each recorded in `PLAN.md` under "Deliberate changes from the legacy file"; never change its earlier code in place.

## Rules

- The plan is data in the store; the scene only draws from it. No feature edits another feature's objects directly.
- Every new action is undoable and respects locks.
- Use real units: feet and inches in the UI, metres internally, NAVD88 elevations.
- New shaders and effects in TSL so the WebGPU switch is painless.
- One phase per branch; commit small; keep the app runnable after every commit.
- When porting a feature, compare against the legacy file's behaviour and note any deliberate change in `PLAN.md` under "Deliberate changes from the legacy file".
- Work one phase at a time. Before coding a phase, state the plan in a few lines and wait for an OK. After each phase, run the app, check it in the browser, and commit.
- Don't start a phase until the one before passes its done-when check (table in `PLAN.md`, "Build order").

## Layout

```
src/
  app/          home, layout, routing
  store/        plan data, undo/redo, selection, locks, visibility
  site/         terrain, parcel, setbacks, tide, sun (Islandale data lives here)
  buildings/    one feature: core model at the top (masses, footprint, outline, organic, geom, slab, BuildingMesh),
                then walls/ roofs/ openings/ rails/ stairs/ decks/ foundation/ paint/ parts/, each holding
                its maths, its 3D meshes and its panels, with tests beside the files
  scene/        lights, materials, display styles, cameras, post-processing; shared scene plumbing only
  ui/           toolbar, inspector, layers panel, tooltips, tour
  tools/        select, move, rotate, measure, place, paint
  export/       images, PDF sheets, glTF
data/islandale/ terrain grid, parcel, schemes A–D (JSON)
legacy/         the old planner and its patch scripts (read-only reference)
```

## Where to look (read only the section a task needs)

Don't read the whole codebase for a change. Find the section below, open its `CLAUDE.md` map if it has one, and open only the files that map names. Cross into another section only when the map's "Talks to" says the change does.

| Task is about… | Go to | Map |
|---|---|---|
| Cabins, decks, porches, stairs, ramps, rails, roofs, walls, openings, supports, paint | `src/buildings/` | `src/buildings/CLAUDE.md` |
| Terrain, parcel, contours, tide, sun, earthworks, pools, schemes, site objects | `src/site/` | `src/site/CLAUDE.md` |
| Walks, path pieces, accessible routes, junctions, levels, connect | `src/paths/` | `src/paths/CLAUDE.md` |
| Rooms, furniture, interior plan editor | `src/interiors/` | `src/interiors/CLAUDE.md` |
| Drawing sheets (plans, elevations, foundation, tables) | `src/export/sheets/` (+ `ui/sheets/`, `ui/DrawingSheets`, `scene/sheetCapture`, `sheetTarget`, `ElevationCapture`) | not yet |
| Plan data, undo, saving, locks, autosave, the plan file | `src/store/`, `src/export/planFile.ts` | not yet |
| Cameras, lights, display styles, effects, selection and drag gizmos, labels | `src/scene/` (shared) | not yet |
| Top bar, side panel, inspector shell, layers, history, shortcuts | `src/ui/` (shared) | not yet |
| Blender and Unreal export | `tools/export/`, `tools/blender/` (only on the `house-exterior-textures-3b6cc5` worktree for now) | `HANDOFF-blender-ue5.md` |

A section marked "not yet" still has some of its files in `scene/` and `ui/`. When it is reorganised the way `buildings/` was, it gets its own `CLAUDE.md` map and its row here changes.

Organise by feature, not by layer: a feature's maths, meshes, panels and tests live together in its own folder (`buildings/`, `paths/`, `site/` and `interiors/` are done; export follows). `store/` stays the core: the plan store, undo, saving, locks, and the action slices it is built from. Move files with `node tools/move-modules.mjs moves.json [--dry]`, which `git mv`s them and rewrites every relative import. Never give two files in one folder names that differ only in case (`Foundation.tsx` and `foundation.ts`), because macOS disks treat them as the same name.

## The old planner (`legacy/islandale-planner.html`)

One self-contained file (three.js r128, no build step), ~15k lines with data lines of 60k characters (`GRID`, `PARCEL`), so never `cat` or plain-grep it. Use `tools/map.sh`, which clips long lines: `tools/map.sh` (outline of every section marker), `tools/map.sh def NAME`, `tools/map.sh find PATTERN`, `tools/map.sh at LINE [N]`. Sections are marked `// ---------- name ----------` (base app) and `/* ==== ext:name ==== */` (later blocks near the end).

- Small edits: write `[[old, new], ...]` JSON to the scratchpad and run `python3 legacy/tools/patch.py edits.json`; each `old` must match exactly once, or nothing is written.
- `legacy/tools/gathering_prow.py` rebuilds scheme C's Gathering prow (and C2–C4) from the imported original (`git show 0fdabcd:index.html`) and overwrites the old planner, so any other change since that commit is lost unless it is also in the script.
