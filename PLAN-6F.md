# 6F · Unreal scene export

Status: **built; at check-in B** (Nov 14 2026, branch `claude/phase-6f-unreal-export-18dd15`, cut from `scheme-c-only`). Check-in A was waived for this part (deadline Nov 19). Results are at the end of this page.

`tools/blender/export_unreal.py` builds the dressed Scheme C scene the way `build_scene.py` does and writes it out for Unreal: one `.glb` per group, plus `scene.json`, which tells 6G everything a `.glb` can't hold.

## Inputs

| What | Where | Notes |
|---|---|---|
| The app's export | `--glb build/3d/export/c-prow-lantern.glb` + its manifest | Re-exported from this branch with `tools/export/export_scene.mjs`, so it is Scheme C as the `scheme-c-only` line has it |
| 6E's bake | `build/3d/unreal/textures/materials.json` and `<set>/T_<set>_{BC,ORM,H,N}.png` | Found in the main checkout's `build/` (Nov 9, 4096 px, 25 sets, all pass). `--textures DIR`; by default the first of this checkout's and the main checkout's `build/3d/unreal/textures` that holds a `materials.json`. Never re-baked here |
| `styles.json` | `tools/blender/styles.json` | The same file `build_scene.py` and the bake read |

## Outputs (`build/3d/unreal/scene/`, beside the textures; gitignored)

`build/3d/unreal/` as a whole (`textures/` + `scene/` + `README.md`) is a self-contained bundle: every path in `scene.json` is relative to it and the app's manifest is copied in, so it can be copied to another machine (2.7 GB; the biggest file is 97 MB).

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
- **Check-in B, from the files (Nov 14, after Finley moved all Unreal work to the Windows 5090 PC because Unreal crashes on the Mac):** `tools/blender/verify_unreal_export.py` re-imports every `.glb` into a clean Blender scene and checks what the export claims. It renders the result from above and from every `scene.json` camera in place of Unreal screenshots. The same check runs in Unreal on the PC: `tools/unreal/check_6f.py`, started by `run_islandale_pc.bat`.
- **The earlier run in Unreal on the Mac** (superseded, kept for the record): `tools/unreal/check_6f.py` ran in the full editor (`-ExecutePythonScript`; the commandlet can't place actors) in a throwaway project outside the repo. It imports every `.glb` with Interchange, places them at the origin with a sun from `scene.json`, and reads the bounds back: the sea's Z = tide × 100, each building's lowest point on the ground under it, and the app's north (the bay is south-east of the cabins) at −Y. It then saves a top-down screenshot and one from a `scene.json` camera. Every Unreal call is checked against the installed engine first. If the headless editor can't render, the report says what failed and gives the editor steps.

## Results (Nov 14)

- **Tests:** 22 pure tests (frames, rotations, names, UV0, scene.json) and 2 Blender tests (corner weld; UV0 and axes read back out of a real `.glb`) pass. `check_export.py` passes on the fresh export.
- **The run on Scheme C** (exported from this branch, 86,437 triangles):
  - 9 files in 7.5 s, 8.9 MB: terrain 23,662 triangles, sea 2, earthworks 21,828, site 7,166, trees 5,360, Elders' wedge 4,158, Family lantern 2,750, Family twin pod 4,240, Gathering prow 17,271.
  - Every triangle accounted for (the 2 missing are the export's clipped water, which the sea replaces).
  - 41 slots, all bound to a 6E set, a blend or a colour.
  - Walls welded on all four straight masses (17 on the prow, 8 on the lantern, 4 on each of the others). The wainscot top is 9.13 m, as in the renders.
- **The seam:** a Blender close-up of the lantern with true displacement shows the corner crack before the weld and an unbroken corner after it (`build_scene.py --weld-walls`).
- **Unreal 5.8.4 (Interchange, Nanite on):**
  - All 9 files import in about 20 s.
  - Every mesh's bounds match `scene.json` within 0.005 cm.
  - The sea sits at exactly 188.976 cm (6.2 ft).
  - Each building's app position (manifest x, n) lies inside its mesh at (100x, −100n), so north is −Y.
  - Straight down through each building, the ground (terrain or its earthworks pad) is hit, and the building's lowest point sits 0.7–2.1 m into it, never above it.
  - The top-down capture matches a top-down of the app's own export, and the shadows fall east under the 272° evening sun.

### Check-in B from the files (`verify_unreal_export.py`, Nov 14, all pass)

- **Files:**
  - every `.glb` passes the structural check (`islandale3d/unreal/gltf.py`; the Khronos validator isn't installed and no download was made): glTF 2.0, chunk lengths, accessors and indices in range, POSITION min/max true, unit normals;
  - attributes are only POSITION, NORMAL and TEXCOORD_0;
  - triangle counts match `scene.json`.
- **Units and axes:** metres in the files (Unreal ×100 into cm). +Y is up in the glTF (terrain elevations 1.25–14.01 m) and north is −Z. Read back as Blender (x, −z, y), every file's raw bounds match `scene.json` within 0.05 mm.
- **Materials:** all 41 names in the files are 6E sets, the wainscot blend, the terrain blend or planner colours, and match each group's `scene.json` slots.
- **Bounds:**
  - each re-imported group matches `scene.json` within 0.05 mm;
  - the terrain covers exactly the app's grid: x −120…120 m, n −100…100 m.
- **North and floor levels:** each building's app position (manifest x east, n north) lies inside it, and all 33 footprint corners of its walled masses have geometry within 5 cm at the floor level and at the wall top. Floor levels: prow 7.072 m, lantern 9.0115 m, twin pod 9.1743 m, Elders' wedge 8.2277 m.
- **Ground:** every support the app tags (`foundation`, `post`, `structure`; 17, 9, 21 and 28 per building) is in the Unreal file. Each one stands on the ground or on other building geometry within 5 cm:
  - on the ground: 9, 5, 11 and 24, with piers reaching 0.55–0.83 m below grade;
  - on a deck: the porch columns, 8, 4, 10 and 4.

  None floats.
- **Sea:** every vertex at 1.88976 m (the 6.2 ft tide); 6 km across.
- **UV0:** one 6 m tile per UV unit. The median |ΔUV| × 6 ÷ edge length is 1.000 on every building, the site, the trees and the sea, and 0.998–1.000 on the ground (gentle slopes keep a plan projection, so the ratio there is the cosine of the slope).
- **Lantern seam:**
  - the 8 wall meshes are one mesh, with 882 vertices welded;
  - at all 8 octagon corners the walls on either side share one vertex column (0.0 mm apart);
  - a Blender close-up with true displacement shows the crack at a corner before the weld and none after it.
- **Renders:** `blender_top_down_north_up.png` and one per camera (9). With them are the evidence files: `verify.json`, and the seam close-ups before and after the weld.
