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
| Pure model | `src/export/sheets/model.ts`, `parts.ts`, `openings.ts`, `elevation.ts`, `arcs.ts` (circle fitting, compound curves), `ellipse.ts` (an ellipse exactly, and its four-centre arcs), `curves.ts` (curve edges, P corners and S stations), `format.ts` (architectural ft-in), `tiles.ts`, `table.ts`, `earthworks.ts` and `earthTables.ts` (earthworks, grade and areas tables) |
| Elevation renderer | `src/scene/sheetCapture.ts` (API, camera maths), `src/scene/ElevationCapture.tsx` (inside the Canvas; restores the scene after every capture) |
| Screen | `src/ui/DrawingSheets.tsx`, `src/ui/sheets/*` (`Page`, `PlanSheet`, `planLayout`, `planMarks`, `planDims`, `svgDims`, `earthLayout`, `EarthMarks`, `ElevationSheet`, `MeasureTables`) |
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
- Curved footprints were drawn as their box until Phase 5D; they are now drawn true (see the 5D rework below).
- Interiors (rooms) aren't in the new app yet (Phase 5B).

## 5D rework (Nov 4 2026)

On branch `sheets-5d`, the sheets were brought up to the 5B–5D buildings, area by area.

- **Curved outlines.** Every ellipse, kidney, teardrop, blob and ribbon is drawn as its true outline (5D's `massPoly`), so the false "drawn as box" notes and the `approximate` flag are gone; a part now carries its `curve` kind, shown in the Parts table's Kind ("wall, blob").
  - `fitCurves` (`arcs.ts`) covers every smooth run with arcs that meet end to end (longest fitting stretch first, then each side), so a non-circular curve is a compound curve a draftsman can swing with a compass, every arc within 0.1 ft of the outline. A circle is still one 360° arc.
  - An ellipse is given exactly (centre, axes, turn: new Ellipses table, centre lines on the plan) and drawn with the four-centre construction (`ellipse.ts`): two small and two large arcs, tangent where they meet, the small radius chosen to keep closest to the ellipse (within about 1 1/4 in on the schemes' ellipses; never used if more than 0.25 ft out, when the fitted arcs stand).
  - Chords of a curve are never dimensioned one by one (D-0 went from 148 plan dimensions to 14). The Edges table gives each curve once with its length round the wall; Curves names each arc by the P points at its ends and says how close it fits ("Within").
  - P labels on a curve only mark where its arcs meet and real corners (vertex numbers are kept, so P5, P15 …). Stations S1, S2 … every 2 ft round from P1 are marked on the plan and listed with the corners, with a "Round from P1" column, on curved footprints and on any stretch of curve no arc draws.
  - Every opening on a curve is located round the walls from P1 (an along-cut's own `x`), labelled "Main · curved wall", with a note beside it on the plan; P1 is bold on a part with a curve and an arrow outside the wall shows the direction. An opening that turns a straight corner is measured on the last wall named, where its left end is (it used to print 0).
  - When no main wall passes through the datum (a curved or turned main part), the datum note says it is the bounding box's corner, the box is drawn dashed and, where it is not the overall size, dimensioned as "Main box".
  - Parts table Width and Depth are the drawn outline's extent along the part's own axes.
  - Measurement pages: rows that wrap are counted, and a long narrow table runs on in up to three blocks side by side. On tabloid, D-0 went from 10 pages to 4, D-1 12 to 4, E-0 8 to 3, G-1 7 to 3, and C-0 4 to 3; no building takes more pages than before.
- **Wall thickness.** The plan draws each wall as 5D builds it: the outline is its outside face (every dimension is to it, and a note under the plan says so), the inside face is drawn too, and the wall between is hatched (8"; a glass curtain wall, 2 1/4", is two thin lines with the glass between, unhatched).
  - The geometry is the shell's own: `wallPlan` (`wallShell.ts`) gives the inside face, each wall's thickness and the point through the wall the jambs run to; `wallThicknessFt` / `wallSpecsOf` are the glass-or-full rule `WallMass` used inline, read through the exterior model, so the scene and the sheets can't drift. The sheet model carries `SheetPart.inner`, `SheetEdge.thicknessFt` and `glass`, each piece's `innerA`/`innerB` (jambs) and `midA`/`midB` (glass at mid-wall), and `SheetArc.innerRadiusFt`.
  - Openings cut through the whole wall with square jambs; a window's glass at mid-wall between sill lines, a slider's two panes, a cut-out's faces dashed. A door's leaf opens into the room from the inside face, hinged at the right jamb seen from outside, its swing dashed and noted as assumed (the plan stores no swing).
  - Each part gets one thickness dimension per wall kind, on its longest straight wall in the widest stretch clear of openings. Curved walls give the radius of both faces ("R 8'-8" outside", "R 8'-0 1/4" inside"); a deck arc on the same line as a wall's is not labelled twice. P labels and stations sit inside the inside face; station ticks cross the wall.
  - Tables: Parts has a Wall column (8", or 8", glass 2 1/4"), Curves an Inside radius column, and the notes say measurements are to the outside face.
  - Checked by tests against the 3D shell (every inside-face mesh vertex on the sheet's inside line, every jamb end a shell corner) on every footprint shape at three turns, glass walls and schemes C to C4, and in the browser on C-0 and C4-0 at Arch D.
- **Roofs.** The sheets measure the roof the scene builds: `roofParamsOf` / `sculptOptionsOf` (`roof.ts`) are the one set of roof parameters `RoofMesh` and the sheets both pass (shell curl, open porch and the resolved finish included, which fixed shell and dome rises by up to 2 ft: D-0's shell is 13.54 ft, not 11.58), and `roofForm` is buildRoof's dispatch. The sheet roof (`roofs.ts`) carries:
  - Its eave as its own builder grows it (a prow's outline, a sculpted slab's, a flat or pyramid roof's mitred ring, else the walls grown by the overhang).
  - Named levels by type, used by the elevations and the Levels table alike (`levels.ts`): eave and ridge; low and high eave on a shed; valley and eaves on a butterfly (0.25 m up on a fitted one); eave, gambrel break and ridge; apex on a pyramid; roof top on a flat roof; eave and crown on dome, sod and vault; eave low end, lip underside and lip top (and crown when higher) on a shell; low and high corners on a saddle; and on a dipped prow shell (C4-0) its tip eave, top and underside, and the tip column's top. A wall with no roof marks its "wall top".
  - Its slopes as built, read from the 3D roof's faces: one pitch, a gambrel's two ("14.98:12 / 5.82:12"), up to three on a faceted fitted roof or pyramid, else the set pitch as nominal; "curved" (with the curl) on sculpted roofs; "flat". The Parts table gives Finish and Slope and "Roof top above floor".
  - Plan linework in the building frame (`RoofMarks.tsx`): ridges, hips, valleys and gambrel breaks are read off the 3D roof mesh where its faces turn by more than 10° (`roofCreases.ts`), so every roof type, outline and turn draws what the scene builds; a prow's dip bends its facets without moving them, so its seams are read undipped. Sculpted roofs draw the legacy plan set (`roofLineSets(…, true)`): contours, vault crown and ribs, shell ribs and contours, saddle rulings, and a shell's lip (the run of its rim more than half way up). A one-plane roof gets a slope arrow from "high" to "low". The prow shell's tip column is a circle at its foot diameter.
  - Checked by tests: the sheet rise equals the scene's (its finish chooser, parameters and builder) for every roofed part of every scheme (over 100) and for every roof type on nine footprint shapes; gambrel break and slopes on a 30 × 20 ft rectangle; gable, hip, shed (arrow downhill on the mesh), butterfly, flat, pyramid, dome, vault, shell and saddle levels; turned wings' linework at three turns; C4-0's tip eave, underside and column against buildRoof.
  - Left for Finley: on a ribbon footprint the scene's sculpted slab reaches up to about 1.4 ft past its own eave (the height field's grid is clipped to the outline cell by cell), and its linework follows it; and the dashed eave and the dashed ridge lines are told apart only by dash length.
- **Levels, earthworks and areas.** The sheets read the earthworks the scene builds: `planEarth` (`earthworks.ts`) works out `earthOps` and `siteEarthworks` once per `sheetBuildings` call (the same ops, so the same cached ground, as `useEarthworks`), and that ground is what every floor, rail and grade line stands on (`planRailWorld` now takes it).
  - Levels: finished grade at the walls (lowest, highest) is the ground the 3D model and the elevations show; surveyed grade at the same points is given separately, with the cut floor round a sunk building and each berm's crest. A note says which is which and, on a sunk building, how the sink sets the floor. (The old "Grade under the building" was the finished grade round every outline, stairs included, so a berm crest read as grade.)
  - New tables, each only where the building has one: Retaining walls (RW tag, material, length along the face, thickness, top of wall, bottom at the cut floor, footing, NAVD88), Berms (the walls they lie against, length, crest height and width, slope, how far out the toe meets the survey), Sunken courts (side, width, depth, floor), and Areas.
  - Plan (`earthLayout.ts`, `EarthMarks.tsx`), in grey under the building: retaining walls as a filled double line with "RW1 stone retaining wall 38'-6"" on their straightest stretch and "TW … BW …" spot heights past each end; berm crests solid, labelled with crest height and slope half way down; sunken courts dashed; the toe of the fill dashed and the top of the cut dash-dot, contoured from the earthworks rasters where fill or cut is about an inch and kept only where this building is the nearest earthworks object; notes under the plan say what each line is and that spot heights are above the main floor.
  - Elevations draw the surveyed grade dashed, labelled, wherever it stands an inch or more off the finished grade.
  - Areas count overlaps once: enclosed is the area of the union of the wall outlines, decks and porches the union with them less the enclosed (D-0 801 sq ft, not 932; A-1 450, not 514).
  - `SiteEarthworks` gained `courts` and `BermLine` its edge indices, crest and slope, read off the same prepared passes; the scene's ground is unchanged.
  - Checked by tests on synthetic plans (a sunk house at three turns on rising ground: walls equal to the scene's, court on the downhill side, finished grade at the cut floor; bermed rect, kidney and ellipse houses at four turns: crest out from the wall at the berm height, toe where the ground returns to the survey; a neighbour's berm kept off a cabin's sheet; overlapping walls and a deck under a wall) and on scheme C (C-0's one stone wall and court, every other cabin's finished grade equal to its survey), and in the browser on C-0.
  - For Finley: Scheme E's six ring decks (E-19 to E-24) sit up to 7 ft under the earthworked ground (E-21's deck top is under the berm round E-0 to E-4), because a standalone deck seats on the survey; and E-3's and E-1's finished grade at the walls stands 1.5 to 4 ft above their floors (berm and fill wrapping round). Both are scene or scheme matters the sheets only show. On curved footprints, "uphill" or "downhill" berm and court sides can pick a single short chord (E-0's berm and court are on a 1.6 ft chord), as the old planner's rule did.

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
