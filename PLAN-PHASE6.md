# Phase 6 plan: exports and renders

Status: **6A and 6B done and merged** (main 18ada9b, hosted home v10); **6C done and merged** (main 2e404a5, hosted home v11); **6D signed off and merged** (Nov 6); **the rest of Phase 6 is planned in `PLAN-PHASE6-REST.md`, waiting for Finley's OK** (Nov 6 2026, branch `claude/phase-6-plan`). Claude Code reads this file before starting each part of Phase 6.

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

- **6C done** (Nov 6, branch `claude/phase-6c-blender-renders`, not merged).
  - **Results:** all 9 cameras render (1920×1080, 128 samples, June 17:00, about 8 minutes on the Mac's GPU), and every house is in its material, gables included. `check_export.py` still exits 0. The only meshes left in the app's colour are interiors, trees and caps.
  - **Fixes:** the deck-step rails and tree wells are tagged in the app, and the exporter inherits a group's part tag. Gables wear the wall. Each close-up camera tries the biggest wall faces in turn, which gives the twin pod its close-up. Fixes from the review: the export check fails a walled mass that has no wall meshes; close-ups skip interior and decor walls; camera names are unique and render file names safe.
  - **New doc:** `tools/blender/README.md`.
  - **Deliberate change from the plan:** displacement is on for 8 cameras. It is **off for the prow close-up**, because true displacement tears the kurinuki wall into shards: the app's walls are loose triangles with T-junctions round the openings, and they crack apart when displaced. Ledgestone and rigidized bronze hold up.
  - **For 6D (from the renders):**
    - Concrete path-step blocks fill the foreground of the lantern and wedge hero shots, because the hero camera only checks its ray to the building, not the frame.
    - Thin white seams show on the ground where the terrain patch meets the terrain.
    - The wedge close-up looks at plain upper stucco, not the wainscot.
    - Kurinuki needs welded, T-junction-free walls (or a remesh) before true displacement.
    - There's no visible sea in the aerial.
    - Trees.

- **6D signed off by Finley and merged** (Nov 6): all 9 cameras with displacement on, sent with a 6C/6D before-and-after.
  - **Ground cracks (the white lines):** the cause wasn't missing patches. Every material with relief displaced the vertices of the export's loose triangles, and they cracked apart on slopes. Relief is now bump except on subdivided building meshes. Exporting every terrain patch, with `check_export` counting them back, was still worth fixing.
  - **Kurinuki:** it wasn't tearing. Raised 3.5 cm, it covered the door and the frames. True displacement now carves inward, so the prow close-up keeps displacement on and no weld was needed.
  - **Cars:** tagged `car` in the app, so they keep their colours. Hero views first look for one where the building's foot is clear at its corners.
  - **Close-ups:** they prefer walls whose foot is above the ground, and aim 1.2 m above the foot on a wall with a wainscot, so the wedge shows its stone base. Wainscots are measured from where the walls leave the ground.
  - **Aerial:** it looks from up the slope over the cabins to the bay ("CAM Aerial to the bay").
  - **Trees:** the trunks (`bark`) and crowns (`crown`) are tagged in the app, with new `madrone_bark` and `leaves` materials. Both are seamless.
  - **Look pass:** a drier meadow (Green Amount 0.24) and a slightly darker stucco (#dcd5c9). AgX "Medium High Contrast" was already on.
  - **Still visible:** a thin light seam at the lantern's corners with displacement on, where each displaced ledgestone wall is its own mesh. That needs the export to keep a straight mass's walls in one mesh with per-face `ei`, or the walls welded across meshes. It's left for whoever picks up 6E, since baking doesn't need it.

## What's left

1. ~~The Blender and Unreal pipeline saved into the repo~~ (6A, done).
2. ~~A 3D model export from the new app~~ (6B, done; you still need to open the `.glb` in SketchUp).
3. ~~Blender renders from the new export, art-directed~~ (6C and 6D, signed off).
4. **Unreal:** bake the textures (6E), export the scene for Unreal (6F), and import it into UE 5.8 (6G).
5. **In-app sheets:** a site plan sheet (6H) and section sheets (6I).
6. **Photo-quality stills in the app:** a Render button (6J).

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
| **6C · Blender on the new export** ✅ done Nov 6 (branch `claude/phase-6c-blender-renders`) | Point `build_scene.py` at 6B's file, fix whatever the importer assumed about the old planner, and re-render all 9 cameras | Small to medium | All 9 renders of Scheme C come out with each house in its material (kurinuki prow, ledgestone lantern, bronze twin pod, stucco and stone elders' wedge), sent to Finley |
| **6D · Art direction** ✅ signed off Nov 6 | One look pass on Finley's notes from 6C: sun, sky and AgX, meadow colour, stucco brightness, nicer trees | Small (one sitting) | Finley signs off on the renders |
| **6E · Bake textures for Unreal** | `tools/blender/bake_textures.py`: one seamless 6 m tile per material (BaseColor, ORM, Height, Normal) plus `materials.json` | Medium | Every material bakes with seam metrics under the threshold; a tiled preview of each is sent to Finley |
| **6F · Unreal scene export** | `tools/blender/export_unreal.py`: a `.glb` per group (terrain, sea, earthworks, site, trees, each building) with UV0 in tiles, plus `scene.json` (sun, tide, cameras, wainscot and terrain blends, axes) | Medium | The files open in UE 5.8 with north and ground contact right |
| **6G · Unreal import** | `tools/unreal/import_islandale.py` (UE editor Python): master materials, one instance per material, Nanite meshes, the level with sky, sun, fog and cameras; safe to run twice | Medium to large | `/Game/Islandale/Maps/Islandale` opens with every house in its material, lit by the planner's sun; a screenshot from each camera is sent to Finley |
| **6H · Site plan sheet** | A new Site sheet in Sheets: lot, contours, buildings, walks, setback bands and buffer line, the code-check and coverage notes, north arrow, scale bar, at true scale | Small to medium | It prints at 1" = 20' (or 1/16") on Tabloid with the 5E numbers matching the app |
| **6I · Section sheets** | One or two cuts per building, chosen on its plan sheet, showing floor, walls, roof, the cut ground, openings and heights in NAVD88 | Medium | A long and a cross section of every Scheme C building print at 1/4" = 1'-0" |
| **6J · Render button** | `three-gpu-pathtracer` from the current camera or a saved view, with progress and Stop, then save as PNG; the live view stays as it is | Medium | A Golden hour still of Scheme C renders on Finley's Mac in a few minutes and saves as PNG |
| **6K · Interiors pass** (added Nov 9) | Interior geometry, light, materials and floor-plan drawing, in four parts K1–K4; see [PLAN-6K.md](PLAN-6K.md) | Medium to large | See PLAN-6K.md, per part |

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

## 6B in detail: 3D model export (done Nov 6)

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

## 6C in detail: Blender on the new export (done Nov 6)

**Goal:** all 9 renders of Scheme C come out of Blender from 6B's export, with each house in its material. Branch `claude/phase-6c-blender-renders`, from `main` (18ada9b).

### What a dry run on 6B's file already shows (Nov 6)

- **Builds:** `build_scene.py` builds the scene in 4 s. Every house gets its own material: kurinuki on the prow (17 meshes), warm ledgestone on the lantern, rigidized bronze on the twin pod, and stucco over a ledgestone wainscot on the elders' wedge.
- **Only 8 cameras, not 9:** the twin pod has no **detail** camera. `_detail_view` in `staging.py` found no clear view of its biggest outward wall face.
- **144 of 583 meshes keep the app's colour.** Most of that is intended:
  - **Rooms inside** (108: furniture, partitions, interior headers and sills): intended, they keep the planner's colours.
  - **Gable ends** (9, tagged `gable` in 6B): `styles.json` doesn't know the part yet, so they don't wear the wall material.
  - **The prow's deck steps** (15, tagged only by type, `house`): the sloped flight rails and the concrete tree-well ring in `buildings/decks/DeckStepsMesh.tsx` carry no `part`. This is the one gap in the app.
  - **Trees** (8): no tree material yet. Nicer trees are part of 6D.
  - **Ceilings at the wall tops** (`cap`, 4): hidden under the roofs.
- **Nothing in `tools/blender` reads the old planner's extra fields** (`massKind`, `matColor`, `species` …), so the importer needs no change for the new file.

### Order of work (one commit each)

1. **Tag the deck steps in the app.** The flight rails become `part: 'rail'` and the tree-well ring `part: 'foundation'`, in `DeckStepsMesh.tsx`. This also lets Paint mode paint them, as rails and foundation; today a click on them paints nothing. A unit test and the paint e2e cover it. This is the only change under `src/`.
2. **Gables wear the wall.** `styling.py` resolves `gable` the way it resolves `wall` (the building's own `parts.gable`, else its `parts.wall`, else the wall kind), and the wainscot rule leaves gables plain, since they sit above the wainscot.
3. **The ninth camera.** Find why the twin pod's detail view is refused (blocked ray, inner faces, or the deck around it) and fix `_detail_view`, without moving the 8 cameras that already work.
4. **A light review of the agent-written code** (`check_export.py`, `importer.py`, `styling.py`, `staging.py`, `uv.py`; the HANDOFF asked for it). Fix real bugs only, each as its own commit, and list the rest as notes. The 27 materials are not reworked: their look is 6D.
5. **`tools/blender/README.md`:** the pipeline, the three commands (export, check, build and render), the material contract, how to add a material, and the gotchas from the HANDOFF. `HANDOFF-blender-ue5.md` then points to it for everything but the Unreal steps.
6. **Render.** All 9 cameras at 1920×1080, 128 samples, June 17:00, with `--true-displacement` so the kurinuki and ledgestone break the silhouette. If the GPU runs out of memory on a close-up, that camera alone is rendered without displacement, and the README says so. Renders go to `build/3d/renders/` (gitignored) and are sent to you with a contact sheet.

### Done when

- `check_export.py` still exits 0 on Scheme C.
- `build_scene.py --render` writes 9 PNGs.
- Every house is in its material, gables included, and the only meshes left in the app's colour are interiors, trees and caps.
- You have the renders.

### Decisions (say if you disagree)

- **Displacement on** for the final renders (slower, but the carving reads). Off stays the default for quick runs.
- **Sun and time:** June 17:00, the pipeline's default (az 272°, el 30°), not the app's saved time (September 14:00). The low west light is what the materials were tuned for. `--season` and `--hour` still change it.
- **Trees stay as the app draws them** until 6D.
- **Renders are not committed** (they're under `build/`). If you want a few kept, they can go in `docs/renders/`.

## 6D in detail: art direction (signed off Nov 6)

**Goal:** one look pass on the 6C renders, until you sign them off. Branch `claude/phase-6d-art-direction`, from `main` (2e404a5).

### What looking into the 6C renders found

| What you see | Why | Fix |
|---|---|---|
| Concrete-looking blocks with a wheel under them, in front of the lantern and wedge hero shots | They are the **parked cars** on the drop-off pad. The app doesn't tag them, so the export calls them `pad`, and Blender dresses them in gravel | Tag the cars `car` in the app (`site/objects/ParkedCars.tsx`), which leaves them in the app's colours, as the old exporter did. The hero cameras also stop framing a car right in front of the lens |
| Thin white lines on the ground | **A 6B bug.** The app draws one earthworks patch per reshaped area and cuts a hole in the terrain for each. The exporter looks the patch up by name, which returns only the first one, so the other holes show as gaps | `collect.ts` takes every `terrain-patch` and every `retaining-walls` group. A unit test with two patches covers it, and `check_export` gets a "no holes" count |
| The kurinuki wall tears with displacement | The app's walls are loose triangles with T-junctions round the openings, so displacement cracks them apart | Weld the wall meshes before subdividing (merge by distance, then remove the T-junctions by triangle fan splits) in `styling.true_displacement`. If that doesn't hold, kurinuki uses bump plus a small displacement scale instead |
| The wedge close-up shows plain upper stucco | `_detail_view` aims at the centre of the biggest face, above the 0.9 m stone base | Aim the close-up 1.2 m above the bottom of the face, so a wainscot shows. Walls without one look the same |
| No sea in the aerial | The aerial looks from the bay toward the land | Swing it so the shoreline and the water are in the frame |
| Low-poly trees in flat colour | Trees have no material | Bark and leaf materials (two new keys) on the app's tree shapes; madrone bark is red-brown and peeling. New tree geometry waits for later |

### The look pass (your notes go here)

The original 6D list was sun, sky and AgX, meadow colour, stucco brightness, and nicer trees. From the 6C renders I'd propose:
- **The meadow:** a touch warmer and drier.
- **Stucco:** brought down a little, so it doesn't clip in the late sun.
- **Colour management:** AgX "Medium High Contrast".
- **Everything else as it is.**

**Tell me what you want changed in the renders.** That list replaces mine.

### Order of work (one commit each)

1. Earthworks: export every patch and retaining wall, with a test. (Fixes 6B; merges first.)
2. The cars tagged `car`.
3. Weld before displacement, or the kurinuki fallback.
4. The close-up height, and the aerial framing.
5. Bark and leaf materials.
6. The look pass.
7. Re-export, `check_export`, re-render all 9 with displacement on, and send them with a contact sheet and a before/after of the 6C set.

### Done when

You sign off on the renders.

## The rest of Phase 6 (6E–6J)

The plan for the remaining parts (tracks, sessions, order, check-ins, and what each needs installed) is in **`PLAN-PHASE6-REST.md`**.

## Decisions (say if you disagree)

- **6A copies the pipeline as it is,** without reviewing or changing it. The review happens in 6C, once it runs on the new export.
- **The old exporter is kept** as `tools/export-legacy/` until 6B passes, then removed.
- **SketchUp:** 6B writes `.glb`. SketchUp needs an import extension for glTF; if yours can't open it, 6B adds an `.obj` download too.
- **Two tracks at once:** after 6B, the Blender/Unreal parts and the in-app parts can run in separate sessions in parallel, because they never touch the same files.
- **The Render button (6J) is last in the app track.** The renders from Blender (6C/6D) are the photo-quality stills for now, and the class sheets (6H, 6I) matter more.
- **Unreal 5.8 specifics** (Nanite tessellation, the Python API) get checked against the installed engine in 6G, not guessed.
