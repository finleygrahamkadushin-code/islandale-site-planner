# 6F · Unreal scene export

Status: **building** (Nov 14 2026, branch `claude/phase-6f-unreal-export-18dd15`, cut from `scheme-c-only`). Check-in A is waived for this part (deadline Nov 19); check-in B is the Unreal screenshots.

`tools/blender/export_unreal.py` builds the dressed Scheme C scene the way `build_scene.py` does and writes it out for Unreal: one `.glb` per group, plus `scene.json`, which tells 6G everything a `.glb` can't hold.

## Inputs

| What | Where | Notes |
|---|---|---|
| The app's export | `--glb build/3d/export/c-prow-lantern.glb` + its manifest | Re-exported from this branch with `tools/export/export_scene.mjs`, so it is Scheme C as the `scheme-c-only` line has it |
| 6E's bake | `build/3d/unreal/textures/materials.json` and `<set>/T_<set>_{BC,ORM,H,N}.png` | Found in the main checkout's `build/` (Nov 9, 4096 px, 25 sets, all pass). `--textures DIR`; by default the first of this checkout's and the main checkout's `build/3d/unreal/textures` that holds a `materials.json`. Never re-baked here |
| `styles.json` | `tools/blender/styles.json` | The same file `build_scene.py` and the bake read |

## Outputs (`build/3d/unreal/scene/`, beside the textures; gitignored)

- `terrain.glb`, `sea.glb`, `earthworks.glb`, `site.glb`, `trees.glb`, and `building_<slug>.glb` for each building (`building_gathering_prow.glb`, `building_family_lantern.glb`, `building_family_twin_pod.glb`, `building_elders_wedge.glb`).
- Each file holds **one mesh object** `SM_<Group>` (all of the group's meshes joined, transforms applied), with one primitive per material slot, so Unreal makes one static mesh per group. Every object sits at the origin: the vertices are already in site coordinates, so placing every actor at (0, 0, 0) puts it exactly where the app has it.
- `scene.json` (shape below), and `export_unreal.log.json` with the counts.

## Groups

From the importer's collections (`importer.Item.kind`): terrain → `terrain`; earthworks → `earthworks`; site objects (pads, the bridge, decks, the cars on a pad) and anything the importer files as Other → `site`; trees → `trees`; each building (house, shop, shed) → its own group, with its interiors and furniture. The export's own clipped Water is dropped; `sea` is the 6 km plane `staging.sea` builds at the tide, as in the renders.

## Axes and units

- **Blender:** metres; X east, Y north, Z up (NAVD88).
- **glTF:** Blender's exporter writes (x, z, −y): +Y up, −Z north.
- **Unreal:** the installed 5.8.4 Interchange reader maps glTF (x, y, z) to (x, z, y) (`GLTFCore/Private/GLTF/ConversionUtilities.h`, `ConvertVec3`) and scales by 100 (`InterchangeGltfPrivate.h`, `GltfUnitConversionMultiplier`). So **Unreal = (100x, −100y, 100z) cm: +X east, +Y south, north = −Y, Z up**, with no rotation in the import. The conversion lives in one pure function, `frame.to_ue`, and every point in `scene.json` is given in both frames.
- **UVs:** UE reads glTF UVs as stored (top-left origin, no flip); Blender's exporter flips v on the way out. So the texel Blender samples is the texel Unreal samples.
- **Sun:** a DirectionalLight shines along its +X. From azimuth A (from north, clockwise) and elevation E: pitch = −E, yaw = atan2(cos A, −sin A) (in degrees), roll 0.
- **Cameras:** CineCameraActor rotation (pitch, yaw) from the eye-to-target direction in the UE frame; focal length and a 36 mm filmback as in Blender.

## UV0

UV0 = UVMeters / `tile_m` (6 m for every set), so one tile of a 6E texture covers exactly 6 m. The UVMeters map (`uv.py`) is made first, as for the renders, and then becomes the only UV map. Each loose island is then shifted by a whole number of tiles toward 0. The texture is unchanged because the tiles repeat, and the numbers stay small: Unreal stores UVs at half precision unless told otherwise, which at u = 20 tiles would be a 9 cm step. 6G should still turn on full-precision UVs.

## Material names (what 6G binds)

Each glTF material, and so each Unreal material slot, is named for what 6G must make:

| Slot name | What it is | 6G makes |
|---|---|---|
| `<set>` (`kurinuki`, `stucco__aa9d13`, `meadow__63c904` …) | one 6E texture set, by its exact `materials.json` key | `MI_<set>` from the set's master (`ue.master`) |
| `elders_wainscot__<oid>` | a wainscot: the `materials.json` blend, with this building's own top Z | a blend instance; `scene.json` gives `top_z` |
| `terrain` | the meadow-to-beach blend | the terrain blend instance |
| `planner_<rrggbb>` | a surface that keeps the app's colour (interiors, furniture, cars, ceilings) | a plain coloured instance; `scene.json` gives the sRGB colour |

The names come from one pure function (`names.slot_name`), which uses `bake.targets.variant_name`, so a set's slot name and its folder name can't drift apart. Stand-in materials carry a flat colour (the set's mean albedo from its BC map, or the app's colour) so the files look right before 6G binds anything. `--preview-textures` embeds a small copy of each BC map instead, for checking the UVs by eye.

## The lantern corner seam (left from 6D)

On a straight mass (`wallEi: "edge"`), the export makes one wall mesh per outline edge. With displacement on, each one moved on its own and the corners opened up. Before joining, all of a building's outer wall meshes for that mass (part `wall`, not interior or decor) are joined into one object, and coincident vertices within 0.5 mm are welded. The weld is the same one `styling.true_displacement` does inside a mesh, now across the corners. The UVs are already continuous round the corner (u is arc length round the outline), so a welded corner has one position and one UV. Curved masses are already one mesh. `build_scene.py` gets the same weld behind `--weld-walls`, so the renders can show the fix.

## scene.json

`version`, `generated`, `git`, `source` (glb, manifest, its commit), `textures` (folder, `materials.json`, its res and commit), `frames` (the three frames above and the Blender → UE matrix), `exag`, `tide` (ft, m, UE cm), `sun` (season, hour, azimuth, elevation, the direction toward the sun in both frames, the DirectionalLight rotation, plus the app's own sun from the manifest), `cameras` (name, kind, eye and target in m and cm, rotation, focal length, filmback), `groups` (file, mesh name, actor location (0, 0, 0), triangles, slots, bounds in m and cm, and for buildings their lowest point and the ground under them), `materials` (one entry per slot, as in the table), and `blends` (each wainscot's top Z in m and cm; the terrain's shore Z and blend, and whether exaggeration applies).

## Tests and checks

- **Pure tests** (any Python 3, or Blender's): `tools/blender/tests/test_unreal_export.py`. Group assignment, slot names, UV scaling and island shifting, the Blender → UE frame, the sun and camera rotations, and `scene.json` assembly (schema and values from a fake scene).
- **Blender test:** `tests/test_unreal_blender.py`. A two-wall corner welds to one mesh with no gap. A UV-scaled quad exported to `.glb` reads back with TEXCOORD_0 = (u/6, 1 − v/6) and positions as (x, z, −y).
- **The run on Scheme C:** every group written, slot names all in `materials.json` (or a blend or `planner_`), triangle totals match the export, sizes reported.
- **Check-in B in Unreal 5.8.4:** `tools/unreal/check_6f.py` runs under `UnrealEditor-Cmd` in a throwaway project outside the repo. It imports every `.glb` with Interchange, places them at the origin with a sun from `scene.json`, and reads the bounds back: the sea's Z = tide × 100, each building's lowest point on the ground under it, and the app's north (the bay is south-east of the cabins) at −Y. It then saves a top-down screenshot and one from a `scene.json` camera. Every Unreal call is checked against the installed engine first. If the headless editor can't render, the report says what failed and gives the editor steps.
