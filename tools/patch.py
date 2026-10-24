"""Apply exact, unique string replacements to index.html. Usage: python3 tools/patch.py edits.json"""
import json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
f = root / "index.html"
src = f.read_text()
for i, (old, new) in enumerate(json.loads(pathlib.Path(sys.argv[1]).read_text())):
    n = src.count(old)
    if n != 1:
        sys.exit(f"edit {i}: expected 1 match, found {n}: {old[:80]!r}")
    src = src.replace(old, new)
f.write_text(src)
print("applied", i + 1, "edits")
