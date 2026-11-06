# Phase 6 plan: exports and renders

Status: **6A and 6B done** (6B approved Nov 6; both on branches, not merged yet) (Nov 6 2026, branch `claude/phase-6-plan`). Claude Code reads this file before starting each part of Phase 6.

**Done when** (from `PLAN.md`): the class deliverables come straight out of the app.

## What's already done

- **Drawing sheets** (Nov 2, brought forward): true-scale floor plans, elevations, a foundation plan and tables, at 1/8", 1/4" or 1/2" = 1'-0", from the **Sheets** button.
- **PNG snapshot** (4D): a picture of the current view, from the Present tab or command search.

## Progress

- **6A done** (Nov 6, branch `claude/phase-6a-save-pipeline`, not merged yet). `tools/blender/`, `tools/export-legacy/` and `HANDOFF-blender-ue5.md` are in the repo; `build/` and `__pycache__/` are ignored. One path changed: `tools/export-legacy/export_scene.mjs` read the old planner from the repo-root `index.html`, which in this repo is the new app's entry page, so it now reads `legacy/islandale-planner.html` (and its git-dirty check looks at that file). That file is not byte-identical to the old worktree's `index.html` (it has the later `ext:` blocks), and the legacy exporter was not run here.

- **6B done** (Nov 6, branch `claude/phase-6b-model-export`, cut from the 6A branch since 6A isn't merged yet).
  - **What's there:** the top bar's **3D model** button and the "Export 3D model" command download `c-prow-lantern.glb` (about 10 MB, 17 objects, 583 meshes, 84k triangles) and its manifest. `tools/export/export_scene.mjs` does the same headless in about 20 s. Code is in `src/export/model3d/` (map inside).
  - **Checks:** `check_export.py` exits 0 on Scheme C (no position or wall failures, 33 wall meshes), `build_scene.py` builds the scene from it with every house in its material, and the unit and e2e tests pass. `tools/export-legacy/` is removed.
  - **Not done:** opening the file in SketchUp (Finley); the glossary word for glTF was dropped, since the button's tooltip explains it and nothing else uses the word.
  - **Deliberate changes from the plan:**
    - Gable ends (mass-wide wall cladding wholly above the wall tops) are tagged `gable`, not `wall`, because they don't lie on the footprint outline and the checker requires every wall mesh to. They keep `wallKind` and colour. **6C:** add `gable` to `styles.json` (in each building's `parts` and in `defaults.parts`) so gables wear the wall material; until then they keep the app's colour.
    - A ceiling drawn where a mass has no roof is `cap`.
    - Colours of non-building pieces (trees, pads, terrain) follow the display style on screen, so export from Realistic.

## What's left

1. **The Blender and Unreal pipeline**, started Nov 2 and never committed.
   - **Where it is:** only in the worktree `house-exterior-textures-3b6cc5`, which is based on the old repo (206adaa).
   - **What it has:** 27 procedural materials (kurinuki, offset ledgestone, rigidized metal, stucco over a stone wainscot, and more) and a Blender scene builder that renders 9 cameras.
   - **The catch:** its exporter loads the **old planner**. Finley has said not to work on the old planner, so the pipeline needs a new exporter.
2. **A 3D model export** from the new app, as glTF: for SketchUp, and as that new exporter for Blender.
3. **A site plan sheet:** the lot with setbacks, the buffer, coverage and code-check notes (left from 5E).
4. **Section sheets:** cuts through each building.
5. **Photo-quality stills:** a Render button that path-traces the current view.

## Order: small parts, two tracks

Each part is small enough to finish in one sitting. Each gets its own branch, a short plan for Finley's OK, and its own done-when check, and each leaves the app working.

```
6A  Save the pipeline  ─►  6B  3D export from the new app  ─┬─►  Blender track:  6C ─► 6D ─► 6E ─► 6F ─► 6G
                                                              └─►  App track:      6H    6I    6J   (any order)
```

- **6A comes first.** It's quick, and it keeps the uncommitted textures work from being lost.
- **6B comes second.** It's the bridge: the Blender track needs it, and it is also the SketchUp export.
- **After 6B the two tracks are independent.** They touch different files (`tools/blender/` and `tools/unreal/` against `src/`), so they can run in parallel sessions.

| Part | What | Size | Done when |
| --- | --- | --- | --- |
| **6A · Save the pipeline** ✅ done Nov 6 (branch `claude/phase-6a-save-pipeline`) | Copy `tools/blender/`, `tools/export/` (as `tools/export-legacy/`) and `HANDOFF-blender-ue5.md` from the old worktree onto a branch from `main`, plus the `.gitignore` lines for `build/`. No changes to the code itself. | Small (under an hour) | The pipeline is committed and merged, and the old worktree is no longer the only copy |
| **6B · 3D model export** ✅ done Nov 6 (branch `claude/phase-6b-model-export`) | An **Export 3D model** command and button writes a `.glb` and a manifest from the new app's scene, in the pipeline's contract (below), and `tools/export/export_scene.mjs` does the same headless against the dev server | Medium | Scheme C's `.glb` opens in Blender with Terrain, Earthworks, Water and Objects, every building mesh tagged, metres, north up; `check_export.py` passes; it also opens in SketchUp |
| **6C · Blender on the new export** | Point `build_scene.py` at 6B's file, fix whatever the importer assumed about the old planner, and re-render all 9 cameras | Small to medium | All 9 renders of Scheme C come out with each house in its material (kurinuki prow, ledgestone lantern, bronze twin pod, stucco and stone elders' wedge), sent to Finley |
| **6D · Art direction** | One look pass on Finley's notes from 6C: sun, sky and AgX, meadow colour, stucco brightness, nicer trees | Small (one sitting) | Finley signs off on the renders |
| **6E · Bake textures for Unreal** | `tools/blender/bake_textures.py`: one seamless 6 m tile per material (BaseColor, ORM, Height, Normal) plus `materials.json` | Medium | Every material bakes with seam metrics under the threshold; a tiled preview of each is sent to Finley |
| **6F · Unreal scene export** | `tools/blender/export_unreal.py`: a `.glb` per group (terrain, sea, earthworks, site, trees, each building) with UV0 in tiles, plus `scene.json` (sun, tide, cameras, wainscot and terrain blends, axes) | Medium | The files open in UE 5.8 with north and ground contact right |
| **6G · Unreal import** | `tools/unreal/import_islandale.py` (UE editor Python): master materials, one instance per material, Nanite meshes, the level with sky, sun, fog and cameras; safe to run twice | Medium to large | `/Game/Islandale/Maps/Islandale` opens with every house in its material, lit by the planner's sun; a screenshot from each camera is sent to Finley |
| **6H · Site plan sheet** | A new Site sheet in Sheets: lot, contours, buildings, walks, setback bands and buffer line, the code-check and coverage notes, north arrow, scale bar, at true scale | Small to medium | It prints at 1" = 20' (or 1/16") on Tabloid with the 5E numbers matching the app |
| **6I · Section sheets** | One or two cuts per building, chosen on its plan sheet, showing floor, walls, roof, the cut ground, openings and heights in NAVD88 | Medium | A long and a cross section of every Scheme C building print at 1/4" = 1'-0" |
| **6J · Render button** | `three-gpu-pathtracer` from the current camera or a saved view, with progress and Stop, then save as PNG; the live view stays as it is | Medium | A Golden hour still of Scheme C renders on Finley's Mac in a few minutes and saves as PNG |

## The export contract (6B), so Blender keeps working

This is what the Blender importer (`tools/blender/islandale3d/importer.py`) already reads. 6B matches it, and changes it only where the new app knows more:
- **Units and axes:** metres; X east, Y north, Z = NAVD88 elevation.
- **Top-level nodes:** `Terrain`, `Earthworks`, `Water` and `Objects`.
- **Under `Objects`:** one node per plan object, named `<name> #<id>`.
- **Mesh names:** under each object node, one mesh per drawn piece, named `<name> #<id>|<part>|m<mi>|e<ei>|<k>`.
- **Mesh tags:** glTF extras `part`, `mi`, `ei`, `oid`, `t`, `wallKind`, `roofMat`, `railStyle`. The new app already tags every piece for Paint mode (5D), so this is a read-out, not new bookkeeping.
- **Texture coordinates:** Blender writes its own `UVMeters` map on import (`islandale3d/uv.py`, 1 unit = 1 m, on walls u along the mass outline and v = world Z), so the file needs none. 6B still writes `TEXCOORD_0` in metres, for SketchUp.
- **Manifest:** `<slug>.manifest.json`, with every plan object's params, the sun, the tide and the saved cameras.
- **Clean meshes:** no selection gizmos, chips or labels in the file.

## 6B in detail: 3D model export (plan, waiting for Finley's OK)

**Goal:** an **Export 3D model** button and command in the new app that downloads `<slug>.glb` and `<slug>.manifest.json` in the contract above, and `tools/export/export_scene.mjs`, which does the same headless so Blender can be fed without clicking. Branch `claude/phase-6b-model-export`, cut from `main` after 6A is merged.

### What the Blender side really reads (checked against `importer.py`, `styling.py`, `build_scene.py` and `check_export.py`)

- **The `.glb`:** four top-level nodes found by name: `Terrain`, `Earthworks`, `Water` and `Objects`.
  - Under `Objects` there is one node per plan object, named `<name> #<id>`, with extras `{oid, name, t, x, n, rot, floor, grade}`. Its world origin must be `(x, n, floor)` and its turn about Z must be `rot` degrees counter-clockwise (`check_positions`, tolerance 1 mm and 0.01°).
  - Under each object node are its meshes, named `<name> #<id>|<part>|m<mi>|e<ei>|<k>`, with extras `part, oid, objName, t, mi, ei, k`, plus `wallKind`, `roofMat` and `railStyle` where they apply, and `interior` and `decor` flags.
  - Styling keys on: `t` (house, shop and shed are buildings; pad, bridge, deck, pool and others are site), the object's name (the `styles.json` patterns, such as "gathering prow"), `part`, `wallKind`, `roofMat` and `railStyle`.
- **The manifest:**
  - `exag`.
  - `site.tide_ft`.
  - `objects[]`, each with `node, oid, name, t, x, n, rot, floor`. Buildings also carry `masses[]`, each with `mi`, `outline` (closed polygon, world `[x, n]` metres), `wallEi` (`edge`, `perimeter` or `none`), `base_z` and `height_m`.
  - Everything else in the old manifest (`parcel`, `sun`, `walls[]` per mass, `params`) is informative and kept for Unreal (6F).
- **The wall check is the strict one.** Every exterior wall mesh must lie on its mass outline: its faces must be within 0.75 m and parallel. Its height range must be `base_z` to `base_z + height_m` within 2 cm, unless it is tagged `decor`. A straight mass has **one wall mesh per outline edge**, and its `ei` must be the edge carrying most of its area. A curved mass has one wall mesh with `ei 0`.
- **The sun and cameras are not read from the manifest.** `build_scene.py` takes `--season` and `--hour` and makes its own 9 cameras. 6B still writes the sun and the saved views to the manifest, for Unreal.

### Gaps between the new app and the contract, and how 6B closes them

| Gap | Fix in 6B |
| --- | --- |
| Wall meshes are one per mass and carry `userData.faceEdges` (an edge index per triangle), not one mesh per edge | The exporter splits each straight mass's wall mesh by `faceEdges` into one mesh per edge, `ei` = that edge. A curved mass (`CURVED_SHAPES`) keeps one mesh, `ei 0`, `wallEi: 'perimeter'`. Gable and dome cladding (`massWide`) is tagged `decor` so the height check skips it |
| Meshes carry only `part`; wall kind, roof material, rail style and colour live in the plan | Read them with `extResolve(params, mi, part, edge)`, the same call Paint mode uses, so the file can't disagree with what the app draws. `mi` comes from the nearest ancestor with `userData.mass` (`partFrame.ts`) |
| No object-root names | Find each object by `userData.objectId`, the same walk the elevation sheets use (`sheetTarget.ts`) |
| Scene is Y up, north = −Z (`frame.ts`) | Same as the old planner's glTF, so Blender's import gives X east, Y north, Z = NAVD88 with no change |
| No vertical exaggeration in the new app | `exag` is always 1 (deliberate change, below) |
| Earthworks are baked into the terrain | `Terrain` = the `terrain` mesh; `Earthworks` = `terrain-patch` (part `earthworks`) plus the retaining walls (part `retaining`), which is what `styling.site_spec` asks for |
| UVs are in feet on walls and building polygons | Scale to metres when writing `TEXCOORD_0` |
| Interiors are drawn at `scale = M_PER_FT` with `interiorPart` | Baked into the object frame like everything else; tagged `interior: true` (part `partition` or `furniture`), so Blender keeps their planner colours as before |
| Clutter | Export only `terrain`, `terrain-patch`, `retaining-walls`, `water` and the `plan` group. Inside `plan`, skip `sheetSkip` subtrees, lines (`isLineLike`), invisible materials and anything with `raycast` off (the place ghost). Never touch contact shadows, parcel, site marks, shore foam, gizmos or handles. Chips and labels are DOM, so they never appear |

### Files

New feature folder `src/export/model3d/`, with its own `CLAUDE.md` map. Not `sheets/model/`, which is the sheets' own model.
- `names.ts`: the slug (`C · Prow & Lantern` → `c-prow-lantern`, which `check_export.py` expects by default), node names and mesh names. Pure.
- `tags.ts`: the extras for a drawn mesh, from its `userData`, its ancestors and `extResolve`. Pure, given the plan object.
- `splitWalls.ts`: split a wall `BufferGeometry` by `faceEdges` into one geometry per edge. Pure.
- `collect.ts`: walks the live scene into a clean `THREE.Scene` (new geometries baked into each object's frame, one `MeshStandardMaterial` per look, linear colours, metre UVs). It never changes the live scene.
- `manifest.ts`: the manifest from the plan, terrain and environment. Pure. Same `format: 'islandale-export/1'` and `naming` block as the old one.
- `glb.ts`: `GLTFExporter` (three 0.186's own `examples/jsm`, already installed) to a binary, then the old `finishJson` step: name each glTF mesh after its node and copy the node's extras onto it, so Blender puts them on the mesh data too. This is ported from `tools/export-legacy/glb.mjs`.
- `ModelExportProbe.tsx`: sits in the Canvas next to `ViewProbe` and reads `gl` and `scene` with `useThree`. It answers a request counter in the view HUD store, the same way the PNG snapshot does.
- `exportModel.ts`: puts the pieces together and downloads both files with `downloadBlob` (from `snapshot.ts`). It also sets `window.islandale.exportModel()`, which returns `{ glbBase64, manifest }` for the headless script.

Edits:
- `src/layout/commands.ts`: an `export-3d` command, "Export 3D model (.glb for Blender and SketchUp)".
- `src/ui/TopBar.tsx`: a **3D model** button beside **Sheets**, with the shared tooltip.
- `src/scene/Scene.tsx`: mount the probe.
- `src/guide`: a glossary word for glTF.
- `PLAN-PHASE6.md` and `PLAN.md`: the deliberate changes.

Headless:
- `tools/export/export_scene.mjs` uses the repo's own Playwright, so there is no separate `package.json`. It starts its own `npm run dev` with `PORT=5175` and `ISLANDALE_PLAN_DIR=build/3d/plan-home`, so it never touches Finley's saved plan, or attaches to a running server with `--url`.
- In a fresh browser context it calls `store.loadScheme(id)` (default `C`) or loads `--plan file.json`, waits for the scene to settle (mesh and vertex counts stable, as before), then calls `exportModel()`. It adds `commit` and `dirty` from git, and writes to `build/3d/export/` (default).
- Same flags as the old script, minus `--exag`.

Removed: `tools/export-legacy/`, once Blender's check passes on the new file (the last commit of 6B). Its README lines in `HANDOFF-blender-ue5.md` get updated in the same commit.

### Order of work (one commit each, the app runs after each)

1. `names.ts`, `tags.ts` and `splitWalls.ts` with their unit tests (tests first).
2. `manifest.ts` with tests on Scheme C: every building has masses, outlines are closed, `wallEi` is right for the curved prow, the numbers match the plan.
3. `collect.ts` and `glb.ts`, with a Vitest test that builds a tiny scene (one house, one deck, one tree, a gizmo and a ghost) and checks names, extras, the frame and that the clutter is gone.
4. The probe, the command and the button. An e2e spec (`e2e/model-export.spec.ts`) loads Scheme C, runs the command, catches the download and parses the `.glb`: the four roots, every `Objects` child named `<name> #<id>`, every building mesh with a `part`, no meshes outside the allowed roots.
5. `tools/export/export_scene.mjs`. Then run it on Scheme C, then Blender:
   `Blender -b --factory-startup -P tools/blender/check_export.py -- --glb build/3d/export/c-prow-lantern.glb`
   Fix until it exits 0 (no position failures, no wall-mesh failures). Then remove `tools/export-legacy/`.
6. Check in the browser, then send Finley the `.glb` to open in SketchUp.

### Tests that decide done

- `npm test`, the typecheck (`tsconfig.app.json`) and `npm run test:e2e -- model-export` pass.
- **`check_export.py` exits 0 on Scheme C's export from the new app.** Its report goes in the PR.
- `build_scene.py` runs on it without errors. The render pass is 6C, not 6B.
- Finley opens the `.glb` in SketchUp; if that fails, see the SketchUp decision.

### Decisions (say if you disagree)

- **Exaggeration is fixed at 1.** The new app has no exaggeration slider, and Blender renders want true height. The manifest still says `exag: 1`, so the Blender code is unchanged.
- **Walls are split per edge in the exporter, not in the app.** The app's one-mesh-per-mass walls stay as they are (fast to draw); only the file gets one mesh per edge.
- **Interiors are in the file, tagged `interior`,** as before. A `--no-interiors` flag (and a checkbox later, if wanted) leaves them out for SketchUp.
- **The water plane goes in** as `Water` (Blender replaces it with its own sea anyway); shore foam and driftwood stay out.
- **Meadows and boulders** come out as `t: meadow` and `t: boulder`. The importer files them under "Other" until 6C gives them materials.
- **The in-app download has no git commit** (the browser doesn't know it). Instead it records the app version and the plan's name and time; the headless script adds the commit.
- **It works on the plan as it is now,** including unsaved changes and hidden layers left out, and changes nothing. It is not an action, so nothing goes on the undo stack.

## Decisions (say if you disagree)

- **6A copies the pipeline as it is,** without reviewing or changing it. The review happens in 6C, once it runs on the new export.
- **The old exporter is kept** as `tools/export-legacy/` until 6B passes, then removed.
- **SketchUp:** 6B writes `.glb`. SketchUp needs an import extension for glTF; if yours can't open it, 6B adds an `.obj` download too.
- **Two tracks at once:** after 6B, the Blender/Unreal parts and the in-app parts can run in separate sessions in parallel, because they never touch the same files.
- **The Render button (6J) is last in the app track.** The renders from Blender (6C/6D) are the photo-quality stills for now, and the class sheets (6H, 6I) matter more.
- **Unreal 5.8 specifics** (Nanite tessellation, the Python API) get checked against the installed engine in 6G, not guessed.
