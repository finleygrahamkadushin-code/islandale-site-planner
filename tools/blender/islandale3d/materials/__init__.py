"""Material registry: every module in this package (other than common) that defines MATERIALS = {"key": build} is picked up,
so a new material is just a new file. build(**params) -> bpy.types.Material.

A module that fails to import is skipped (and named if the key you asked for is missing), so one half-finished material
never stops the others from rendering."""
import importlib
import pkgutil


def registry():
    out, broken = {}, {}
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_") or info.name == "common":
            continue
        try:
            mod = importlib.import_module(f"{__name__}.{info.name}")
        except Exception as e:  # noqa: BLE001 - reported below when it matters
            broken[info.name] = f"{type(e).__name__}: {e}"
            continue
        for key, fn in getattr(mod, "MATERIALS", {}).items():
            if key in out:
                raise ValueError(f"material {key!r} is defined twice ({info.name})")
            out[key] = fn
    return out, broken


def build(key, **params):
    reg, broken = registry()
    if key not in reg:
        raise KeyError(f"no material {key!r}; known: {sorted(reg)}; modules that failed to import: {broken or 'none'}")
    return reg[key](**params)
