# 6H · Site plan sheet: the detailed plan (check-in A)

Track S, branch `claude/phase-6h-site-sheet-591f83`. Part of `PLAN-PHASE6-REST.md` (and row 6H of `PLAN-PHASE6.md`). No sheet code is written until Finley OKs this plan.

**Done when:** Scheme C's site sheet prints at 1" = 20' on Tabloid, true scale, and every 5E number on it (coverage, program budget, setbacks, code-check verdicts, clearances) equals what the app shows.

## What the sheet is

One more sheet in the Sheets modal: the whole lot from above at a site scale. It shows the lot line, contours, every building's footprint and roof, decks, walks and path pieces, pads, trees and other site objects, the shoreline (OHWM), the top of bank, the setback bands, the shoreline buffer line, a north arrow and a site scale bar. Beside the drawing, a notes column holds the lot facts, the setbacks in force, the program budget, the code check and each building's clearances.

It reads the plan and never changes it, like the other sheets. Every number comes from the same function the app's panel calls, given the same inputs.

## How big the lot is, and what that means for the paper

The parcel ring (131 points; edges 4–122 are shoreline) measures **214 × 196 ft north-up**. Turned about 30°, its bounding box is only **202 × 116 ft**.

Tabloid's drawing area, after the 0.5 in margins and the 0.9 in title strip, is 16 × 9.1 in.

| Scale | Lot north-up, with a 15 ft pad all round (244 × 226 ft) | Lot turned to fit (232 × 146 ft) |
|---|---|---|
| 1" = 20' | 12.2 × 11.3 in: **too tall** (2 tiles, or Arch C) | 11.6 × 7.3 in: **fits**, with a 4.4 in notes column |
| 1/16" = 1'-0" (1" = 16') | 15.3 × 14.1 in: **too tall** (2 tiles, or Arch D) | 14.5 × 9.1 in: just fits with a 10 ft pad; the notes go on a second page |

**So the plan is to turn the drawing so the lot's long side runs across the sheet** (the angle that makes the box smallest, about 30°), with the north arrow showing the turn. The plan sheets already do this for buildings (`northDeg` in `Page.tsx`, `northOnSheetDeg` in `svgDims.ts`). A "North up" checkbox keeps true north straight up for anyone who wants it, and then the drawing tiles like any other (`TiledDrawing`).

**If the drawing doesn't fit:**
1. The notes column moves to a second page, "Site notes", on the same paper.
2. If the drawing alone still doesn't fit, it tiles across pages with crop marks (`TiledDrawing`, as the plans do now).
3. The modal's fit line says so: "Site plan: 1 page on Tabloid", or "2 pages; fits one page of Arch C".

## New files: `src/export/sheets/site/`

Same three stages as every other sheet (model, then layout, then SVG):

| File | What it does |
|---|---|
| `siteModel.ts` | Plan + site + setbacks in, a pure `SiteSheetModel` out, in **site feet** (x east, y north): lot ring and shoreline run, contours, top of bank, buffer line, side-setback line, band runs, buildings (parts, roofs, ridges, name, floor NAVD88), path pieces, site objects. |
| `siteFrame.ts` | The sheet frame: picks the turn (smallest box, or 0° for north-up), turns and flips site feet into SVG feet (y down), and gives the extent with its pad. Also gives `northDeg` for the title strip. |
| `siteNotes.ts` | The notes as rows of text, built **only** by calling `lotFacts`, `programBudget`, `codeCheck` and `clearances` and formatting what they return. No rule maths of its own. |
| `siteLayout.ts` | Places the drawing and the notes column on the page; decides one page, a notes page, or tiles; places labels (building names, contour elevations, band names) so they don't collide (reusing `spreadApart`, `textWidthFt`). |
| `SiteSheet.tsx` | The page(s): `<Page>` with the SVG drawing and the notes column. |
| `SiteMarks.tsx` | The SVG pieces: lot line, contours, bands, buffer, bank, buildings, path pieces, objects, and the site scale bar (0–10–20–40–80 ft). |
| `SiteNotes.tsx` | The notes column as small tables. |
| Tests beside each | `siteModel.test.ts`, `siteFrame.test.ts`, `siteNotes.test.ts`, `siteLayout.test.ts`. |

Plus `e2e/site-sheet.spec.ts`, and a few lines in `src/export/sheets/CLAUDE.md` (map rows for `site/`).

## Small changes to existing files

All inside Track S's files except the two marked **(site/)**, which are decision 3 below.

- **`types.ts`:** a `SiteScale` type, `1/20 | 1/16` inches per foot, with its labels (`1" = 20'-0"`, `1/16" = 1'-0"`). Kept apart from the building `Scale`, so the building scale list doesn't grow.
- **`Page.tsx`:** `scale` widens to a number, with an optional `scaleLabel` and scale-bar marks, so a site page can use the same frame and title strip. Building sheets are unchanged.
- **`tiles.ts`:** `tileDrawing` and `smallestPaper` take any number scale (a type widening; the maths is already general).
- **`DrawingSheets.tsx`:** a "Site plan" checkbox in Show, a "Site scale" select (shown when Site plan is on), a "North up" checkbox, the site sheet drawn once before the buildings, a line in the fit note, and the empty-plan message no longer hides the site sheet. About 15 lines.
- **(site/) `src/site/buffer.ts`:** export `topOfBankLine(parcel, bankFt)`, the iso-line `bankFt` in from the east (banked) shore, using the grid that file already builds. The app doesn't draw the top of bank today, so the sheet needs one.
- **(site/) `src/site/SiteMarks.tsx`:** move the pure part of its contour builder (survey contours outside cuts, cut-ground contours inside them) into `src/site/siteContours.ts`, so the 3D marks and the sheet share one function. No change in behaviour; `SiteMarks.tsx` calls it.

**Not touched:** `src/ui/TopBar.tsx`, `src/layout/commands.ts` (Track R), `tools/blender/`, `tools/unreal/` (Track U). The sheet opens from the existing Sheets button.

## What the drawing shows, and how

Line weights are in printed points through `ptToFt`, as on the plan sheets, so they print the same at either scale. The sheet is black on white; bands are light hatching, not colour, so it photocopies.

| Thing | Where it comes from | How it's drawn |
|---|---|---|
| **Lot line** | `parcel.ring`, side and rear edges (not shoreline) | Heavy dash-dot property line; lot-corner stakes as small circles (the same stakes `SiteMarks.tsx` puts in 3D); each side edge's length labelled. |
| **Shoreline / OHWM** | `parcel.ring` edges `shorelineEdges.first…last` | Medium solid line labelled "OHWM" a few times along it; the sea side lightly stippled. |
| **Top of bank** | new `topOfBankLine(parcel, setbacks.bankFt)` | Medium line with short downhill ticks (bank symbol), labelled "Top of bank, bankFt ft from OHWM". East shore only, as the rule measures it. |
| **Contours** | the shared contour function (2 ft interval, index every 10 ft, the app's values), clipped to the drawing extent | Minor 0.25 pt, index 0.6 pt; index contours labelled in ft NAVD88 along the line, upright. Inside earthworks, the cut ground's contours, as in 3D. |
| **Shoreline buffer band** | `setbackBand()` sampled on a 0.5 m grid inside the lot, merged into row runs | Light 45° hatch over the band; the buffer line itself from `shoreBufferLine(parcel, shoreFt, bankFt)` as a long-dash line labelled "Shoreline buffer, shoreFt ft". |
| **Side and rear setback band** | the same band grid (`'side'`), and its edge as an iso-line of the lot-line distance | Lighter hatch the other way; dashed line labelled "Side setback, sideFt ft". |
| **Tree zones** (only if Tree zones is on in the Setbacks panel) | `treeZone()` at 35 and 110 ft | Dotted lines labelled "Tree zone 1 / 2". |
| **Buildings** | `sheetBuildings()` parts (the plan sheets' model), each outline taken from the building frame to the site with `localToSite` | Walls: outline with poché (solid grey fill). Decks and porches: thin outline with deck-board lines. Stairs: tread lines and an up arrow. Building name and "FF +xx'-x" NAVD88" in the middle. |
| **Roofs** | the same model's roofs and ridges, hips and valleys (`model/roofs.ts`, `roofCreases.ts`) | Eaves as a thin dashed line beyond the walls; ridges, hips and valleys as thin lines (a roof plan over the footprint, the usual site-plan convention). |
| **Earthworks** | the model's earthworks (retaining walls, courts) | Retaining walls as double lines; court outlines dashed. |
| **Path pieces** | `pad` objects that are path pieces (`isPathPiece`), outline from `siteFootprint` | Walks and landings: thin outline. Ramps: an up arrow with slope %. Stairs: treads. Boardwalks: board lines. |
| **Pads, drives, patios, parking** | other `pad` objects | Thin outline, labelled with the object name. |
| **Trees** | `tree` objects, canopy radius from `treeShapes` | Canopy circle (scalloped edge) and a trunk dot. |
| **Boulders, pond, pool, sheds, shops** | their `siteFootprint` | Outlines; pond and pool with a water line; sheds and shops with a cross (roofed). |
| **Clearance dimensions** | `clearances()` per building (shore and lot-line nearest points) | One dimension per building to the shore (or top of bank) and one to the nearest lot line, matching the app's 3D clearance labels. |
| **North arrow** | `siteFrame` turn | In the title strip, turned (`Page`'s `northDeg`). |
| **Scale bar** | site scale | 0–10–20–40–80 ft bar, plus the 1 in check bar the other sheets have. |
| **Title strip** | `Page` | Plan name, "Site plan", "Islandale · Lopez Island", scale, date, "Elevations NAVD88, contours 2 ft". |

Hidden objects stay off the sheet, as they're off the code check.

## The notes column

Every value is formatted from the app's own functions, with the same inputs the panels give them:

| Block | Function (same call as the app) | What it lists |
|---|---|---|
| **Lot** | `lotFacts(parcel, objects)` (the Site tab's Lot facts) | Lot area (sq ft and acres), shoreline length, **lot coverage sq ft and %** |
| **Setbacks in force** | `setbacks` from the store | Shoreline setback (from top of bank on the east shore, from OHWM on the south-west), top of bank offset, side and rear setback, tree zones on or off |
| **Program budget** | `programBudget(objects)` (the Program panel) | Per building: floors, enclosed, covered, deck sq ft, over 800? Totals against the 1,600 sq ft cap |
| **Code check · SJCC 18.50.540** | `codeCheck({ objects, terrain, parcel, setbacks, schemeId, routeGround })` (the Code check panel, with `routeGround` from the same `useEarthworks()` hook) | Each row: label, PASS / FAIL / NOTE, its text and the objects it names. The rules-off sentence when the scheme sets the brief aside |
| **Clearances** | `clearances(o, plan, site, setbacks)` with `shoreText`, `lotText` | Per building: to shore, to lot line |
| **Legend** | — | Line types and hatches used on the sheet |

The app shows these with its own formatting (for example `coveragePct.toFixed(1)`). The notes use the same rounding, or the shared `formatArea`, so the printed digits are the same.

## Order of work (small commits, the app runs after each)

1. `feat(sheets): site scales, and Page and tiles take any scale` · `SiteScale`, `Page` scale label and bar marks, `tiles` widening. Existing sheets unchanged; their tests still pass.
2. `refactor(site): share the contour builder between the 3D marks and the sheets` · `siteContours.ts`, `SiteMarks.tsx` calls it. (Only with decision 3.)
3. `feat(site): top-of-bank line` · `topOfBankLine` in `buffer.ts`, with a test that it sits `bankFt` from the east shore. (Decision 3.)
4. `feat(sheets): site sheet model and frame` · `siteModel.ts`, `siteFrame.ts` and their tests. Nothing on screen yet.
5. `feat(sheets): site plan drawing` · `SiteMarks.tsx`, `SiteSheet.tsx` (drawing only), the Site plan checkbox and scale select in `DrawingSheets.tsx`.
6. `feat(sheets): site notes from the 5E rules` · `siteNotes.ts`, `SiteNotes.tsx`, the notes column or notes page, and the test that its numbers equal the app's.
7. `feat(sheets): site sheet fit, tiling and North up` · `siteLayout.ts` page decisions, the fit line, the North up checkbox.
8. `test(e2e): site sheet` · `e2e/site-sheet.spec.ts`.
9. `docs(sheets): site sheet in the section map and PLAN.md` · `src/export/sheets/CLAUDE.md` rows, a line in `PLAN.md`.

Each commit runs `npx vitest run src/export/sheets src/site` and `npx tsc -p tsconfig.app.json --noEmit`.

## Tests

**Unit (vitest):**
- `siteFrame`: the turn that gives the smallest box for the Islandale ring is about 30° and the box is about 202 × 116 ft; North up gives 0°; a site point goes to the right SVG point and back; `northDeg` matches the turn.
- `siteModel`: the lot ring has 131 points; shoreline edges are 4–122; every visible building appears once and hidden ones don't; a building's walls in site feet match `ruleOutline`; contours are 2 ft apart with index lines every 10 ft; the buffer and top-of-bank lines lie inside the lot.
- `siteNotes` (**the numbers match**): for **every scheme** in `schemes.json`, loaded into a plan, the notes' coverage, program totals, per-building areas, code-check verdicts and texts, and clearance texts are string-equal to what `lotFacts`, `programBudget`, `codeCheck` and `clearances` give for the same plan, formatted as the panels format them. Includes a rules-off scheme (D, E or F) showing NOTE everywhere.
- `siteLayout`: Scheme C's drawing is one Tabloid page at 1" = 20' with the notes beside it; at 1/16" the notes move to a second page; North up at 1" = 20' tiles to 2 pages and names Arch C as the paper that fits.
- `tiles` and `Page`: the existing tests still pass, plus one for a site scale.

**Browser (Playwright, `e2e/site-sheet.spec.ts`, port 5174):**
- Open Scheme C, read the Site tab's coverage, the Program panel's totals and every Code check row's verdict and text from the page; open Sheets, turn on Site plan, and check the notes column shows the same strings.
- The site SVG is at true scale: its width in CSS inches equals the drawing's feet × 1/20.
- The page count matches the fit line; Print is enabled.
- Toggling North up changes the north arrow's angle and the page count.

Then the existing `e2e/sheets.spec.ts` (building sheets unchanged) and `e2e/site-rules.spec.ts` (if decision 3 touches `src/site/`).

## Check-in B: what Finley gets

- **A PDF of Scheme C's site sheet** at 1" = 20' on Tabloid, printed from the app's Print button (Chrome, Actual size), saved in `build/` (not committed) and sent to you.
- A second PDF at 1/16" = 1'-0" (drawing page and notes page).
- A screenshot of the app's Code check, Program and Lot facts panels next to the sheet's notes, so you can see the numbers match.
- The test results (unit and e2e).

Then I wait for your sign-off before check-in C (merge).

## Decisions for Finley

1. **Turn the lot to fit (recommended), or always north-up?** Turned, Scheme C fits one Tabloid page at 1" = 20' with the notes beside it, and north is shown by the arrow (about 30° off vertical). North-up needs 2 taped Tabloid pages or Arch C at 1" = 20'. I'd default to turned, with a "North up" checkbox.
2. **Site sheet on by default?** I'd add "Site plan" to Show, **on**, printed before the building sheets, so Print gives the full set. Off would keep today's Print output unchanged.
3. **May I make the two small `src/site/` changes?** (a) Export `topOfBankLine` from `buffer.ts` (the app doesn't draw the top of bank today); (b) move the contour builder out of `SiteMarks.tsx` into a shared `siteContours.ts`, no behaviour change. Without (b), the sheet would draw survey contours only, not the cut ground's contours inside earthworks.
4. **Contour interval:** 2 ft with 10 ft index lines, the same as the app. (1 ft would be crowded at 1" = 20'; 5 ft would lose the shore detail.)
5. **Clearance dimensions on the drawing:** one to the shore and one to the lot line per building, as the app's 3D labels show. Or leave them only in the notes, for a cleaner drawing?
6. **Bands as hatching (recommended) or colour?** Hatching photocopies and reads in black and white; colour would match the app's ground tints (orange buffer, tan side band).
7. **Branch name:** the plan said `claude/phase-6h-site-sheet`; this session's branch is `claude/phase-6h-site-sheet-591f83`. I'll keep this one unless you'd like it renamed before merge.

## Finley's answers (check-in A, Nov 8)

All seven as recommended: turned to fit with a North up checkbox; Site plan on by default and printed first; the two `src/site/` changes; 2 ft contours with 10 ft index lines; clearance dimensions on the drawing; hatched bands; keep this branch.

## What changed during the build

- **Clearance dimensions** use the inspector's own words and rounding (`80'-1" TO SHORE · 35'-1" PAST BANK`), so the drawing and the notes read the same figure. A dimension is left off when it would cross another building (its line couldn't be read), when there's nowhere clear for its figure, or when the building crosses its lot line (the inspector gives no distance then); the figure is always in the notes' Clearances.
- **Notes:** the Clearances block has one row per building (its inspector rows run together), to keep the column on the page. A rules-off scheme gets a boxed **RULES OFF** line.
- **Shadows** follow the Sun and tide panel's season and hour, as planned; the check-in PDFs are printed at the app's default (September, 2 pm), since a late hour gives very long shadows.
- **From the old site plan**, kept: the address and data sources (USGS 3DEP lidar, San Juan County GIS, APN), parking stall lines, meadow and sod-roof tufts, water hatching in ponds and pools, glass and metal roof textures. Left out, recorded in `PLAN.md`: its 1 ft contours and its numbered schedule of every object.
- **Files:** the notes column is `NotesColumn.tsx`, not `SiteNotes.tsx` (that differs from `siteNotes.ts` only in case). Added `siteGeom.ts` (joining iso-lines, smooth curves), `siteHatch.ts` (hatching, water lines, bank ticks, stipple), `siteLabels.ts` and `siteAnnotate.ts` (every word placed so none overprints), `SiteFit.tsx` and `siteTestKit.ts`. The site plan's SVG has its own class, `site-svg`, so the building sheets' tests still find a building's drawing first.
- **Notes that are too tall** (a long code check, as in Scheme E) move to a page of their own even when the drawing would leave room beside it; the fit line says so. **Standalone decks** are named only where the name fits at a legible size, with no floor level, so a ring of small decks (Scheme E) doesn't crowd itself.
- **After the code review:** a site plan that can't be built shows one line and leaves the building sheets working; turning a layer on or off redraws only the notes.
- **Tests:** besides the planned ones, every scheme is checked for overprinting words and words off the drawing; the notes are compared against the real Lot facts, Program and Code check panels rendered for Scheme C.

## Check-in B (Nov 9)

Signed off by Finley on the PDFs of Scheme C at 1" = 20'-0" and 1/16" = 1'-0" on Tabloid, north up, and Scheme E. Next is check-in C: merge only on Finley's word.
