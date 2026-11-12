# 3D model export section

**Export 3D model** (Phase 6B): the scene as drawn, written as `<slug>.glb` plus `<slug>.manifest.json` for Blender (`tools/blender/`) and SketchUp. The top bar's **3D model** button, the "Export 3D model" command and `tools/export/export_scene.mjs` (headless) all run the same code. **Work from this map.**

## How it fits together

1. `ModelExportProbe.tsx` sits in the Canvas (mounted in `../../scene/Scene.tsx`) and hands the live scene to `exportModel.ts`. It also sets `window.islandale.exportModel` for the headless script.
2. `exportModel.ts` (small, loaded with the app) loads `buildExport.ts` only when an export runs. That file then:
   - copies the scene with `collect.ts`;
   - writes the binary with `glb.ts`;
   - builds the manifest with `manifest.ts`.
3. `collect.ts` reads only the named roots: `terrain`, `terrain-patch`, `retaining-walls`, `water` and the `plan` group. It finds each object by `userData.objectId`, skips lines, invisible pick meshes and `sheetSkip` subtrees (interiors are the exception, kept as `interior`), and bakes every mesh into its object's frame. It never changes the live scene.

## The file contract (what Blender reads; keep it)

- **Roots:** `Terrain`, `Earthworks`, `Water`, `Objects`. Under `Objects` there is one node per object, named `<name> #<id>` (`names.ts`), placed at the object group's transform, with extras `{oid, name, t, x, n, rot, floor, grade}`.
- **Meshes:** each is named `<name> #<id>|<part>|m<mi>|e<ei>|<k>`, with extras from `tags.ts`. Wall kind, roof material, rail style and colour come from `extResolve`, the lookup Paint mode uses.
- **Walls:**
  - A straight mass gets **one mesh per outline edge**: `splitWalls.ts` splits by the triangles' `faceEdges`.
  - A curved mass keeps one wall, `ei 0`.
  - A ceiling with no roof becomes `cap`.
  - Mass-wide cladding is `decor`. When it sits wholly above the wall tops (a gable end) its part is `gable`, and it keeps its wall kind.
- **Manifest:** `islandale-export/1`, `exag: 1`, `site.tide_ft`, and objects with each house mass's world outline, `wallEi`, `base_z` and `height_m`.
- **Checks:** `tools/blender/check_export.py` holds the file to this contract (objects within 1 mm, walls on their outlines, wall heights).

## Start here, by task

| To change… | Open |
|---|---|
| What is in the file, or left out | `collect.ts` |
| A mesh's tags (part, wall kind, roof material …) | `tags.ts` |
| Node and mesh names, the file slug | `names.ts` |
| The manifest | `manifest.ts` |
| The .glb chunks, mesh names and extras on glTF meshes | `glb.ts` |
| The menu row, the command, the toast | `exportModel.ts`, `../../ui/FileMenu.tsx` (File → 3D model), `../../layout/commands.ts` |
| The headless export | `../../../tools/export/export_scene.mjs` |

## Talks to

- **Uses:** `../../buildings/` (`masses`, `footprint`, `paint/exterior`), `../sheets/elevation/sheetTarget` (`isLineLike`, `paints`), `../../site/environment/sun`, `../../present/snapshot` (`downloadBlob`), `../../store/`.
- **Used by:** `../../scene/Scene.tsx` (the probe), `../../ui/FileMenu.tsx`, `../../layout/commands.ts`, `tools/export/export_scene.mjs`.

## Checks for this section

- `npx vitest run src/export/model3d`, then `npx tsc -p tsconfig.app.json --noEmit`.
- `npx playwright test e2e/model-export.spec.ts`.
- The Blender check, after any change to the contract:

```bash
node tools/export/export_scene.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/check_export.py -- --glb build/3d/export/c-prow-lantern.glb
```
