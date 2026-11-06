# Paths section

Walks, ramps, stairs, landings and boardwalks laid as path pieces; the Connect tool that joins two ends; the auto route and the accessible-route check (ADA 2010 §402–405); and the junctions and levels where paths and wings meet a building. **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| What a path piece is: kinds, surfaces, sizes, end levels, slope, stair risers | `pieces.ts` |
| How a path piece looks in 3D | `pieceMesh.ts` (geometry), `PathPieceMesh.tsx` (draws it) |
| The path-piece library and a picked piece's fields | `PathPanels.tsx` |
| What an end snaps to (piece ends, doors, stair tops, deck edges) | `targets.ts`, `snap.ts` |
| The Connect tool: picking two ends and the ways to join them | `connect/connectPlan.ts`, `connect/ConnectPanel.tsx`, `connect/ConnectLayer.tsx` (pick chips) |
| What Connect can pick beyond the snap targets (wing tops, deck edges) | `connect/connectTargets.ts` |
| Stairs as connectors, and the pieces Connect lays | `connect/connectStair.ts`, `connect/connectSpec.ts`, `connect/connectCheck.ts` |
| The accessible-route rules: slope, cross slope, width, landings, rails | `route/routeCheck.ts` |
| Which buildings have an accessible route, and why not | `route/routeVerdict.ts`, `route/routeGraph.ts`, `route/routeCollect.ts` |
| The Accessible route panel and failing-piece chips | `route/RoutePanels.tsx`, `route/RouteChips.tsx` |
| One-click Fix for a failing piece | `route/routeFix.ts` |
| Rebuilding a scheme's old walks (pads, lanes, ribbons) as joined path pieces | `walks/rebuildWalks.ts` (pure); the store action is `rebuildWalks` in `../store/pathActions.ts` |
| Auto route: laying pieces from the driveway to a door | `route/routeAuto.ts`, `route/routeAutoPlan.ts` (switchbacks, runs), `route/routeAutoEmit.ts` (pieces out) |
| Where something meets a building's edge (junctions) | `junctions/junctions.ts` (model), `junctions/junctionsSite.ts` (read from the plan) |
| Threshold plates, filler strips, tabs, and the "6 in step" chips | `junctions/junctionsGeom.ts`, `junctions/junctionsChips.ts`, `junctions/JunctionLayer.tsx` |
| A building's level report, and Fix / Level everything | `junctions/levels.ts`, `junctions/levelsFixes.ts`, `junctions/levelsPanel.ts` (rows); the panel itself is `../buildings/parts/LevelsPanel.tsx` |

## Folder map

- **Top level (the core model):** `pieces.ts` (a piece read from its params), `pieceMesh.ts` and `PathPieceMesh.tsx` (3D), `targets.ts` and `snap.ts` (end snapping), `PathPanels.tsx` (library and fields).
- **`walks/`:** turning the old schemes' walks into path pieces. **`connect/`:** the Connect tool. **`route/`:** the accessible-route check, its Fix and the auto route. **`junctions/`:** junctions and levels.
- Each folder holds its pure maths (`.ts`, tested), its scene chips or meshes and its panels. Tests sit beside their files; `route/routeTestKit.ts` and `junctions/junctionsFixture.ts` are shared test fixtures.

## Data: where a path piece keeps things

A path piece is a `PlanObject` (`../store/types.ts`) of type `pad`. Its `params.kind` is `walk`, `ramp`, `stair`, `landing` or `boardwalk`. By the old rule, a kindless narrow or ribbon pad that isn't a driveway or parking also counts (`isPathPiece()` in `pieces.ts`). A piece runs along its local x from end A to end B:
- **Size:** `params.w` is its length and `params.d` its width, both in feet.
- **End levels:** pinned in `params.ends` (`{zA, zB}`, metres NAVD88), or taken from the ground.
- **Boardwalk height:** `params.lift`, feet over the higher end.
- **Surface:** `params.surface`.

The shapes are shared with the old planner (`ext:walk-model`). Keep them readable by both.

## Changing data (the store)

Every change goes through a store action, so it is undoable and respects locks:
- **Path pieces:** `../store/pathActions.ts`: `addPathPiece` (snapped to what it lands on), `setPieceParams` (with the snapped end held), `continuePiece`, `applyPathEdit` (a Connect, Fix or auto-route result as one undo step).
- **Connect mode:** `../store/planStore.ts` (`connecting` / `setConnecting`). Placing uses `setPlacing`.
- The pure planners here (`connectPlan`, `routeFix`, `routeAuto`, `levelsFixes`) return specs and patches, and the actions apply them.

## Talks to (open these only when the task crosses over)

- **Uses:** `../store/types` and `planStore`, and `../site/types`, `terrain`, `schemes` and `earthworks/` (ground under a piece). From `../buildings/`: `footprint` and `masses` (a building's walls and wings), `rails/railWorld` and `railRules` (rails open where a path lands), and `parts/partFrame` and `attach` (wing tops and edges to land on). From `../site/earthworks/`: `useEarthworks`. From `../scene/`: `frame`, `ScreenChip`, `placement`, `Surface` and `useDisplayStyle`.
- **Used by:** `../scene/Scene.tsx` (mounts the route, connect and junction layers), `../scene/PlanObjects.tsx` (draws pieces), `../ui/SidePanel.tsx` and `Inspector.tsx` (panels), `../store/pathActions.ts` and `planStore.ts`, and `../buildings/parts/LevelsPanel.tsx`. If you change an exported function's signature, search these for its callers.
- **Watch for:** rails on decks open where a path piece lands. That logic lives in `../buildings/rails/railWorld.ts`, so a change to piece ends or targets can move rails.

## Checks for this section

- **Unit tests:** `npx vitest run src/paths` (fast). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing.
- **Browser tests for path work:** `e2e/paths.spec.ts` (Connect, route check, Fix, snapping, locks) and `e2e/paths-rails.spec.ts` (paths follow the hill; rails match the old planner). About 2 minutes together.
- The old planner is the reference for behaviour. Files name the legacy block they port (`ext:walk-model`, `ext:connect`, `ext:join-core` and so on), so find them with `tools/map.sh find NAME`.
