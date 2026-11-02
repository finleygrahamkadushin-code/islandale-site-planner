# Drawing sheets: handoff plan

Status: **work in progress, committed on branch `drawing-sheets`** (cut from `phase-5a-parts-rails`). Typecheck is clean and all 554 unit tests pass. Not merged; no e2e spec yet.

Finley needs to draw each building by hand at 1/4" = 1'-0" for class. The **Sheets** button in the top bar opens a full-screen "Drawing sheets" view with:

- **Floor plan** per building, a vector SVG at true scale:
  - every straight edge dimensioned, plus curves with radius, sweep and arc length
  - openings tagged (D1, W1 …) and chain-dimensioned along their walls; door swings
  - stairs with nosings and a DN arrow, sitting-step bands, dashed roof eaves
  - a 1 ft grid, a datum mark at the main walls' back-left corner, numbered corners
  - overall sizes measured from the parts (roof and step extents are labelled separately)
  - north arrow, tiling across pages with alignment marks
- **Four elevations** per building, rendered from the live 3D scene as a black-on-white line drawing at true scale, with:
  - grade line
  - level lines (floor, eaves, ridges, with NAVD88)
  - a height dimension chain, and a width chain per part
- **Measurement tables:** parts, edges, curves, openings, stairs, levels and corner coordinates from the datum, plus a CSV download.
- **Paper, scale and print:** paper Letter, Tabloid, Arch C or Arch D; scale 1/8", 1/4" or 1/2"; Print, with `@page` set to the paper and a 1-inch check bar on every sheet.

## Where the code is

| Area | Files |
| --- | --- |
| Contract (types, paper sizes, scales) | `src/export/sheets/types.ts`, `sides.ts` (elevation axes) |
| Pure model | `src/export/sheets/model.ts`, `parts.ts`, `openings.ts`, `elevation.ts`, `arcs.ts` (circle fitting), `format.ts` (architectural ft-in), `tiles.ts`, `table.ts` |
| Elevation renderer | `src/scene/sheetCapture.ts` (API, camera maths), `src/scene/ElevationCapture.tsx` (inside the Canvas; restores the scene after every capture) |
| Screen | `src/ui/DrawingSheets.tsx`, `src/ui/sheets/*` (`Page`, `PlanSheet`, `planLayout`, `planMarks`, `planDims`, `svgDims`, `ElevationSheet`, `MeasureTables`) |
| Also touched | `src/scene/Scene.tsx` (mounts the capture), `src/ui/TopBar.tsx` (Sheets button), and the end of `src/app/styles.css` (Drawing sheets section and print CSS) |

The capture file is `ElevationCapture.tsx`, not `SheetCapture.tsx`. This disk ignores letter case, so that name would clash with `sheetCapture.ts`.

## Still to do (in this order)

1. **Scrolling:** wide pages are cut off on the left and can't be scrolled to. In `.sheets-pages`, use `align-items: safe center` (or `margin-inline: auto` with `flex-start`).
2. **Focus trap:** while the overlay is open, set `inert` on `#root` and restore it on close. Add `aria-modal="true"`, focus "Back to the planner" on open, and return focus to the Sheets button on close.
3. **CSV in Excel:** start the file with a `﻿` BOM and use `type: 'text/csv;charset=utf-8'`. Revoke the object URL on a later tick.
4. **Checkbox labels:** the toolbar checkboxes are announced as "on". Label them Plan, Elevations, Measurements and Grid.
5. **Paper-fit hint:** in the toolbar, show how many pages the plan and elevations take on the chosen paper. Also name the smallest paper that fits each plan on one page (`tileDrawing`/`pageFeet`). Scheme C's prow needs 2 Arch C pages because of the sitting steps.
6. **Smaller fixes:**
   - disable Print while elevations are still drawing
   - retry a failed capture once, then show a "Try again" button
   - DN or slope arrows for ramps and single-nosing stairs
   - keep the capture under about 256 MB of GPU memory (drop MSAA or lower px/ft for huge images)
   - Escape closes the overlay even when a toolbar select has focus
7. **e2e spec** `e2e/sheets.spec.ts`. Read the conventions in `e2e/parts.spec.ts` and `e2e/fresh.ts`. The webServer runs on port 5174. Cover:
   - the dialog opens, and on C-0 the plan SVG's width in inches equals its viewBox width × 0.25
   - the "1 in" bar is 96 px wide
   - Delete and the arrow keys don't change the plan while the sheets are open
   - Escape closes the sheets and returns focus
   - all four elevations finish with `data:image/png`, and `window.islandale.sceneStats()` is the same before and after
   - in print media, `.app` and the toolbar are hidden
   - the CSV starts with a BOM and contains "Gathering prow" and "W6"
8. **Check it in the browser:**
   - Scheme C on Tabloid and on Arch C
   - one curved scheme (D) and one other (A)
   - print preview at 100%
   - measure the 1-inch bar
9. **Docs:** add to `PLAN.md`:
   - an order-change note, since drawing sheets are Phase 6 work brought forward at Finley's request, the way the Oct 29 change was recorded
   - a "Deliberate changes from the legacy file" entry: the sheets replace the old planner's site-plan, floor-plan and elevation sheets with true-scale plans, rendered elevations and tables
10. **Finish:** commit with a `feat(export): …` message in the repo's style, then merge or PR into the line of work Finley chooses. Nothing has been pushed.

Known limits:
- Curved footprints (ellipse, kidney, teardrop, blob, ribbon) are still drawn as their box until Phase 5D. The model marks them `approximate`, and they'll come out right once 5D lands, because the sheets read the same geometry.
- Interiors (rooms) aren't in the new app yet (Phase 5B).

## How to run

```bash
cd /Users/finleygraham-kadushin/islandale-site-planner/.claude/worktrees/running-the-project-068f5a
npm run dev        # http://localhost:5173 (or set PORT); click Sheets in the top bar
npm run typecheck && npx vitest run
npx playwright test e2e/sheets.spec.ts
```

`node_modules` there is a symlink to the main checkout's. Set `ISLANDALE_PLAN_DIR` to a scratch folder when testing, so autosave doesn't write `data/plans/islandale.plan.json`.

## The bigger picture (Finley's goal: "done done")

- **Phase 5D:** a separate Claude session ("Phase 5D: shapes, roofs, finishes, earthworks") was started for it. Finley's instruction to it: **fix everything in 5A, 5B and 5C, then finish 5D**. Its branch should be cut from `phase-5a-parts-rails`, not from the old single-file branch.
- **Agreed order** (`PLAN.md`, Oct 29 change): 5A → 5B (interiors) → 5C → 5D, then Phase 4 with 5E folded in, then 5F, then Phase 6.
- **Status:** 5A, on `phase-5a-parts-rails`, is still marked in progress in `PLAN-PHASE5.md`.
- **Project rules** (`CLAUDE.md`):
  - one phase per branch
  - state each phase's plan and get Finley's OK before coding
  - commit small and keep the app runnable
  - record deliberate changes from the legacy file in `PLAN.md`
- **Uncommitted work in the main checkout:** on `phase-5a-parts-rails` there is an autosaved `data/plans/islandale.plan.json` and an untracked `e2e/chips.spec.ts`. Don't discard either without asking.

### Prompt for a new chat

> Read `CLAUDE.md`, `PLAN.md` and `PLAN-DRAWING-SHEETS.md`. Check out branch `drawing-sheets` (worktree `.claude/worktrees/running-the-project-068f5a`) and finish the "Still to do" list in `PLAN-DRAWING-SHEETS.md` in order. Check each step in the browser, then commit. When the sheets are done, check on the Phase 5D session's progress (5A–5C fixes, then 5D) and help finish whatever is left.
