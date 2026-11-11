# Site section

The Islandale lot on Lopez Island: the surveyed ground, parcel line and contours, the schemes, the earthworks that reshape the ground (cuts, fills, berms, sunk floors, ponds, retaining walls), the site objects (trees, boulders, meadow, pond, pool, sheds, pads and parked cars), and the environment (sun, sky, season, tide). **Work from this map.** Open only the files the task names, and only open another section when "Talks to" below says the task crosses into it.

## Start here, by task

| To change… | Open |
|---|---|
| Ground height at a point, the survey grid | `terrain.ts`; the data is `data/islandale/terrain.json` (big: never print it) |
| How the ground looks in 3D | `TerrainMesh.tsx`, `terrainGeometry.ts`; surface textures are shared, in `../scene/textures.ts` |
| The parcel line, lot area, shoreline buffer and stakes | `parcel.ts`, `buffer.ts`, `ParcelLine.tsx`, `SiteMarks.tsx`; the data is `data/islandale/parcel.json` |
| Contour lines | `contours.ts` (drawn in `SiteMarks.tsx`) |
| The schemes as the old planner wrote them | `schemes.ts`; the data is `data/islandale/schemes.json` |
| Units and the site frame (metres, x east, n north, NAVD88) | `units.ts`, `types.ts` |
| Shared plane geometry: point in polygon, point to segment (used by every section) | `geom2d.ts` |
| A sunk, bermed or earth-supported building: what it asks of the ground | `earthworks/earthworksSpec.ts` |
| How the ground is cut, filled and benched | `earthworks/earthworksPasses.ts`, `earthworks/earthworksField.ts`; entry point `earthworks/earthworks.ts` |
| Retaining walls along a cut | `earthworks/earthworksWalls.ts` (where they run), `earthworks/RetainingWalls.tsx` (draws them) |
| Ground tints (mud, court, berm, wet margin, cut bank) | `earthworks/earthworksTint.ts` |
| Site rules (5E): setback settings and distances to the shore (with the top-of-bank offset) and lot lines | `rules/setbacks.ts`; the settings are `setbacks` in `../store/planStore.ts`; the panel is `rules/SetbacksPanel.tsx` |
| Lot, buffer, side-setback and tree-zone ground tints | `rules/tints.ts`, applied in `terrainGeometry.ts` (`colourTerrain`) from `TerrainMesh.tsx`; the buffer line is `buffer.ts` |
| The outline the rules measure a building from | `rules/ruleOutline.ts` |
| The code check (setback, lot width, height, guards, handrails, tree zone, route, levels) | `rules/codeCheck.ts` (entry), `rules/codeCheckRows.ts`, `rules/codeCheckRails.ts`, `rules/codeCheckPaths.ts`, `rules/lotWidth.ts`, `rules/height.ts`; panel `rules/CodeCheckPanel.tsx` |
| Program budget (enclosed, covered, deck sq ft; 1,600 sq ft cap) and lot coverage | `rules/program.ts`, `rules/ProgramPanel.tsx`; coverage is `lotFacts.ts` (`coverageOf`) |
| The Designs archive (5F): scheme cards, their summaries and plan thumbnails | `archive/ArchiveDialog.tsx` (shell, lazy), `archive/ArchiveBrowser.tsx` (groups), `archive/SchemeCard.tsx`, `archive/schemeSummary.ts`, `archive/thumbPaths.ts`, `archive/SchemeThumb.tsx` |
| Opening a scheme: ask, load, frame, select the gathering building, message | `archive/openScheme.ts` (the top bar's Scheme list uses it too) |
| Clearances to shore, lot line and nearest object; dimension labels | `rules/clearances.ts`, `rules/ClearanceStats.tsx` (inspector), `rules/ClearanceMarks.tsx` (3D) |
| Pond water level | `earthworks/earthworks.ts` (`pondLevel`), `earthworks/earthworksSpec.ts` (`pondLevelOf`) |
| The ground everything else stands on, with earthworks applied | `earthworks/useEarthworks.ts` (used across buildings and paths) |
| Trees: species, canopy shapes, colours | `objects/treeShapes.ts`, `objects/TreeMesh.tsx` |
| Boulders, meadow grass and flowers, parked cars | `objects/siteObjects.ts`, then `objects/BoulderMesh.tsx`, `objects/MeadowMesh.tsx`, `objects/ParkedCars.tsx` |
| Pools and ponds | `objects/pool.ts`, `objects/PoolMesh.tsx`, `objects/PondMesh.tsx` |
| Pads, lanes, drives, patios draped on the ground; sheds and shops | `objects/drape.ts`, `objects/ObjectMesh.tsx`, `objects/objectGeometry.ts`, `objects/ShedMesh.tsx` |
| Sun position, sky, fog, tide water | `environment/sun.ts`, `environment/SceneEnvironment.tsx` |
| How the sky warms and the haze colour by sun height (4E) | `environment/skyLook.ts` |
| The foam line at the tide and the driftwood (4E) | `environment/shore.ts` (maths), `environment/ShoreMesh.tsx` (draws them); gravel and wet sand are ground colours in `terrainGeometry.ts` (`colourTerrain`) |
| The Sun and tide panel (season, hour, tide) | `environment/EnvironmentPanel.tsx` |

## Folder map

- **Top level (the lot itself):** `islandale.ts` loads the terrain grid and parcel from `data/islandale/`. `terrain.ts` gives ground height, `parcel.ts`, `buffer.ts` and `contours.ts` the lot and its lines, and `schemes.ts` the old planner's schemes. `TerrainMesh.tsx`, `ParcelLine.tsx` and `SiteMarks.tsx` draw them.
- **`earthworks/`:** everything that reshapes the ground. **`objects/`:** things placed on the site that aren't buildings or path pieces. **`environment/`:** sun, sky, tide and their panel.
- Pure maths is in `.ts` files with tests beside them; meshes are `*Mesh.tsx`.

## Data: where the site keeps things

- **The lot (fixed, not in the plan):** `data/islandale/terrain.json` (survey grid, metres NAVD88), `parcel.json` (lot ring, area, shoreline edges) and `schemes.json`. `npm run extract` (`scripts/extract-legacy.mjs`) extracts them from the old planner; don't edit them by hand.
- **Earthworks:** a building's `params.earth` (sink, berm, sides, slope, crest, margin, court, retaining walls and their material; see the `EarthSpec` fields in `earthworks/earthworksSpec.ts`), read together with `params.support`.
- **Site objects:** `PlanObject`s (`../store/types.ts`) of their own types (`tree`, `boulder`, `meadow`, `pond`, `pool`, `pad`, `shed`, `shop`). Their look comes from `params` plus a seed from the object id (`objectSeed`), so they draw the same every time.
- **Environment:** `environment` in the plan store: `{ season, hour, tideFt }` (`Environment` in `../store/types.ts`). It's saved with the plan but isn't an undo step.

## Changing data (the store)

- **Environment:** `setEnvironment` in `../store/planStore.ts` (clamped by `clampEnvironment`).
- **Site objects and earthworks settings:** changed through the general object actions in `../store/planStore.ts` (`setObjectParams` and the move, rotate and resize edits). They're undoable and respect locks. The terrain and lot have their own lock (`siteLocked` / `setSiteLocked`), which is on by default.
- The site's maths is pure: ground and plan data in, numbers out. The meshes read the store; nothing here writes to it directly.

## Talks to (open these only when the task crosses over)

- **Uses:** `../store/types` and `planStore`. From `../scene/`: shared rendering pieces (`Surface`, `textures`, `frame`, `useDisplayStyle`, `useObjectInteraction`, `placement`, `meshData`). From `../buildings/`: `footprint` and `masses`, because earthworks cut round a building's outline.
- **Used by almost everything:** `units.ts`, `types.ts`, `geom2d.ts` and `terrain.ts` are imported across `../buildings/`, `../paths/` and `../export/sheets/`, and `earthworks/useEarthworks.ts` gives buildings and paths the ground they stand on. **Changing an export of `units`, `types`, `geom2d`, `terrain` or `earthworks` touches other sections:** search for its callers before you change its signature.
- **Mounted by:** `../scene/Scene.tsx` (terrain, environment, lot marks, retaining walls) and `../scene/PlanObjects.tsx` (site objects).

## Checks for this section

- **Unit tests:** `npx vitest run src/site` (fast). Then `npx tsc -p tsconfig.app.json` from the repo root. `tsc -p .` checks nothing. A few heavy "every scheme" tests in `src/export/sheets/` can time out when the machine is busy; re-run them alone before you blame a change.
- **Browser tests for site work:** `e2e/graphics.spec.ts` (display styles, saved views, sun settings survive a reload) and `e2e/old-designs.spec.ts` (schemes D–I draw their site objects; about 5 minutes). For earthworks under paths and rails, also run `e2e/paths-rails.spec.ts`.
- The old planner is the reference for behaviour. Files name the legacy function they port (`earthOf`, `earthRebuild`, `poolMesh`, `updateSun` and so on), so find them with `tools/map.sh def NAME`.
