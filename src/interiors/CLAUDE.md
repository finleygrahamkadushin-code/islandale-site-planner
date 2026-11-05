# Interiors section

A cabin's floor plans: rooms, partitions, interior doors, windows and cased openings, furniture and bathroom fixtures, the room program checklist, the 2D floor-plan editor, and the rooms drawn in 3D inside the cabin. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| The stored shape of floors, rooms, openings, furniture; room types and colours | `types.ts` |
| Reading, migrating and tidying stored floors | `model.ts` |
| What a room means: fit, partitions, opening geometry, floor stats | `rooms.ts` |
| The enclosed part of the cabin on a floor (where rooms can go) | `envelope.ts` |
| Polygon maths: clipping, offsets, point-in, areas | `geom.ts` (836 lines: search it, don't read it whole) |
| Room programs per cabin and the checklist | `program.ts` |
| Any floor-plan edit: add, split or merge rooms, move a wall or corner, openings, furniture | `edits.ts` (pure), then the store action in `../store/interiorActions.ts` |
| Lengths shown as `12'-6"` (also used by the drawing sheets) | `format.ts` |
| The furniture catalogue and its plan symbols | `furniture/furniture.ts` |
| Bathroom fixtures: showers, tubs, vanities, accessible-room defaults | `furniture/fixtures.ts`, `furniture/FixtureFields.tsx` |
| The floor-plan editor: canvas, tools, pan and zoom, drawing | `editor/InteriorEditor.tsx` (keys and shell), `editor/PlanCanvas.tsx` (pointer tools), `editor/PlanLayers.tsx` (what's drawn) |
| The editor's side column: selection, rooms list, stats, program | `editor/InteriorPanel.tsx` |
| Which cabin and floor is open, the tool, the selection (view state) | `editor/interiorView.ts` |
| Rooms in 3D: partitions with gaps, the upper slab, stairs | `scene3d/interior3d.ts` (geometry), `scene3d/InteriorMesh.tsx` (draws it) |
| An interior door where one part's wall runs across another part's floor | `scene3d/wallCrossings.ts` (used by `../buildings/walls/WallMass.tsx`) |

## Folder map

- **Top level (the floor-plan model):** `types.ts`, `model.ts`, `rooms.ts`, `envelope.ts`, `geom.ts`, `program.ts`, `edits.ts` and `format.ts`. Everything here is pure and returns new objects.
- **`editor/`:** the 2D floor-plan editor, a full-screen view opened from the inspector. **`furniture/`:** the catalogue and bathroom fixtures. **`scene3d/`:** the interior drawn in the 3D scene.
- Tests sit beside their files; the store-side tests are `../store/interior.test.ts`.

## Data: where a cabin keeps its floors

- **Floors:** `params.floors` on the cabin's `PlanObject` (`../store/types.ts`), stored the way the old planner stores them (int2/model.js), in building-local feet (+z front).
- **A floor:** `{ name, rooms, openings, furniture }` (`Floor` in `types.ts`).
- **A room:** a polygon with a type and name.
- **An opening:** sits on a room `edge` at `pos`, with a `width` and a kind (door, window, slider or open).
- **Furniture:** a catalogue `type` at `x`, `z` and `rot`.

Ids are numbers, unique within a floor. Keep the shapes readable by the old planner. `model.ts` sanitises whatever it reads.

## Changing data (the store)

Every edit goes through `../store/interiorActions.ts` (`editFloor`, `addFloor`, `renameFloor`, `removeFloor`). `editFloor` takes a pure op from `edits.ts` and writes the floor back to the cabin's params as one undo step, and it respects locks: a locked cabin refuses floor-plan edits. The editor's view state (`editor/interiorView.ts`) is not plan data and is never undone.

## Talks to (open these only when the task crosses over)

- **Uses:** `../store/types`, `planStore` and `interiorActions`; `../site/units`. From `../buildings/`: `masses` and `footprint` (the cabin's outline the envelope is built from), `walls/wallShell` (wall thickness), `openings/openingLayout` and `foundation/foundation`. The 3D view uses `../scene/Surface` and `buildingLook`.
- **Used by:** `../export/sheets/` (`model/interiors`, `model/model`, `plan/floorPlans`, `plan/RoomMarks` and `tables/roomTables` draw floor plans and room tables), `../buildings/BuildingMesh.tsx` (mounts `InteriorMesh`), `../buildings/walls/WallMass.tsx` (`wallCrossings`), `../app/App.tsx` (mounts the editor), and `../ui/Inspector.tsx` and `useKeyboardShortcuts.ts` (open it). The sheets import `format.ts` too. If you change an exported function's signature, search these for its callers.

## Checks for this section

- **Unit tests:** `npx vitest run src/interiors src/store/interior.test.ts src/export/sheets/model/interiors.test.ts` (fast). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing.
- **Browser tests:** `e2e/interiors.spec.ts`, which opens every Scheme C cabin's plan, edits a room, adds a door and a bed, goes upstairs, views it in 3D with the roof off, and checks locks and undo (about 3 minutes). If floor plans on the drawing sheets could change, also run `e2e/sheets.spec.ts`.
- The old planner is the reference for behaviour. Files name the legacy piece they port (`INT.model`, `INT.geom`, `int2/render.js`, `int2/walls3d.js` and so on), so find them with `tools/map.sh find NAME`.
