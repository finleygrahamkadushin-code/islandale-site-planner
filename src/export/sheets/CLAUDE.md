# Drawing sheets section

Printable drawing sheets of each building at a true architectural scale (1/4" = 1'-0" by default), for drawing the design by hand: floor plans with dimensions, rooms and roof lines, a foundation plan, elevations traced from the live 3D scene, and tables of every measurement. They open as a modal over the planner from the top bar's Sheets button. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

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

## Folder map

- **Top level:** `DrawingSheets.tsx` (the modal), `Page.tsx`, `tiles.ts`, `format.ts`, `svgDims.ts` and `types.ts`. These are shared by every kind of sheet.
- **`model/`:** plan → sheet model. **`plan/`:** floor plans. **`foundation/`:** the foundation plan. **`elevation/`:** elevations and the live-scene capture. **`tables/`:** measurement tables.
- Tests sit beside their files. `model/curvedParts.test.ts` and `model/walls.test.ts` test the model as a whole.

## Data

The sheets only read the plan; they never change it. They read the plan, terrain and selection from `../../store/planStore.ts`. The modal's own settings (paper, scale, which sheets and layers show) are local React state in `DrawingSheets.tsx`: they aren't saved or undone. An elevation capture may briefly hold roofs on while it renders (`../../buildings/roofs/useRoofsOff.ts`), then leaves the scene as it was.

## Talks to (open these only when the task crosses over)

- **Uses, heavily:** `../../buildings/` (`footprint`, `masses`, `walls/wallShell`, `openings/openingLayout` and `openingEdits`, `roofs/roof` and `sculptRoof`, `foundation/supports`, `rails/railWorld`), `../../interiors/` (`geom`, `types`, `rooms`, `model`, `envelope`, `furniture`), `../../site/` (`units`, `types`, `terrain`, `earthworks`) and `../../store/types` and `planStore`. The sheets are drawn by the same functions the 3D scene uses, so they match it. **A change in buildings, interiors or site can change the sheets:** run this section's tests after one.
- **Used by:** `../../ui/TopBar.tsx` (opens the modal), `../../scene/Scene.tsx` (mounts `ElevationCapture`), `../../buildings/roofs/useRoofsOff.ts` (roofs held on during a capture) and `../../interiors/scene3d/wallCrossings.test.ts`.

## Checks for this section

- **Unit tests:** `npx vitest run src/export/sheets` (389 tests, about 5 s). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing. The "every scheme" tests (`tables/table.test.ts`, `model/roofs.test.ts`, `tables/MeasureTables.test.ts`) can time out when the machine is busy; re-run them alone before you blame a change.
- **Browser tests:** `e2e/sheets.spec.ts`, which covers Scheme C's cabins at true scale, curves, every opening located, elevations finishing, roofs and supports (9 tests, about 4 minutes).
- The plan for these sheets is `PLAN-DRAWING-SHEETS.md` at the repo root.
