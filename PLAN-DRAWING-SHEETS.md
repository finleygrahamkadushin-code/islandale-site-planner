# Drawing sheets: handoff plan

Status: **done, pending Finley's choice of where to merge.** Built on `drawing-sheets` (cut from `phase-5a-parts-rails`) and finished on `claude/plan-drawing-sheets-6d562f`. Typecheck is clean, all 556 unit tests pass, and `e2e/sheets.spec.ts` passes (6 tests). Nothing has been pushed.

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

## Finished (Nov 2 2026)

1. **Scrolling:** pages wider than the window scroll to their left edge (`margin-inline: auto` on a `flex-start` column; checked in the browser).
2. **Modal:** `#root` is `inert` while the sheets are open, the dialog has `aria-modal="true"`, "Back to the planner" takes the focus on open, and the Sheets button gets it back on close.
3. **CSV in Excel:** the file starts with a UTF-8 byte-order mark, its type is `text/csv;charset=utf-8`, and the object URL is revoked on a later tick.
4. **Checkbox labels:** Plan, Elevations, Measurements and Grid are announced by name.
5. **Paper fit:** the toolbar says how many pages the plan and elevations take on the chosen paper, and the smallest paper that fits each plan on one page (`smallestPaper` in `tiles.ts`). Scheme C's prow plan takes 2 Arch C pages and fits one Arch D.
6. **Smaller fixes:** Print waits ("Drawing elevations…") until every elevation has finished or failed. A failed capture is retried once, then shows a "Try again" button (hidden in print). Escape closes from anywhere, a toolbar select included. The ramp and stair arrows and the 256 MB capture budget (`imagePlan`) were already in place.
7. **e2e:** `e2e/sheets.spec.ts` covers true scale, the 96 px inch bar, the inert planner, Escape and focus, the four elevation PNGs with `sceneStats()` unchanged, print media, and the CSV.
8. **Browser check:** Scheme C on Tabloid and Arch C, D and A on Tabloid. All elevations drew with no retries, and the 1 inch bar is 96 px. The print dialog itself can't be opened from the test browser, so **print preview at 100% and a ruler on the printed bar are still for Finley to check.**
9. **Docs:** `PLAN.md` has the Nov 2 order change and a "Deliberate changes from the legacy file" entry.
10. **Finish:** committed. Merging into `drawing-sheets` or `phase-5a-parts-rails`, or opening a PR, is Finley's call.

Known limits:
- Curved footprints (ellipse, kidney, teardrop, blob, ribbon) are still drawn as their box until Phase 5D. The model marks them `approximate`, and they'll come out right once 5D lands, because the sheets read the same geometry.
- Interiors (rooms) aren't in the new app yet (Phase 5B).

## 5D rework (Nov 4 2026)

### Elevation capture (branch `sheets-5d-capture`)

- **Outlines:** the capture now draws the outline a surface makes as seen from each side, as well as its creases, so dome, sod and curved vault roofs get their profile (they have no sharp crease). `src/scene/edgeTable.ts` welds each geometry's edges once (cached per geometry). Then `pickEdges` chooses, for each view, the creases sharper than 25°, the edges where the surface turns away from the camera, and open edges. The view is carried into each mesh's own space, so any rotation or scale works.
- **Smooth shading decides curves:** an edge the mesh shades smooth (its vertex normals agree across it) is not drawn as a crease unless it is sharper than 70°. That turns stilt struts, round posts, piers, tip columns and bridge members into two outline lines instead of hatching, with no tag per part. This replaces the scout's per-mesh `sheetCrease` tag, because it also covers parts added later. Elsewhere the crease output matches EdgesGeometry within a few edges (probe over every classic roof on every footprint).
- **Tags** (`src/scene/sheetTarget.ts`): `sheetSkip` leaves a subtree out (InteriorMesh's root, sod tufts). `sheetOwner: id` puts a mesh in that object's elevations without making it the object: retaining walls are now one mesh per building and material, and door thresholds and deck filler strips carry their owner. Path tabs carry theirs too, so they appear only in a piece's own elevation. Every other mesh under the building is drawn white with its edges. An instanced mesh draws every copy, with its per-instance colours taken off during the capture. Lines of every kind are hidden, including Sketch's fat lines (drei Edges, meshes of line quads), which used to draw as white boxes.
- **Roofs off:** a capture holds every roof on (`holdRoofs` in `sheetCapture.ts`, read through `useRoofsOff`). The Roofs off toggle itself never changes. Roofs go back about 250 ms after the last capture of a batch, so the four sides don't flicker. The hold is released in `finally`, and materials, visibility and instance colours are restored there too.
- **Tests:** `edgeTable.test.ts` checks that every roof type (vault and saddle included) on every footprint shape, and every Scheme C/C2/C3/C4 wall and roof mass, draws its outline against the sky from four sides and two turned views. `sheetTarget.test.ts` covers the tags, instancing and fat lines, and `sheetCapture.test.ts` covers the roof hold. In the browser, schemes C–C4 and D (Roofs off on, in Realistic, Sketch and Diagram) gave the same image in every style. Every image had zero coloured pixels and its roof drawn up to the window top. `sceneStats()` was unchanged afterwards and Roofs off was restored.

## How to run

```bash
cd /Users/finleygraham-kadushin/islandale-site-planner/.claude/worktrees/token-card-3d15bd
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
