# Islandale Site Planner (live single-file planner)

This branch is the live planner: one self-contained `index.html` (three.js r128 from cdnjs, no build step; open it in a browser).
The Vite + TypeScript rebuild lives on the `phase-*` branches with its own `CLAUDE.md` and `PLAN.md`; don't mix the two.

## Finding things in index.html

It is ~15k lines, and some lines are 60k characters of data (`GRID`, `PARCEL` near line 686), so never `cat` or plain-grep it.
Use `tools/map.sh`, which clips long lines:

- `tools/map.sh` — outline: every section marker with its line number (start here)
- `tools/map.sh def NAME` — where a function / const / class is defined
- `tools/map.sh find PATTERN` — regex search
- `tools/map.sh at LINE [N]` — read N lines from LINE

Sections are marked `// ---------- name ----------` (base app) and `/* ==== ext:name ==== */` (later feature blocks, appended
near the end; matching CSS is in the `<style>` block at the top). Rough order: terrain & earthworks → objects & building
form (roofs, supports, rails, footprints, prow, curved steps) → UI (undo, modes, inspector, views, save/load, plan sheet)
→ interiors (`INT.editor`, `INT.plan`, `INT.walk`) → compound schemes (Architecture Project #2) → code check → `ext:` blocks
→ boot.

## Editing

- Small changes: write `[[old, new], ...]` JSON to the scratchpad and run `python3 tools/patch.py edits.json`. Each `old`
  must match exactly once, or nothing is written.
- `tools/gathering_prow.py` rebuilds scheme C's Gathering prow (and variants C2–C4) from the imported original
  (`git show 0fdabcd:index.html`) and overwrites `index.html`. Any other change made since that commit is lost unless it is
  also in the script, so change the prow by editing the script's constants, not `index.html`.

## Conventions

- Units: metres internally (`FT = 0.3048`), feet and inches in the UI. World axes: x east, n north; building-local +z faces
  the front (toward Mud Bay).
- Building code references are IRC as adopted in WA, ADA 2010 for walking routes; keep schemes C/G under 1,600 sq ft.
- Saves go to `localStorage` key `islandale-layout`.
- Commits: `feat: ...` / `fix: ...` with a plain-language subject saying what changed on the site.
