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
  app/          the app shell (App.tsx, styles)
  store/        shared core: plan data, undo/redo, selection, locks, saving, and the action slices
  buildings/    feature (map inside): walls/ roofs/ openings/ rails/ stairs/ decks/ foundation/ paint/ parts/
  site/         feature (map inside): the lot at the top, then earthworks/ objects/ environment/
  paths/        feature (map inside): path pieces at the top, then connect/ route/ junctions/
  interiors/    feature (map inside): the floor-plan model at the top, then editor/ furniture/ scene3d/
  tools/        feature (map inside): tool strip, object library, place, drag, snap, duplicate, measure, box select, align
  layout/       feature (map inside): task tabs, bottom bar, command search, shortcuts sheet, view keys
  guide/        feature (map inside): Beginner / Advanced mode, the shared tooltip, glossary words, the confirm dialog, the first-run tour
  export/       planFile.ts (plan download) and sheets/, a feature (map inside): model/ plan/ foundation/ elevation/ tables/
  scene/        shared 3D plumbing only: Scene, cameras, effects, gizmos, labels, chips, surfaces, display styles
  ui/           shared UI only: top bar, side panel, inspector shell, layers, history, fields, shortcuts
data/islandale/ terrain grid, parcel, schemes (JSON, extracted from the old planner)
legacy/         the old planner and its patch scripts (read-only reference)
tools/          map.sh (search the old planner), move-modules.mjs (move files and rewrite imports)
```

## Where to look (read only the section a task needs)

Don't read the whole codebase for a change. Find the section below, open its `CLAUDE.md` map if it has one, and open only the files that map names. Cross into another section only when the map's "Talks to" says the change does.

| Task is about… | Go to | Map |
|---|---|---|
| Cabins, decks, porches, stairs, ramps, rails, roofs, walls, openings, supports, paint | `src/buildings/` | `src/buildings/CLAUDE.md` |
| Terrain, parcel, contours, tide, sun, earthworks, pools, schemes, site objects | `src/site/` | `src/site/CLAUDE.md` |
| Walks, path pieces, accessible routes, junctions, levels, connect | `src/paths/` | `src/paths/CLAUDE.md` |
| Rooms, furniture, interior plan editor | `src/interiors/` | `src/interiors/CLAUDE.md` |
| Drawing sheets (plans, elevations, foundation, tables) | `src/export/sheets/` | `src/export/sheets/CLAUDE.md` |
| Tool strip, object library, placing, dragging, snapping, duplicate, Q / E / R turns, measuring, box select, align | `src/tools/` | `src/tools/CLAUDE.md` |
| Task tabs, which panels each tab shows, bottom bar, command search, shortcuts sheet, view keys | `src/layout/` | `src/layout/CLAUDE.md` |
| Beginner / Advanced, what Beginner hides, tooltips, glossary words, delete confirmation, the first-run tour | `src/guide/` | `src/guide/CLAUDE.md` |
| Plan data, undo, saving, locks, autosave, the plan file | `src/store/`, `src/export/planFile.ts` | (shared core, no map) |
| Cameras, lights, display styles, effects, selection and drag gizmos, labels, chips, surface textures | `src/scene/` | (shared, no map) |
| Top bar, side panel, inspector shell, layers, history, shortcuts, feet-and-inches fields | `src/ui/` | (shared, no map) |
| Blender and Unreal export | `tools/export/`, `tools/blender/` (only on the `house-exterior-textures-3b6cc5` worktree for now) | `HANDOFF-blender-ue5.md` |

`scene/`, `ui/` and `store/` hold only what several sections share. Most tasks never need them beyond the files a section map names.

Organise by feature, not by layer: a feature's maths, meshes, panels and tests live together in its own folder (`buildings/`, `paths/`, `site/`, `interiors/`, `export/sheets/`, `tools/` and `layout/` each have one, with a map). `store/` stays the core: the plan store, undo, saving, locks, and the action slices it is built from. Move files with `node tools/move-modules.mjs moves.json [--dry]`, which `git mv`s them and rewrites every relative import. Never give two files in one folder names that differ only in case (`Foundation.tsx` and `foundation.ts`), because macOS disks treat them as the same name.

## The old planner (`legacy/islandale-planner.html`)

One self-contained file (three.js r128, no build step), ~15k lines with data lines of 60k characters (`GRID`, `PARCEL`), so never `cat` or plain-grep it. Use `tools/map.sh`, which clips long lines: `tools/map.sh` (outline of every section marker), `tools/map.sh def NAME`, `tools/map.sh find PATTERN`, `tools/map.sh at LINE [N]`. Sections are marked `// ---------- name ----------` (base app) and `/* ==== ext:name ==== */` (later blocks near the end).

- Small edits: write `[[old, new], ...]` JSON to the scratchpad and run `python3 legacy/tools/patch.py edits.json`; each `old` must match exactly once, or nothing is written.
- `legacy/tools/gathering_prow.py` rebuilds scheme C's Gathering prow (and C2–C4) from the imported original (`git show 0fdabcd:index.html`) and overwrites the old planner, so any other change since that commit is lost unless it is also in the script.
