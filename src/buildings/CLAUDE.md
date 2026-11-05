# Buildings section

Cabins and standalone decks: their walls, roofs, openings, wings (decks, porches, stairs, ramps), rails, supports and paint. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| How walls are built, their thickness, holes, mitres | `walls/wallShell.ts` (geometry), `walls/WallMass.tsx` (draws it) |
| Roof shapes: gable, hip, gambrel, prow | `roofs/roof.ts`, `roofs/fittedRoof.ts`, then `roofs/RoofMesh.tsx` |
| Dome, vault, shell, saddle, sod roofs | `roofs/sculptRoof.ts` (854 lines: search it, don't read it whole) |
| Doors and windows: fit rules, editing, drawing | `openings/openingLayout.ts`, `openings/openingEdits.ts`, `openings/OpeningsPanel.tsx`, `openings/OpeningMesh.tsx` |
| Which deck edges get a guard, and where it opens | `rails/railRules.ts`, `rails/railOpenings.ts`, `rails/railWorld.ts` |
| How a rail looks (wood, steel, cable, glass) | `rails/railStyles.ts`, `rails/GuardRail.tsx` |
| The Railings panel and rail chips | `rails/RailingsPanel.tsx`, `rails/RailChips.tsx`, `rails/railEdits.ts` |
| Stair and ramp layout, risers, curves, handrails | `stairs/stairPlan.ts`, `stairs/stairWing.ts`, `stairs/stairCurve.ts`, `stairs/stairRails.ts`, `stairs/AccessMass.tsx` |
| Deck floors, sitting steps, posts under wings | `decks/OpenMass.tsx`, `decks/deckSteps.ts`, `decks/wingPosts.ts` |
| Standalone decks, boardwalks, bridges | `decks/StandaloneDeck.tsx`, `decks/boardwalk.ts`, `decks/bridges.ts`, `decks/BridgeMesh.tsx` |
| Posts, piers, pilings, slabs, mast, stilts | `foundation/supports.ts`, `foundation/FoundationMesh.tsx`, `foundation/supportParams.ts` |
| Paint mode, exterior colours and finishes | `paint/exterior.ts`, `paint/ExteriorPanel.tsx`, `paint/finishes.ts`, `paint/paintPick.ts` |
| Picking, resizing, moving or turning a wing | `parts/partHandles.ts`, `parts/PartHandleMesh.tsx`, `parts/wingEdits.ts` |
| The + chip and adding a deck, porch, stair, ramp or door | `parts/attach.ts`, `parts/addPart.ts`, `parts/AddChips.tsx` |
| The part inspector, part HUD, Levels panel, shape fields | `parts/PartInspector.tsx`, `parts/PartHud.tsx`, `parts/LevelsPanel.tsx`, `parts/shapeEdits.ts`, `parts/partFields.ts` |
| Curved outlines (ellipse, kidney, blob, ribbon) | `organic.ts`, `outline.ts` |
| How a whole cabin is put together | `masses.ts` (params → masses), `BuildingMesh.tsx` (draws every mass) |

## Folder map

- **Top level (the core model):** `masses.ts` turns a building's params into `Mass[]`, one per main walls and wing. Everything else works on masses. `footprint.ts` holds the footprint shapes, `organic.ts` and `outline.ts` the curves and offsets, and `geom.ts` the triangle builder every mesh uses. `slab.ts` builds a flat floor or slab. `BuildingMesh.tsx` draws a cabin.
- **`walls/`, `roofs/`, `openings/`, `rails/`, `stairs/`, `decks/`, `foundation/`, `paint/`, `parts/`:** each holds its pure maths (`.ts`, tested), its 3D meshes (`*Mesh.tsx`, `*Mass.tsx`) and its panels (`*Panel.tsx`, `*Hud.tsx`).
- Tests sit beside their files. `buildings.test.ts` covers the whole cabin.

## Data: where a building keeps things

A cabin is a `PlanObject` (`../store/types.ts`). Everything here reads its `params`:
- **Main walls:** `params` itself (shape, size, roof, pitch, ridge, overhang, support).
- **Openings:** `params.cuts` (main walls) or `wing.cuts`.
- **Wings:** `params.wings[]`, counted through `wingSlots()` in `masses.ts`.
- **Paint:** `params.ext` (see the header of `paint/exterior.ts`).
- **Rail overrides:** per-edge entries on each wing (see `rails/railEdits.ts`).

These shapes are shared with the old planner. Keep them readable by both.

## Changing data (the store)

The scene never edits a plan directly. Every change goes through a store action, so it is undoable and respects locks:
- **Wings and rails:** `../store/partActions.ts` (`addWing`, `updateWing`, `removeWing`, `resizeMainEdge`, `setRail`, `setRailStyle`, `pickPart`).
- **Openings and paint:** `../store/planStore.ts` (`addOpening`, `updateOpening`, `removeOpening`, `duplicateOpening`, `centreOpening`, `alignHeads`, `fitAllOpenings`, `editExterior`, `setPainting`, `setPaintFocus`, `setPaintScope`, `setRoofsOff`).
- **What each rail edge draws:** `../store/railResolver.ts`.
- The pure edit functions (`*Edits.ts`) return new params, and the actions store them.

## Talks to (open these only when the task crosses over)

- **Uses:** `../store/types` and `planStore`, `../site/units` (FT and unit helpers), and `../site/terrain` and `earthworks` (ground height under a building). From `../scene/`: `meshData`, `Surface`, `buildingLook` (colours by display style), `frame` and `editing`.
- **Used by:** `../export/sheets/` (drawing sheets read masses, walls, roofs, openings and supports), `../paths/` (rails open where paths meet; `partFrame`), `../interiors/` (rooms inside the walls), `../scene/Scene.tsx` (mounts `BuildingMesh` and `PartLayer`). If you change an exported function's signature, search these for its callers.

## Checks for this section

- **Unit tests:** `npx vitest run src/buildings` (fast). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing.
- **Browser tests for building work:** `e2e/parts.spec.ts`, `part-inspector.spec.ts`, `add-menu.spec.ts`, `chips.spec.ts`, `paint.spec.ts`, `shapes.spec.ts`, `fidelity.spec.ts`. Run only the ones the change touches; they're slow under software GL.
- The old planner is the reference for behaviour. Most files name the legacy function they port, so find it with `tools/map.sh def NAME`.
