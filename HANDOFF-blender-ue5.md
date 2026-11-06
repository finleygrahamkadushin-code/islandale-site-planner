# Islandale → Blender → Unreal Engine 5: handoff plan

> **Update, Nov 6 2026 (Phase 6A):** this work is now committed in the main repo on branch `claude/phase-6a-save-pipeline`. Where this note says `tools/export/`, read **`tools/export-legacy/`**: it drives the old planner, which now lives at `legacy/islandale-planner.html`, and is kept only until Phase 6B's exporter for the new app replaces it (see `PLAN-PHASE6.md`). The text below is the original Nov 2 handoff, unchanged; the reference photos in `build/3d/reference/` were not copied.

**Read this first.** The work below is **not committed**. It exists only in this git worktree:

```
/Users/finleygraham-kadushin/islandale-site-planner/.claude/worktrees/house-exterior-textures-3b6cc5
branch: claude/house-exterior-textures-3b6cc5   (based on main @ 206adaa)
```

Open the new chat **in that folder**. A fresh worktree made from `main` will not have any of it. Uncommitted changes:
- `.gitignore`, which now ignores `build/`, `node_modules/` and `__pycache__/`.
- New `tools/blender/` and `tools/export/`.

Everything generated (exports, renders, swatches, `.blend`) lives in `build/3d/` and is gitignored.

## Goal (the user's words)

> "we need to work first to go to blender then we go to unreal engine 5 … for the exterior design of the houses … some like Kurinuki texture for one and like the off set stones really unique shapes and textures"

The user also shared three reference photos, copied to `build/3d/reference/`:
- `ref1.png`: a warm offset-ledgestone wainscot.
- `ref2.png`: white stucco, grey stacked stone, warm wood, black frames.
- `ref3.png`: rigidized metal in diamond and dimple patterns.

## Status

| Stage | State |
|---|---|
| Planner → glb + manifest exporter (`tools/export/`) | Done. It works on Scheme C. Built by agents and **not reviewed line by line**. |
| Procedural material library (`tools/blender/islandale3d/materials/`) | Done. 27 materials, all importable, all seamless on a 6 m tile. |
| Scene assembler and renders (`tools/blender/build_scene.py`) | Works end to end on Scheme C: 9 cameras, Cycles on Metal, about 2 min. The latest camera fixes still need checking on a full re-render. |
| Unreal handoff (bake textures → export → UE 5.8 import) | **Not started.** The agent sent to build it was stopped before it wrote any scripts. |
| `tools/blender/README.md` | Not written. |

### Which house wears what (`tools/blender/styles.json`)
- **Gathering prow** (curved prow cabin): `kurinuki` carved-clay walls, `charred_wood` trim, `standing_seam` roof.
- **Family lantern** (octagon): `ledgestone_warm` offset stone all over, `copper_roof` in verdigris.
- **Family twin pod**: `rigidized_bronze` diamond sheet, steel trim.
- **Elders' wedge**: `stucco` over a 0.9 m `ledgestone_cool` wainscot, which blends by world height.
- **Everything else:**
  - Foundations wear `concrete`, slabs `concrete_slab`, decks `deck_boards`, posts and trim `steel`.
  - The terrain is `meadow`, blending to `beach` below 3 m.
  - Pads take `gravel`, or `flagstone` for the firepit; the retaining wall takes `ledgestone_cool`; water is `water`.

## How it works (key contracts)

- **Units and axes:** metres; X east, Y north, Z = NAVD88 elevation. The glTF imports into Blender that way.
- **Materials:** every material is a node group "IS <Title>" (contract in `materials/common.py`).
  - Input: `Vector` = the **UVMeters** UV map. One unit is one metre. On walls, u is the arc length along the planner's outline and v is the **absolute world Z**. Flat surfaces use world x and y.
  - Outputs: Base Color, Roughness, Metallic and Height in metres, plus optional AO, Alpha and Transmission.
  - Every group is a pure function, and repeats exactly every `Tile` (6 m) through `torus4d` and `wrapped_cells`. That is what lets it bake into seamless UE texture sets.
  - `mat["is_relief_m"]` holds the maximum height.
- **Styling:** `styling.py` resolves `styles.json`: the building's own parts first, then the planner's wall kind, roof material or rail style, then the defaults.
  - Pads and decks only dress their own surface. Cars and rails resolve like any other part.
  - Interior and furniture meshes keep the planner's colours.
- **True displacement** (`--true-displacement`): adaptive subdivision, applied only to wall, header, sill, roof and deck meshes whose relief is at least 2 cm.
  - Dicing rate is 1.5, with max subdivisions 7. Without these caps the close-ups ran the GPU out of memory.
  - Kurinuki and ledgestone only really read as carved with displacement on.
- **Lighting:** the sun model is ported from the planner's `updateSun`. Defaults are June, 17:00 (az 272°, el 30°), with the sea at the planner's tide of 6.2 ft.

## Commands (run from the worktree root)

```bash
# 1. Export the planner scene (Playwright + headless Chromium; run `npm install` in tools/export once)
node tools/export/export_scene.mjs --scheme "C · Prow & Lantern" --out build/3d/export

# 2. Swatch one material on a test cabin (+ seamless-tiling check)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/swatch.py -- \
    --material kurinuki [--on walls|roof|ground] [--true-displacement] [--tile-test] [--param "Relief=0.04"] [--out x.png]

# 3. Build the dressed scene (+ render every camera into build/3d/renders/)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/build_scene.py -- \
    --glb build/3d/export/c-prow-lantern.glb --true-displacement --render --res 1920x1080 --samples 128
```

The first Cycles render in a fresh shader cache can take about 5 minutes while Metal kernels compile.

## Next steps, in order

1. **Re-render the scene and review it.** Run command 3 without `--only`, then look at all 9 PNGs in `build/3d/renders/`. These changes were made after the last full render:
   - The hero cameras must now see the building's base. This should stop the hill blocking the prow and the pad blocking the twin pod.
   - The aerial camera is closer (`AERIAL_OUT 0.85`, `AERIAL_UP 0.45` in `staging.py`).
   - Cars and bridge rails no longer wear the pad or deck material.

   Only the lantern detail (fixed: it rendered black when the camera sat inside the octagon) has been re-rendered.
2. **Art-direction pass.**
   - The overall look is a bit washed and flat: pale meadow, bright flat stucco. Try sun power, sky strength and the AgX look in `staging.py`.
   - The trees are the planner's low-poly placeholders.
   - `sod_roof` looks like camouflage. Scheme C doesn't use it.
3. **Unreal handoff** (the main remaining piece). UE 5.8 is installed at `/Users/Shared/Epic Games/UE_5.8`. A stopped agent left a minimal scratch project at `build/3d/unreal/IslandaleUE/`, which you can reuse or delete. Build:
   - **`tools/blender/bake_textures.py`**
     - Bake one 6 m tile per material key through orthographic emission renders, with raw colour management to EXR, encoded with numpy.
     - Pixel centres sit at (i+0.5)·T/N, so the maps wrap.
     - Write BaseColor (sRGB 8-bit), ORM (R = AO, G = Roughness, B = Metallic), Height (16-bit, 0..1 = 0..`is_relief_m`) and Normal (from the height, DirectX green-down).
     - Default resolution 2048, with seam metrics and a `materials.json`. Output goes to `build/3d/unreal/textures/<key>/`.
   - **`tools/blender/export_unreal.py`**
     - Assemble the scene the way `build_scene` does, then set UV0 = UVMeters / 6.
     - Export a `.glb` per group (terrain, sea, earthworks, site, trees, one per building).
     - Write `scene.json` with:
       - layered blends: wainscot `below_world_z`, terrain `z_smoothstep`;
       - the sun azimuth and elevation, the tide, the hero cameras and the axis conventions.
     - Check that north and ground contact come through to UE correctly.
   - **`tools/unreal/import_islandale.py`** (UE editor Python)
     - Textures: BaseColor sRGB; ORM and Height linear; Normal as a normal map.
     - Materials:
       - a master material with Nanite tessellation displacement, if 5.8 supports it; check the 5.8 Python API in the install, don't guess;
       - glass and water masters;
       - a layered world-Z blend master;
       - one material instance per key.
     - Interchange-import the meshes with Nanite on.
     - Build the level `/Game/Islandale/Maps/Islandale` with SkyAtmosphere, a DirectionalLight from the sun, SkyLight, ExponentialHeightFog, a PostProcessVolume and CineCameraActors.
     - Make it idempotent. Validate headlessly with `UnrealEditor-Cmd -run=pythonscript`, time-boxed. If that's blocked, write down the in-editor steps.
4. **Write `tools/blender/README.md`** covering the pipeline, the commands, the material contract and how to add a material. Review `tools/export/*` and `tools/blender/check_export.py`, which agents wrote.
5. **Commit** when the user asks. The repo uses conventional commits with no attribution lines. Never use bare `git stash`.

## Gotchas
- **Metal GPU:** don't run two heavy Cycles jobs at once. Close-ups with true displacement are the memory hogs.
- **The "GateGuard" hook:** it blocks the first Write of a new file. State who calls the file, that nothing else does the same job, and the user's instruction, then retry.
- **Don't resume the old workflow `wf_fc3c71f0-a62`.** Its materials have since been hand-edited, including the masonry module, kurinuki tuning and styling fixes.
- **Wainscot material names** carry the absolute top Z, for example `M_Stucco_over_M_LedgestoneCool_9.13`.
- **The swatch test cabin's window** shows a thin diagonal line. It comes from the test scene and appears only in swatches.
