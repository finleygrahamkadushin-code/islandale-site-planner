# 6G · Unreal level (groundwork)

Status: **groundwork only** (Nov 14 2026, branch `claude/phase-6f-unreal-export-18dd15`). The level is not built yet. This page, the API list below, the size estimate and the `tools/unreal/` skeleton are what 6G starts from.

`tools/unreal/import_islandale.py` turns 6F's export into a finished Unreal level of Scheme C: `/Game/Islandale/Maps/Islandale`. It reads `build/3d/unreal/scene/scene.json` (6F) and `build/3d/unreal/textures/materials.json` (6E) and runs inside the editor, headless (`UnrealEditor-Cmd -run=pythonscript`). It is safe to run twice: every asset has a fixed name, and every actor it spawns carries the tag `islandale6g`, so a rerun replaces them instead of adding copies.

## What it builds, in order (one phase each, `--only` runs a subset)

1. **Textures** (`/Game/Islandale/Textures/<set>/T_<set>_<map>`): only the sets the scene's slots use (24 of the 25 baked; `sod_roof` is worn by nothing). BC in sRGB; ORM linear (`TC_MASKS`); N as a normal map (`TC_NORMALMAP`; the bake is already DirectX, Unreal's convention, so no green flip); H linear 16-bit (`TC_GRAYSCALE`). The settings table lives in `islandale_plan.MAP_SETTINGS`.
2. **Masters** (`/Game/Islandale/Materials/Masters/`):
   - `M_IS_Opaque`: BC, ORM, N sampled at UV0 with a `TileM` scale. Its displacement uses H, centred on `DisplacementCenter` and scaled by `HeightRangeCm`, so it carves inward as in Blender. Nanite tessellation is on by default in 5.8.4 (`r.Nanite.Tessellation 1`, with programmable and compute raster, `RenderUtils.cpp`), but whether Metal on the M4 runs it is checked first. The fallback is no displacement, with the normal map carrying the relief.
   - `M_IS_Glass`: translucent, thin.
   - `M_IS_Water`: Single Layer Water, world-aligned UVs (the sea is one 6 km quad).
   - `M_IS_Foliage`: two-sided, masked.
   - `M_IS_Wainscot`: two layers switched at `TopZCm` by Absolute World Position Z (hard edge).
   - `M_IS_Terrain`: two layers mixed by `smoothstep(ShoreZCm + BlendCm, ShoreZCm − BlendCm, Z)`.
   - `M_IS_Color`: one `BaseColor` vector for the surfaces that keep the app's colours.
   - The natural ground sets (meadow, beach, gravel) get the cell-bombing anti-tiling `materials.json` asks for (`ue.cell_bomb`); the bark gets triplanar (`ue.triplanar`).
3. **Instances** (`/Game/Islandale/Materials/MI_<slot>`): one per scene.json slot, parented to its master, with its texture, scalar and colour parameters filled in from `materials.json` and `scene.json` (`islandale_plan.instances`).
4. **Meshes** (`/Game/Islandale/Meshes/<group>/SM_<Group>`): each group's `.glb` through Interchange with a pipeline copied from the default one: Nanite on (not for the sea), full-precision UVs, no lightmap UVs, collision as complex. Then each material slot is bound by name to `MI_<slot>`.
5. **Level**: every group's mesh at the origin, with no rotation or scale (the vertices are in site coordinates). Also:
   - a DirectionalLight with scene.json's rotation, marked as the atmosphere sun;
   - a SkyAtmosphere;
   - a SkyLight (real-time capture);
   - an ExponentialHeightFog;
   - a PostProcessVolume (unbound, with fixed exposure, so stills match from camera to camera);
   - one CineCameraActor per scene.json camera, with its focal length and a 36 × 20.25 mm filmback.

## Axes (verified in 6F)

Unreal = (100x, −100y, 100z) cm from Blender: +X east, +Y south (north is −Y), Z up in NAVD88 elevation. Each sun and camera rotation in `scene.json` is already an Unreal rotator.

## Check-in B

A still from every scene.json camera (an aerial, plus a hero and a detail view of each of the four buildings) and a top-down view with north up, from whichever machine builds the level.

## Unreal Python APIs it needs (confirmed against the installed 5.8.4)

How each name was confirmed:
- **✓ engine:** looked up in the running 5.8.4 engine on the Mac by `tools/unreal/dump_api.py` (headless commandlet, Nov 14, finished cleanly; the full dump with signatures is `api_dump.json` in the session notes).
- **source:** read in the installed 5.8.4 engine's C++ sources or content folders only.
- **PC:** unconfirmed until it runs on the PC.

No Python stub (`unreal.py`) was ever generated on the Mac. Unreal no longer runs there (it crashes), so nothing more can be confirmed on the Mac. Every script in `tools/unreal/` therefore starts with `api_check.require(...)`, which looks up each name it needs and stops before any change, naming whatever is missing. Unless marked otherwise, the names below are ✓ engine.

- **Import:**
  - ✓ `AssetImportTask`, `AssetToolsHelpers.get_asset_tools`, `AssetTools.import_asset_tasks` (textures).
  - ✓ `InterchangeManager.get_interchange_manager_scripted`, `.create_source_data`, `.import_asset(content_path, source_data, params) -> Array[Object] or None` (meshes; tried in 6F's check: all 9 files in about 20 s).
  - ✓ `ImportAssetParameters` (`is_automated`, `replace_existing`, `override_pipelines` as soft paths to a pipeline asset).
  - ✓ `InterchangeGenericAssetsPipeline.mesh_pipeline` / `.common_meshes_properties`, `InterchangeGenericMeshPipeline.build_nanite` (on by default) / `.combine_static_meshes_behavior`, `InterchangeGenericCommonMeshesProperties.use_full_precision_u_vs`, `InterchangeGenericMaterialPipeline.material_import`.
  - ✓ `EditorAssetLibrary.duplicate_asset`, to copy the default pipeline into `/Game` and tune it.
- **Textures:** ✓ `Texture2D.srgb`, `.compression_settings`, `.flip_green_channel`, `Texture.max_texture_size`; `TextureCompressionSettings` has `TC_DEFAULT`, `TC_MASKS`, `TC_NORMALMAP`, `TC_GRAYSCALE`, `TC_DISPLACEMENTMAP`, `TC_BC7`.
- **Masters:**
  - ✓ `MaterialFactoryNew`, `AssetTools.create_asset`, `MaterialEditingLibrary.create_material_expression` / `.connect_material_expressions` / `.connect_material_property` / `.recompile_material`.
  - Expressions: ✓ `TextureSampleParameter2D`, `ScalarParameter`, `VectorParameter`, `TextureCoordinate`, `WorldPosition`, `ComponentMask`, `Multiply`, `LinearInterpolate`, `SmoothStep`, `Step`, `If`, `SingleLayerWaterMaterialOutput`.
  - ✓ `Material.enable_tessellation`, `Material.displacement_scaling` (`DisplacementScaling`: `magnitude`, `center`), `MaterialShadingModel`, `BlendMode`.
  - ✗ engine: **`MaterialExpressionDisplacement` does not exist**, and the material's Displacement pin `MP_Displacement` is `UMETA(Hidden)` (source: `SceneTypes.h`), so Python's `MaterialProperty` has no member for it. 6G wires displacement another way:
    - **source:** `MaterialExpressionMakeMaterialAttributes` has a `Displacement` input (`MaterialExpressionMakeMaterialAttributes.h:77`); it would feed `MP_MATERIAL_ATTRIBUTES` (✓ engine) with `use_material_attributes` on. **PC:** that the class is exposed to Python and that `connect_material_expressions(…, "Displacement")` accepts the input name.
    - Or, ✓ engine: the mesh-level `MeshNaniteSettings.displacement_maps` / `displacement_uv_channel`, which bake the height into Nanite at build time (one map per mesh, so it suits single-material meshes).
  - ✗ engine: `MaterialExpressionWorldAlignedTexture` is not an expression. **Source:** world-aligned texturing is the engine material function `/Engine/Functions/Engine_MaterialFunctions01/Texturing/WorldAlignedTexture` (the `.uasset` is on disk), called through `MaterialExpressionMaterialFunctionCall` (source; **PC:** its Python exposure).
  - **Source:** the default Interchange pipelines to copy and tune are on disk: `/Interchange/Pipelines/DefaultAssetsPipeline` and `DefaultGLTFAssetsPipeline` (`Engine/Plugins/Interchange/Runtime/Content/Pipelines/`). **PC:** `duplicate_asset` on them.
- **Instances:** ✓ `MaterialInstanceConstantFactoryNew`, `MaterialEditingLibrary.set_material_instance_parent` / `_texture_parameter_value` / `_scalar_parameter_value` / `_vector_parameter_value` / `update_material_instance`.
- **Meshes:** ✓ `StaticMesh.static_materials` / `get_material_index(slot_name)` / `set_material(index, material)`; `StaticMeshEditorSubsystem.get_nanite_settings` / `set_nanite_settings` / `get_lod_build_settings` / `set_lod_build_settings`; `MeshNaniteSettings`, `MeshBuildSettings`.
- **Level:**
  - ✓ `LevelEditorSubsystem.new_level` (refuses a path that exists) / `load_level` / `save_current_level`.
  - ✓ `EditorActorSubsystem.get_all_level_actors` / `destroy_actor` / `spawn_actor_from_object` / `spawn_actor_from_class`; `Actor.tags`, `set_actor_label`.
  - ✓ `DirectionalLight` (`light_component.atmosphere_sun_light`), `SkyAtmosphere`, `SkyLight` (`light_component.real_time_capture`), `ExponentialHeightFog`, `PostProcessVolume`, `CineCameraActor.get_cine_camera_component` (`filmback`, `current_focal_length`).
  - Read-only flags are set with `set_editor_property`.
- **Stills and running unattended:**
  - ✓ `SceneCapture2D` + `SceneCaptureComponent2D.capture_scene`, `RenderingLibrary.create_render_target2d` / `export_render_target` (PNG for 8-bit targets), `AutomationLibrary.take_high_res_screenshot`.
  - ✓ `register_slate_post_tick_callback`, `SystemLibrary.quit_editor`. **Source:** `EditorPythonScripting.set_keep_python_script_alive` (`EditorPythonScriptingLibrary.h`; it also ran in the 6F editor check, which then passed).
  - **Source:** Movie Render Queue for the final stills: `MoviePipelineQueueSubsystem`, `MoviePipelinePIEExecutor`, `MoviePipelineDeferredPassBase`, `MoviePipelineImageSequenceOutput_PNG` (`Engine/Plugins/MovieScene/MovieRenderPipeline/`). **PC:** their Python use.
  - **PC:** hardware ray tracing, the Path Tracer and Nanite tessellation under DirectX 12. These are project settings, not Python, and they are written into `tools/unreal/project_template/Config/DefaultEngine.ini`.

**How it runs (learned in 6F's check):** placing actors needs the full editor. The `-run=pythonscript` commandlet imports assets fine but has no level editor: `spawn_actor_from_object` returns `None`. It also doesn't tick, so shaders never finish compiling there. So the import and asset phases can run in the commandlet, while the level phase and any still run in the editor with `-ExecutePythonScript="… --quit"`, keeping the script alive across ticks.

## Size on disk (estimate)

| Part | Estimate | How it was worked out |
|---|---|---|
| Texture sources inside the `.uasset`s | about 2.5 GB, or about 1.2 GB if the normals are saved 8-bit first | The 24 sets' maps on disk: BC 0.21 GB, ORM 0.18 GB, H 0.53 GB, N 1.62 GB (16-bit). BC5 normal maps are 8-bit per channel anyway, so 16-bit N buys nothing |
| Compressed textures in the DDC | about 2 GB | Per 4096 px set with mips: BC (BC1) 11 MB, ORM 11 MB, N (BC5) 21 MB, H (G16) 43 MB, so about 85 MB × 24 |
| Meshes, materials, the level | under 0.2 GB | The 9 meshes import to a few MB; 6F's throwaway project was 123 MB in all |
| Project shaders, Intermediate, Saved | 1–2 GB | The engine's own shader DDC (2.8 GB) is already built on this Mac and was not touched by 6F |
| **Total** | **about 5–7 GB** | On the PC, add DirectX 12 shader caches on first open (a few GB) |

The bundle that goes to the PC is 2.7 GB (`build/3d/unreal/`; the biggest file is 97 MB).

## Platforms: this Mac and the PC

**Decided (Nov 14): all Unreal work and rendering happen on Finley's Windows PC with an RTX 5090.** Unreal keeps crashing on the Mac ("also unreal keeps crashing so again all the rendering happens on the 5090"). The Mac does the app, the tests and the Blender export; the bundle travels on an ExFAT USB drive. The scripts still run on both, and the Mac notes below are for the record.

Two ways to drive the PC, using the same import code:
- **A Claude session there** starts from `tools/unreal/HANDOFF-PC.md`.
- **Finley alone** double-clicks `tools\unreal\run_islandale_pc.bat`. It makes the project from `tools/unreal/project_template/`, starts the editor with `tools/unreal/pc_run.py`, and writes `run_log.txt` (each step named, errors in plain words), `check.json` and a screenshot per camera into `<bundle>\pc-runs\<date-time>\`, to copy back. Once 6G's importer exists, it becomes a step in `pc_run.py`.

- **The scripts are the same on both.** `tools/unreal/` uses `pathlib` with no hard-coded folders. The bundle folder and the project come in as arguments, and every path inside `scene.json` is relative to it. The scripts need no shell. They run in the engine's own Python (3.11.8 in 5.8.4); no other Python and no Blender are needed on the PC.
- **Shaders compile per platform.** Metal on this Mac, DirectX 12 (SM6) on the PC. Don't copy a project's `DerivedDataCache/` or `Intermediate/` between them; let the PC build its own (the first open takes a while).
- **The PC can turn things up** that this Mac can't, or that weren't checked here:
  - hardware ray tracing (project setting *Support Hardware Ray Tracing*, Lumen in hardware-RT mode);
  - the Path Tracer for final stills through Movie Render Queue;
  - Nanite tessellation for the displacement (on by default in 5.8.4; whether Metal on the M4 runs it is unverified);
  - higher Lumen quality and Virtual Shadow Map resolution.

  6G keeps these in one settings block, so the Mac can run the same level at lower settings.
- **Running headless.**
  - Mac: `…/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor` and `…/UnrealEditor-Cmd`.
  - Windows: `C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe` and `UnrealEditor-Cmd.exe`.
  - On both, the arguments are the same: `-ExecutePythonScript="…"` or `-run=pythonscript -script="…"`.

## What the PC needs before the import runs there

1. **Unreal Engine 5.8.4**, the same as this Mac, from the Epic launcher.
   - Another 5.8.x patch should work: patches don't change the Python API or Interchange's glTF axes.
   - To be sure, run `tools/unreal/dump_api.py` there first and compare its missing names with this Mac's (2 missing, both expected).
2. **A blank project** (no starter content). In it, enable the **Python Editor Script Plugin** and **Editor Scripting Utilities**. Interchange and Interchange Editor are on by default; Movie Render Queue is needed for final stills. Then restart the editor.
3. **Git and this repo** checked out on **`scheme-c-only`** (the scripts are in `tools/unreal/`). The repo needs nothing installed for this step: no npm, Node or Blender.
4. **The bundle:** `build/3d/unreal/` from this Mac (2.7 GB: `textures/`, `scene/`, `README.md`), copied anywhere.
5. **Order:**
   - first `check_6f.py` (the same check that passed here);
   - then `import_islandale.py --scene <bundle>/scene` once 6G is written: its asset phases in the commandlet, its level phase in the editor.

## Learned from 6F's check (lighting)

The scene captures came out with pitch-black shadow sides. The real-time SkyLight added nothing to a SceneCapture2D taken right after the level was built. The stills in 6G should come from Movie Render Queue, or from the editor viewport once the sky capture has updated, with a fixed exposure in the PostProcessVolume.

## What 6G needs from Finley

- **Who drives Unreal on the PC:** a Claude session (from `tools/unreal/HANDOFF-PC.md`), or Finley with `run_islandale_pc.bat`, copying the `pc-runs` folder back.
- **Disk on the PC:** about 5–7 GB for the project, plus the 2.7 GB bundle.
- **The PC set-up** in the list above (Unreal 5.8.4, the two plugins, the repo on `scheme-c-only`, the 2.7 GB bundle).
