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
  buildings/    cabin generator, roofs, walls, openings, decks, stairs, rails
  scene/        lights, materials, display styles, cameras, post-processing
  ui/           toolbar, inspector, layers panel, tooltips, tour
  tools/        select, move, rotate, measure, place, paint
  export/       images, PDF sheets, glTF
data/islandale/ terrain grid, parcel, schemes A–D (JSON)
legacy/         the old planner and its patch scripts (read-only reference)
```

## The old planner (`legacy/islandale-planner.html`)

One self-contained file (three.js r128, no build step), ~15k lines with data lines of 60k characters (`GRID`, `PARCEL`), so never `cat` or plain-grep it. Use `tools/map.sh`, which clips long lines: `tools/map.sh` (outline of every section marker), `tools/map.sh def NAME`, `tools/map.sh find PATTERN`, `tools/map.sh at LINE [N]`. Sections are marked `// ---------- name ----------` (base app) and `/* ==== ext:name ==== */` (later blocks near the end).

- Small edits: write `[[old, new], ...]` JSON to the scratchpad and run `python3 legacy/tools/patch.py edits.json`; each `old` must match exactly once, or nothing is written.
- `legacy/tools/gathering_prow.py` rebuilds scheme C's Gathering prow (and C2–C4) from the imported original (`git show 0fdabcd:index.html`) and overwrites the old planner, so any other change since that commit is lost unless it is also in the script.
