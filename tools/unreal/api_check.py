"""The Unreal Python names each script needs, and a self-check that runs before anything is changed: on a new machine or
engine version, a missing class or function is reported by name instead of failing halfway through an import.

    import api_check
    api_check.require(api_check.CHECK_6F, log)    # raises MissingApi listing every missing name

describe() is shared with dump_api.py. Each list records how its names were confirmed on Nov 14 (PLAN-6G.md):
"engine" = looked up in the running 5.8.4 engine by dump_api.py; "source" = read in the 5.8.4 engine sources only."""
import unreal

# check_6f.py: all confirmed in the running engine (dump, Nov 14)
CHECK_6F = """
unreal.SystemLibrary.get_engine_version
unreal.InterchangeManager.get_interchange_manager_scripted
unreal.InterchangeManager.create_source_data
unreal.InterchangeManager.import_asset
unreal.ImportAssetParameters
unreal.EditorAssetLibrary.list_assets
unreal.EditorAssetLibrary.load_asset
unreal.StaticMesh
unreal.StaticMesh.get_bounding_box
unreal.StaticMesh.get_num_triangles
unreal.LevelEditorSubsystem.new_level
unreal.LevelEditorSubsystem.save_current_level
unreal.EditorActorSubsystem.spawn_actor_from_object
unreal.EditorActorSubsystem.spawn_actor_from_class
unreal.EditorActorSubsystem.destroy_actor
unreal.UnrealEditorSubsystem.get_editor_world
unreal.Actor.set_actor_label
unreal.Actor.get_actor_bounds
unreal.DirectionalLight
unreal.SkyAtmosphere
unreal.SkyLight
unreal.ExponentialHeightFog
unreal.CineCameraActor
unreal.CineCameraActor.get_cine_camera_component
unreal.SceneCapture2D
unreal.SceneCaptureComponent2D.capture_scene
unreal.SceneCaptureSource
unreal.RenderingLibrary.create_render_target2d
unreal.RenderingLibrary.export_render_target
unreal.TextureRenderTargetFormat
unreal.AutoExposureMethod
unreal.CameraProjectionMode
unreal.SystemLibrary.line_trace_single
unreal.TraceTypeQuery
unreal.DrawDebugTrace
unreal.register_slate_post_tick_callback
unreal.unregister_slate_post_tick_callback
unreal.SystemLibrary.quit_editor
""".split()

# confirmed from the 5.8.4 sources only (EditorPythonScriptingLibrary.h: ScriptName "EditorPythonScripting")
CHECK_6F_SOURCE = ["unreal.EditorPythonScripting.set_keep_python_script_alive"]

# 6G's importer (import_islandale.py), as far as PLAN-6G.md lays it out
IMPORT_6G = """
unreal.AssetImportTask
unreal.AssetToolsHelpers.get_asset_tools
unreal.AssetTools.import_asset_tasks
unreal.AssetTools.create_asset
unreal.EditorAssetLibrary.duplicate_asset
unreal.EditorAssetLibrary.does_asset_exist
unreal.EditorAssetLibrary.save_asset
unreal.InterchangeGenericAssetsPipeline
unreal.InterchangeGenericMeshPipeline
unreal.InterchangeGenericCommonMeshesProperties
unreal.Texture2D
unreal.TextureCompressionSettings
unreal.MaterialFactoryNew
unreal.MaterialInstanceConstantFactoryNew
unreal.MaterialInstanceConstant
unreal.MaterialEditingLibrary.create_material_expression
unreal.MaterialEditingLibrary.connect_material_expressions
unreal.MaterialEditingLibrary.connect_material_property
unreal.MaterialEditingLibrary.recompile_material
unreal.MaterialEditingLibrary.set_material_instance_parent
unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value
unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value
unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value
unreal.MaterialEditingLibrary.update_material_instance
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
unreal.MaterialExpressionSingleLayerWaterMaterialOutput
unreal.DisplacementScaling
unreal.BlendMode
unreal.MaterialShadingModel
unreal.StaticMesh.get_material_index
unreal.StaticMesh.set_material
unreal.StaticMeshEditorSubsystem.set_nanite_settings
unreal.MeshNaniteSettings
unreal.LevelEditorSubsystem.load_level
unreal.EditorActorSubsystem.get_all_level_actors
unreal.PostProcessVolume
""".split()

# 6G names seen only in the 5.8.4 sources: their Python exposure is checked here, on the PC, first
IMPORT_6G_SOURCE = """
unreal.MaterialExpressionMakeMaterialAttributes
unreal.MaterialExpressionMaterialFunctionCall
unreal.MoviePipelineQueueSubsystem
""".split()


class MissingApi(RuntimeError):
    pass


def describe(name: str) -> dict:
    """{"exists": bool, "kind": str, "doc": first lines}. Editor properties are found in their class's docstring."""
    obj = unreal
    for part in name.split(".")[1:]:
        if not hasattr(obj, part):
            doc = getattr(obj, "__doc__", "") or ""
            if f"``{part}``" in doc:
                line = next((ln.strip() for ln in doc.splitlines() if f"``{part}``" in ln), "")
                return {"exists": True, "kind": "editor_property", "doc": line}
            return {"exists": False}
        obj = getattr(obj, part)
    doc = (getattr(obj, "__doc__", "") or "").strip()
    out = {"exists": True, "kind": type(obj).__name__, "doc": "\n".join(doc.splitlines()[:40])}
    if isinstance(obj, type) and issubclass(obj, unreal.EnumBase):
        out["members"] = sorted(m for m in dir(obj) if m.isupper())
    elif isinstance(obj, type):
        out["editor_properties"] = [ln.split("``")[1] for ln in doc.splitlines() if ln.strip().startswith("- ``")]
    return out


def missing(names) -> list:
    return [n for n in names if not describe(n)["exists"]]


def require(names, log=unreal.log) -> None:
    """Stop before any change if this engine lacks a name the script needs, and say which."""
    gone = missing(names)
    engine = unreal.SystemLibrary.get_engine_version()
    if gone:
        raise MissingApi(f"Unreal {engine} lacks {len(gone)} Python name(s) this script needs: {', '.join(gone)}. "
                         "Nothing was changed. Check the engine version (5.8.x) and that the Python Editor Script Plugin "
                         "and Editor Scripting Utilities are enabled.")
    log(f"self-check: all {len(names)} Unreal names found in {engine}")
