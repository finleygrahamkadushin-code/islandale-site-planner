# Blender pipeline

This folder turns the planner's 3D export into a Blender scene with real exterior materials, and renders it. The Unreal steps (6E–6G) will start from here; see `PLAN-PHASE6.md`.

```
app (Export 3D model)  ─►  <slug>.glb + <slug>.manifest.json  ─►  check_export.py  ─►  build_scene.py  ─►  .blend + renders
tools/export/export_scene.mjs (the same export, headless)
```

Everything generated goes to `build/3d/`, which git ignores. Units are metres; the axes are X east, Y north, Z = NAVD88 elevation.

## Commands (from the repo root)

```bash
# 1. Export Scheme C from the new app, headless (starts its own dev server; about 20 s)
node tools/export/export_scene.mjs                # --scheme C2, --plan my.plan.json, --no-interiors, --out DIR

# 2. Check the file against its manifest (exits 1 on a failure)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/check_export.py -- \
    --glb build/3d/export/c-prow-lantern.glb

# 3. Build the scene (4 s), and with --render, one PNG per camera in build/3d/renders/
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/build_scene.py -- \
    --glb build/3d/export/c-prow-lantern.glb [--render --true-displacement --res 1920x1080 --samples 128] \
    [--season jun|sep|dec --hour 17 --tide-ft 6.2] [--only "Gathering prow"]

# One material on a test cabin, plus a seamless-tiling check
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/swatch.py -- \
    --material ledgestone_warm [--on walls|roof|ground] [--tile-test] [--true-displacement]
```

You can also save the files from the app: the top bar's **3D model** button. Open the app in the Realistic style first, because trees, pads and the ground keep the colours shown on screen.

## Files

| File | What it does |
|---|---|
| `check_export.py` | Imports the export into an empty Blender and checks it against the manifest. Every object must sit within 1 mm and 0.01° of its manifest position. Every exterior wall mesh must lie on its mass outline, with its `ei` the edge carrying most of its area, and run from the mass base to its top. |
| `build_scene.py` | Builds the scene end to end: import, materials, sea, sun, cameras, and optionally render. |
| `islandale3d/importer.py` | Imports the `.glb`, reads the manifest, and sorts every mesh into the Terrain, Water, Earthworks, Buildings (one collection per building), Site, Trees or Other collection. It indexes each mesh by its tags. |
| `islandale3d/styling.py` | Gives each mesh its `UVMeters` map (`uv.py`) and its material from `styles.json`. Wainscots blend by world height, and the terrain blends to beach. Optionally adds true displacement. |
| `islandale3d/staging.py` | The sun, using the planner's own model for 48.46° N; a sea out to the horizon at the tide; and the cameras: an aerial over the bay, plus a hero view and a wall close-up for each building. Also the Cycles settings. |
| `islandale3d/uv.py` | World-scale UVs: 1 unit = 1 m. On walls, u runs along the mass outline (unbroken round curves and corners) and v is the world Z. Roofs run down the slope; flat faces use world x and y. |
| `islandale3d/materials/` | The procedural materials, one module per family. |
| `styles.json` | Which material each surface wears. |
| `swatch.py` | Renders one material on a test cabin. |

## What the export must contain

`src/export/model3d/CLAUDE.md` describes the file in full. What this folder relies on:
- **Top-level nodes:** `Terrain`, `Earthworks`, `Water` and `Objects`.
- **One node per plan object:** `<name> #<id>`, with extras `oid, name, t, x, n, rot, floor`.
- **Mesh extras:** `part`, `mi`, `ei`, `wallKind`, `roofMat`, `railStyle`, `interior` and `decor`.
- **Walls:** one mesh per outline edge, or one mesh (`ei 0`) for a curved mass. Gable ends are part `gable`, and they wear their building's wall material.
- **The manifest:** `exag`, `site.tide_ft`, and each house mass's `outline`, `wallEi`, `base_z` and `height_m`.

## Which surface wears what (`styles.json`)

A building mesh's material is found in this order:
1. The building's own entry in `buildings` (the first pattern matching its name). For a gable, that's `parts.gable`, else `parts.wall`.
2. The planner's wall kind (`defaults.wall_kinds`), roof material (`defaults.roof_mats`) or rail style (`defaults.rail_styles`).
3. `defaults.parts`.

A part's entry can take three forms:
- a material key;
- `{"material": key, "params": {...}}` for a tuned copy;
- for walls, `{"material": key, "wainscot": {"material": key, "height_m": 0.9}}`, a stone base under a plain wall. Gables stay plain.

Site surfaces are keyed by role (terrain, shore, earthworks, retaining, water, pads, bridge, deck).

Three kinds of mesh keep the app's colours: the rooms inside (`interior`), the trees (6D) and the ceilings at the wall tops (`cap`, hidden under the roofs).

## The material contract (`islandale3d/materials/common.py`)

- **The node group:** a material is a node group named `IS <Title>`, which `pbr_material` wraps into a Material (named `M_<Title>` by convention).
- **Input:** first `Vector`, the UVMeters coordinates. Then the material's own tunables, including `Tile` (metres, default 6).
- **Outputs:** Base Color, Roughness, Metallic, and Height (metres of relief, + outward). Optionally Alpha, Transmission, Emission Color and AO.
- **Bakeable for Unreal:** the group must be a pure function of `Vector` and its inputs, with no Geometry, Texture Coordinate, Object Info, Attribute, AO, Bevel or Light Path nodes inside. It must also repeat exactly every `Tile`: noise goes through `torus4d`, and courses, boards and panels through `wrapped_cells`. `swatch.py --tile-test` measures the repeat (a mean under 0.01 counts as seamless).
- **Relief:** `mat["is_relief_m"]` holds the largest relief; true displacement only applies where it is at least 2 cm.

**Material keys:** beach, board_batten, cedar, charred_wood, concrete, concrete_slab, copper_roof, deck_boards, flagstone, glass, glass_tinted, gravel, kurinuki, kurinuki_shino, ledgestone_cool, ledgestone_warm, meadow, rigidized_bronze, rigidized_metal, sod_roof, standing_seam, steel, stucco, timber, water, plus `uv_grid` for debugging.

### Adding a material

1. Write it in a module under `islandale3d/materials/` (a new file is fine; files starting with `_` and `common` are skipped). Build it with `new_group` and `pbr_material` from `common.py`, and list it in the module's `MATERIALS = {"key": build}`.
2. Try it with `swatch.py --material <key> --tile-test`, and fix any seam it reports.
3. Name the key in `styles.json`. A key that no module defines stops `build_scene.py`, unless you pass `--allow-missing`, which shows the UV grid in its place.

A module that fails to import is skipped, and named if one of its keys is asked for.

## Gotchas

- **The first Cycles render in a new process can take about 5 minutes** while Metal kernels compile. Later renders are fast.
- **Don't run two heavy Cycles jobs at once** on the Metal GPU. Close-ups with `--true-displacement` are the memory hogs (dicing rate 1.5, at most 7 subdivisions).
- **Kurinuki and ledgestone** only really read as carved with displacement on.
- **Wainscot material names** carry the absolute top Z, for example `M_Stucco_over_M_LedgestoneCool_9.13`.
- **The swatch test cabin's window** shows a thin diagonal line. It comes from the test scene and appears only in swatches.
