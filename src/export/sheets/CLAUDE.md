# Drawing sheets section

Printable drawing sheets at a true scale, for drawing the design by hand: a site plan of the whole lot (1" = 20'-0" or 1/16" = 1'-0") with the 5E notes, and for each building (by default the largest of 1/16", 3/32", 1/8", 1/4" and 1/2" = 1'-0" at which its floor plans fit one page, `largestScaleThatFits` in `tiles.ts`; a scale picked by hand stays) floor plans with dimensions, rooms and roof lines, a foundation plan, elevations traced from the live 3D scene, and tables of every measurement. They open as a modal over the planner from File → Sheets… in the top bar. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## How it fits together

There are three stages:
1. **The plan becomes the sheet model** (`model/`). The model is pure data in the building frame, in feet.
2. **The model is laid out** on the page (the `*Layout.ts` and `plan*.ts` files).
3. **It's drawn as SVG** (the `*Sheet.tsx` and `*Marks.tsx` files).

Elevations add a fourth stage: an image captured from the live 3D scene (`elevation/`). All the shared types are in `types.ts`, which is 547 lines, so look a type up by name rather than reading the file whole.

## Start here, by task

| To change… | Open |
|---|---|
| The sheets modal: paper, scale, which sheets and checkboxes show | `DrawingSheets.tsx` |
| The page frame, title strip, sheet numbering | `Page.tsx`, `tiles.ts` (how much drawing a page holds) |
| How numbers are written (`12'-6 1/4"`, sq ft, degrees) | `format.ts` |
| Dimension lines, ticks, arrowheads (shared by every sheet) | `svgDims.ts` |
| What a building's parts are on the sheets | `model/model.ts` (every building), `model/parts.ts` (one building's parts) |
| Curved walls dimensioned as arcs; ellipses by four-centre construction | `model/arcs.ts`, `model/curves.ts`, `model/ellipse.ts` |
| Openings located along walls | `model/openings.ts` |
| Roof outlines, ridges, hips, valleys | `model/roofs.ts`, `model/roofCreases.ts` (read off the 3D roof mesh) |
| Retaining walls, berms, courts on the sheets | `model/earthworks.ts` |
| Rooms, partitions, interior openings, furniture on the plans | `model/interiors.ts` |
| Floor and roof levels of each part | `model/levels.ts` |
| One floor plan per floor | `plan/floorPlans.ts`, then `plan/PlanSheet.tsx` |
| Where a plan's dimensions and notes go | `plan/planLayout.ts`, `plan/planDims.ts` |
| How walls are drawn (faces, hatching, thickness) | `plan/planWalls.ts`, `plan/WallMarks.tsx` |
| Rooms on the plan | `plan/roomLayout.ts`, `plan/RoomMarks.tsx` |
| Roof lines on the plan | `plan/RoofMarks.tsx` |
| Earthworks on the plan | `plan/earthLayout.ts`, `plan/EarthMarks.tsx` |
| Shared plan-mark pieces (stations, ticks, labels) | `plan/planMarks.tsx` |
| The foundation plan: posts, piers, beams, spacing dimensions | `foundation/supports.ts`, `foundation/supportLayout.ts`, `foundation/SupportMarks.tsx`, `foundation/FoundationSheet.tsx` |
| Elevations: which sides, grade line, the sheet | `elevation/sides.ts`, `elevation/elevation.ts`, `elevation/ElevationSheet.tsx` |
| Capturing an elevation image from the 3D scene | `elevation/sheetCapture.ts` (the request), `elevation/ElevationCapture.tsx` (inside the canvas), `elevation/sheetTarget.ts` (what one object draws), `elevation/edgeTable.ts` (line drawing from a mesh) |
| The measurement tables: rooms, supports, earthworks, levels | `tables/table.ts`, `tables/roomTables.ts`, `tables/supportTables.ts`, `tables/earthTables.ts`, `tables/MeasureTables.tsx` (packs them onto pages) |
| The site plan (6H): what it draws, from the plan | `site/siteModel.ts` (lot, lines, contours, bands, clearances), `site/siteObjects.ts` (buildings, roofs and shadows, paths, bridges, pads, trees) |
| The site plan's turn, page fit and notes column or notes page | `site/siteFrame.ts` (turn to fit, north up), `site/siteLayout.ts` (extent, page mode, pens, the turned model) |
| The site plan's notes (lot coverage, program, clearances, code check), read from the app's own functions | `site/siteNotes.ts`, drawn by `site/NotesColumn.tsx` |
| The site plan's words: where every label goes, nothing overprinting | `site/siteAnnotate.ts`, `site/siteLabels.ts` |
| The site plan's line textures: setback hatching, water lines, bank ticks, gravel, tufts | `site/siteHatch.ts`; small geometry (joining iso-lines, smooth paths) in `site/siteGeom.ts` |
| The site plan drawn as SVG, and its pages | `site/SiteMarks.tsx`, `site/SiteSheet.tsx`; its line in the fit note is `site/SiteFit.tsx` |

## Folder map

- **Top level:** `DrawingSheets.tsx` (the modal), `Page.tsx`, `tiles.ts`, `format.ts`, `svgDims.ts` and `types.ts`. These are shared by every kind of sheet.
- **`model/`:** plan → sheet model. **`plan/`:** floor plans. **`foundation/`:** the foundation plan. **`elevation/`:** elevations and the live-scene capture. **`tables/`:** measurement tables. **`site/`:** the site plan (6H), with its own model, layout and SVG; it reuses `model/` for the buildings. Its tests share `site/siteTestKit.ts` (a scheme's plan and ground, built as `useEarthworks` builds them).
- Tests sit beside their files. `model/curvedParts.test.ts` and `model/walls.test.ts` test the model as a whole.

## Data

The sheets only read the plan; they never change it. They read the plan, terrain and selection from `../../store/planStore.ts`. The modal's own settings (paper, scale, which sheets and layers show) are local React state in `DrawingSheets.tsx`: they aren't saved or undone. An elevation capture may briefly hold roofs on while it renders (`../../buildings/roofs/useRoofsOff.ts`), then leaves the scene as it was.

## Talks to (open these only when the task crosses over)

- **The site plan also uses** `../../site/` (`rules/setbacks`, `rules/codeCheck`, `rules/program`, `rules/clearances`, `lotFacts`, `buffer`, `siteContours`, `environment/sun`), `../../paths/pieces`, `../../buildings/decks` (boardwalks and bridges) and `../../ui/selectionStats` (`clearanceRows`), and gets the ground from `../../site/earthworks/useEarthworks` in `DrawingSheets.tsx`, so its numbers and contours are the app's own. **A change to a 5E rule or its wording changes the site notes:** run `site/siteNotes.test.ts` and `e2e/site-sheet.spec.ts`.
- **Uses, heavily:** `../../buildings/` (`footprint`, `masses`, `walls/wallShell`, `openings/openingLayout` and `openingEdits`, `roofs/roof` and `sculptRoof`, `foundation/supports`, `rails/railWorld`), `../../interiors/` (`geom`, `types`, `rooms`, `model`, `envelope`, `furniture`), `../../site/` (`units`, `types`, `terrain`, `earthworks`) and `../../store/types` and `planStore`. The sheets are drawn by the same functions the 3D scene uses, so they match it. **A change in buildings, interiors or site can change the sheets:** run this section's tests after one.
- **Used by:** `../../ui/FileMenu.tsx` (File → Sheets… opens the modal), `../../scene/Scene.tsx` (mounts `ElevationCapture`), `../../buildings/roofs/useRoofsOff.ts` (roofs held on during a capture) and `../../interiors/scene3d/wallCrossings.test.ts`.

## Checks for this section

- **Unit tests:** `npx vitest run src/export/sheets` (about 540 tests, about 10 s; the site plan's every-scheme tests take a few seconds). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing. The "every scheme" tests (`tables/table.test.ts`, `model/roofs.test.ts`, `tables/MeasureTables.test.ts`) can time out when the machine is busy; re-run them alone before you blame a change.
- **Browser tests:** `e2e/sheets.spec.ts`, which covers Scheme C's cabins at true scale, every opening located, elevations finishing, roofs and supports (Scheme C only; about 4 minutes).
- **Site plan browser tests:** `e2e/site-sheet.spec.ts`: the notes word for word as the panels and inspector, true scale, Tabloid fit, North up and 1/16", the notes never cut off (C, H, G), and a plan with no buildings printing the site plan alone (9 tests, about 9 minutes). Keep other tabs off the test server (port 5174) while they run: a second page drawing elevations there makes their setup time out. The site plan is on by default and printed first; its drawing is `svg.site-svg` (not `.sheet-svg`), so a building's drawing is still the modal's first `.sheet-svg`.
- The plan for these sheets is `PLAN-DRAWING-SHEETS.md` at the repo root.
