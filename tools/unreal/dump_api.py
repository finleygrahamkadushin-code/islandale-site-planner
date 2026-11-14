"""Record which Unreal Python names exist in the installed engine, with their docstrings, so scripts are written against
the real API (5.8.4), not a guess. Runs inside Unreal:

    UnrealEditor-Cmd <Project>.uproject -run=pythonscript -script="tools/unreal/dump_api.py <out.json> [names.txt]"

names.txt: one dotted name per line (unreal.Class, unreal.Class.method, unreal.Class.property); # starts a comment.
Without it, the names in DEFAULT_NAMES. Writes {name: {"exists": bool, "kind": ..., "doc": first lines}}."""
import json
import sys

import unreal

DEFAULT_NAMES = """
unreal.SystemLibrary.get_engine_version
unreal.InterchangeManager.get_interchange_manager_scripted
unreal.InterchangeManager.import_asset
unreal.InterchangeManager.import_scene
unreal.ImportAssetParameters
unreal.InterchangeGenericAssetsPipeline
unreal.InterchangeGenericMeshPipeline
unreal.InterchangeGenericCommonMeshesProperties
unreal.InterchangeGenericMaterialPipeline
unreal.InterchangeSourceData
unreal.InterchangeManager.create_source_data
unreal.AssetImportTask
unreal.AssetToolsHelpers.get_asset_tools
unreal.AssetTools.import_asset_tasks
unreal.EditorAssetLibrary.does_asset_exist
unreal.EditorAssetLibrary.load_asset
unreal.EditorAssetLibrary.list_assets
unreal.EditorAssetLibrary.save_asset
unreal.EditorAssetLibrary.delete_directory
unreal.EditorAssetLibrary.make_directory
unreal.LevelEditorSubsystem.new_level
unreal.LevelEditorSubsystem.load_level
unreal.LevelEditorSubsystem.save_current_level
unreal.EditorActorSubsystem.spawn_actor_from_object
unreal.EditorActorSubsystem.spawn_actor_from_class
unreal.EditorActorSubsystem.get_all_level_actors
unreal.EditorActorSubsystem.destroy_actor
unreal.UnrealEditorSubsystem.get_editor_world
unreal.StaticMeshActor
unreal.StaticMeshComponent.set_static_mesh
unreal.StaticMesh.get_bounding_box
unreal.StaticMesh.get_bounds
unreal.StaticMesh.get_num_triangles
unreal.StaticMesh.nanite_settings
unreal.MeshNaniteSettings
unreal.StaticMeshEditorSubsystem.set_nanite_settings
unreal.StaticMeshEditorSubsystem.get_nanite_settings
unreal.StaticMesh.static_materials
unreal.StaticMaterial
unreal.DirectionalLight
unreal.DirectionalLightComponent
unreal.SkyAtmosphere
unreal.SkyLight
unreal.SkyLightComponent
unreal.ExponentialHeightFog
unreal.PostProcessVolume
unreal.CineCameraActor
unreal.CineCameraComponent
unreal.CameraFilmbackSettings
unreal.SceneCapture2D
unreal.SceneCaptureComponent2D
unreal.SceneCaptureComponent2D.capture_scene
unreal.SceneCaptureSource
unreal.TextureRenderTarget2D
unreal.TextureRenderTargetFormat
unreal.RenderingLibrary.create_render_target2d
unreal.RenderingLibrary.export_render_target
unreal.AutomationLibrary.take_high_res_screenshot
unreal.AutomationLibrary.finish_loading_before_screenshot
unreal.SystemLibrary.quit_editor
unreal.SystemLibrary.execute_console_command
unreal.register_slate_post_tick_callback
unreal.unregister_slate_post_tick_callback
unreal.Rotator
unreal.Vector
unreal.MaterialEditingLibrary.create_material_expression
unreal.MaterialEditingLibrary.connect_material_property
unreal.MaterialEditingLibrary.connect_material_expressions
unreal.MaterialEditingLibrary.recompile_material
unreal.MaterialEditingLibrary.set_material_instance_parent
unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value
unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value
unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value
unreal.MaterialEditingLibrary.update_material_instance
unreal.MaterialFactoryNew
unreal.MaterialInstanceConstantFactoryNew
unreal.MaterialInstanceConstant
unreal.Material
unreal.MaterialProperty
unreal.MaterialExpressionTextureSampleParameter2D
unreal.MaterialExpressionScalarParameter
unreal.MaterialExpressionVectorParameter
unreal.MaterialExpressionTextureCoordinate
unreal.MaterialExpressionWorldPosition
unreal.MaterialExpressionComponentMask
unreal.MaterialExpressionMultiply
unreal.MaterialExpressionLinearInterpolate
unreal.MaterialExpressionSmoothStep
unreal.MaterialExpressionIf
unreal.MaterialExpressionStep
unreal.MaterialExpressionWorldAlignedTexture
unreal.MaterialExpressionSingleLayerWaterMaterialOutput
unreal.MaterialShadingModel
unreal.BlendMode
unreal.Texture2D
unreal.TextureCompressionSettings
unreal.TextureFactory
unreal.TextureMipGenSettings
unreal.StaticMeshComponent.set_material
unreal.AssetTools.create_asset
unreal.EditorLevelLibrary
unreal.EditorLoadingAndSavingUtils.save_dirty_packages
unreal.Paths.project_saved_dir
unreal.SystemLibrary.line_trace_single
unreal.HitResult
unreal.HitResult.to_tuple
unreal.TraceTypeQuery
unreal.DrawDebugTrace
unreal.Actor.get_actor_bounds
unreal.Actor.set_actor_label
unreal.CineCameraActor.get_cine_camera_component
unreal.CineCameraComponent.filmback
unreal.CineCameraComponent.current_focal_length
unreal.CameraProjectionMode
unreal.SceneCaptureComponent2D.fov_angle
unreal.SceneCaptureComponent2D.ortho_width
unreal.SceneCaptureComponent2D.projection_type
unreal.SceneCaptureComponent2D.capture_source
unreal.SceneCaptureComponent2D.texture_target
unreal.SceneCapture2D.capture_component2d
unreal.DirectionalLight.light_component
unreal.DirectionalLightComponent.atmosphere_sun_light
unreal.SkyLight.light_component
unreal.SkyLightComponent.real_time_capture
unreal.EditorAssetLibrary.delete_asset
unreal.EditorAssetLibrary.duplicate_asset
unreal.InterchangeGenericAssetsPipeline.mesh_pipeline
unreal.InterchangeGenericAssetsPipeline.material_pipeline
unreal.InterchangeGenericAssetsPipeline.common_meshes_properties
unreal.InterchangeGenericMeshPipeline.build_nanite
unreal.InterchangeGenericMeshPipeline.combine_static_meshes_behavior
unreal.InterchangeGenericMeshPipeline.collision
unreal.InterchangeGenericMeshPipeline.fallback_collision_type
unreal.InterchangeGenericCommonMeshesProperties.use_full_precision_u_vs
unreal.InterchangeGenericCommonMeshesProperties.recompute_normals
unreal.InterchangeGenericCommonMeshesProperties.recompute_tangents
unreal.InterchangeGenericMaterialPipeline.material_import
unreal.StaticMesh.get_material
unreal.StaticMesh.set_material
unreal.StaticMesh.get_material_index
unreal.MeshBuildSettings
unreal.StaticMeshEditorSubsystem.get_lod_build_settings
unreal.StaticMeshEditorSubsystem.set_lod_build_settings
unreal.MaterialExpressionDisplacement
unreal.Material.displacement_scaling
unreal.Material.enable_tessellation
unreal.DisplacementScaling
unreal.MaterialExpressionTextureObjectParameter
unreal.MaterialExpressionVertexNormalWS
unreal.MaterialFunctionMaterialLayer
unreal.MaterialInstanceConstant.set_editor_property
unreal.Texture2D.compression_settings
unreal.Texture2D.srgb
unreal.Texture.max_texture_size
unreal.TextureCompressionSettings.TC_NORMALMAP
unreal.TextureCompressionSettings.TC_MASKS
unreal.TextureCompressionSettings.TC_DISPLACEMENTMAP
unreal.TextureCompressionSettings.TC_GRAYSCALE
unreal.Texture2D.flip_green_channel
unreal.ExponentialHeightFogComponent
unreal.PostProcessSettings
unreal.WorldSettings
unreal.EditorLevelUtils
unreal.LevelEditorSubsystem.get_current_level
unreal.EditorActorSubsystem.get_actor_reference
unreal.Actor.tags
unreal.Actor.get_actor_label
unreal.SceneCaptureComponent2D.post_process_settings
unreal.SceneCaptureComponent2D.always_persist_rendering_state
unreal.SceneCaptureComponent2D.post_process_blend_weight
unreal.PostProcessSettings.override_auto_exposure_method
unreal.PostProcessSettings.auto_exposure_method
unreal.AutoExposureMethod
unreal.PostProcessSettings.override_auto_exposure_bias
unreal.PostProcessSettings.auto_exposure_bias
unreal.PostProcessSettings.override_auto_exposure_apply_physical_camera_exposure
unreal.PostProcessSettings.auto_exposure_apply_physical_camera_exposure
unreal.DirectionalLightComponent.intensity
unreal.LightComponent.set_intensity
unreal.StaticMeshComponent
unreal.StaticMeshActor.static_mesh_component
unreal.EditorAssetLibrary.save_directory
unreal.EditorAssetLibrary.does_directory_exist
unreal.SystemLibrary.get_project_directory
""".split()


def describe(name):
    parts = name.split(".")
    obj = unreal
    for p in parts[1:]:
        if not hasattr(obj, p):
            # editor properties are not attributes of the class; look them up in the class docstring
            doc = getattr(obj, "__doc__", "") or ""
            if f"``{p}``" in doc:
                line = next((ln.strip() for ln in doc.splitlines() if f"``{p}``" in ln), "")
                return {"exists": True, "kind": "editor_property", "doc": line}
            return {"exists": False}
        obj = getattr(obj, p)
    kind = type(obj).__name__
    doc = (getattr(obj, "__doc__", "") or "").strip()
    out = {"exists": True, "kind": kind, "doc": "\n".join(doc.splitlines()[:40])}
    if isinstance(obj, type) and issubclass(obj, unreal.EnumBase):
        out["members"] = sorted(m for m in dir(obj) if m.isupper())
    elif isinstance(obj, type):
        out["editor_properties"] = [ln.split("``")[1] for ln in doc.splitlines() if ln.strip().startswith("- ``")]
    return out


def main(argv):
    out = argv[0]
    names = DEFAULT_NAMES
    if len(argv) > 1:
        names = [ln.split("#")[0].strip() for ln in open(argv[1]) if ln.split("#")[0].strip()]
    result = {"engine": unreal.SystemLibrary.get_engine_version(), "names": {n: describe(n) for n in names}}
    with open(out, "w") as f:
        json.dump(result, f, indent=1)
    missing = [n for n, r in result["names"].items() if not r["exists"]]
    unreal.log(f"DUMP_API {len(names)} names, {len(missing)} missing: {missing}")


main(sys.argv[1:])
