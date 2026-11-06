# Phase 6 plan: exports and renders

Status: **draft, waiting for Finley's OK** (Nov 6 2026, branch `claude/phase-6-plan`). Claude Code reads this file before starting each part of Phase 6.

**Done when** (from `PLAN.md`): the class deliverables come straight out of the app.

## What's already done

- **Drawing sheets** (Nov 2, brought forward): true-scale floor plans, elevations, a foundation plan and tables, at 1/8", 1/4" or 1/2" = 1'-0", from the **Sheets** button.
- **PNG snapshot** (4D): a picture of the current view, from the Present tab or command search.

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
| **6A · Save the pipeline** | Copy `tools/blender/`, `tools/export/` (as `tools/export-legacy/`) and `HANDOFF-blender-ue5.md` from the old worktree onto a branch from `main`, plus the `.gitignore` lines for `build/`. No changes to the code itself. | Small (under an hour) | The pipeline is committed and merged, and the old worktree is no longer the only copy |
| **6B · 3D model export** | An **Export 3D model** command and button writes a `.glb` and a manifest from the new app's scene, in the pipeline's contract (below), and `tools/export/export_scene.mjs` does the same headless against the dev server | Medium | Scheme C's `.glb` opens in Blender with Terrain, Earthworks, Water and Objects, every building mesh tagged, metres, north up; `check_export.py` passes; it also opens in SketchUp |
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
- **Texture coordinates:** a `UVMeters` map, 1 unit = 1 m. On walls, u runs along the outline and v is the world Z.
- **Manifest:** `<slug>.manifest.json`, with every plan object's params, the sun, the tide and the saved cameras.
- **Clean meshes:** no selection gizmos, chips or labels in the file.

## Decisions (say if you disagree)

- **6A copies the pipeline as it is,** without reviewing or changing it. The review happens in 6C, once it runs on the new export.
- **The old exporter is kept** as `tools/export-legacy/` until 6B passes, then removed.
- **SketchUp:** 6B writes `.glb`. SketchUp needs an import extension for glTF; if yours can't open it, 6B adds an `.obj` download too.
- **Two tracks at once:** after 6B, the Blender/Unreal parts and the in-app parts can run in separate sessions in parallel, because they never touch the same files.
- **The Render button (6J) is last in the app track.** The renders from Blender (6C/6D) are the photo-quality stills for now, and the class sheets (6H, 6I) matter more.
- **Unreal 5.8 specifics** (Nanite tessellation, the Python API) get checked against the installed engine in 6G, not guessed.
