# 6E · Bake textures for Unreal

Status: **plan, waiting for Finley's OK** (check-in A, Nov 6 2026, branch `claude/phase-6e-bake-2ec41d`, cut from `claude/phase-6-rest-plan`). Track U, part 1 of 3. No bake code is written until you say OK.

**What it does:** turns every procedural Blender material the scene wears into a plain set of seamless image textures that Unreal can use. Each set is one 6 m × 6 m tile: BaseColor, ORM (AO, Roughness, Metallic), Height and Normal, at 2048 px. It also writes `materials.json`, which tells 6F and 6G what each set is, how deep its relief goes, and how the two blended surfaces (the Elders' wainscot and the meadow-to-beach shore) mix their layers. Every map's seam is measured, and the run fails if one doesn't wrap.

Out of scope for 6E: exporting meshes (6F), anything inside Unreal (6G), and changing how any material looks. If a material fails its seam check, I stop and tell you rather than retune it.

## Files

All new, all in `tools/blender/` (Track U's folder). Nothing in `src/`.

| File | What it does |
|---|---|
| `bake_textures.py` | The entry point, run in Blender: `Blender -b --factory-startup -P tools/blender/bake_textures.py -- [--keys a,b] [--all] [--res 2048] [--samples 16] [--out build/3d/unreal/textures] [--keep-exr] [--no-shift-check] [--contact-only]` |
| `islandale3d/bake/__init__.py` | The one `bake_set(entry, res, samples, out)` the entry point calls per material |
| `islandale3d/bake/targets.py` | Which materials to bake: walks `styles.json` the way `styling.py` resolves it and returns one entry per (key, params) pair, with where it's used. Builds each material through `Styler.material`, so a tuned variant is made exactly as the scene makes it |
| `islandale3d/bake/render.py` | The Blender side: a 6 m plane with `UVMeters`, an orthographic camera, and one emission render per pass to a float EXR |
| `islandale3d/bake/encode.py` | numpy only: linear → sRGB, ORM packing, Height normalisation, Normal from Height, PNG writing (through Blender's image saver, 8- or 16-bit) |
| `islandale3d/bake/seams.py` | numpy only: the seam metrics below |
| `islandale3d/bake/manifest.py` | Writes `materials.json` |
| `islandale3d/bake/contact.py` | The check-in B contact sheet (HTML plus PNG previews) |
| `tests/test_bake_numpy.py` | Fast tests of `encode.py`, `seams.py` and `targets.py`, no rendering |
| `tests/test_bake_blender.py` | One small real bake (256 px) of a known-good and a known-bad material |
| `README.md` | A "Bake for Unreal" section: the command, the outputs, the conventions |

Output goes to `build/3d/unreal/textures/` (gitignored), one folder per set.

## Which materials get baked

Everything `styles.json` can reach, which today is **25 texture sets**: 23 plain keys and 2 tuned variants.

| Where in `styles.json` | Keys |
|---|---|
| The four named buildings | `kurinuki`, `charred_wood`, `standing_seam`, `ledgestone_warm`, `steel`, `copper_roof`, `rigidized_bronze`, `ledgestone_cool` (the Elders' wainscot), **`stucco` with the warm-white `Color`** (Elders' walls, headers, sills) |
| `defaults.parts` | `cedar`, `deck_boards`, `glass`, `concrete`, `concrete_slab`, `timber` (plus `steel`, `standing_seam`, `charred_wood` above) |
| `wall_kinds`, `roof_mats`, `rail_styles` | `board_batten`, `glass_tinted`, `sod_roof` (plus keys above) |
| `site` | **`meadow` with `Green Amount` 0.24** (terrain and earthworks), `beach`, `flagstone`, `gravel`, `water`, `madrone_bark` and `leaves` (the 6D trees) |

- **Tuned variants** are baked under their own name: `<key>__<6 hex chars of a hash of the sorted params>`, for example `stucco__3f9a1c`, with the params written out in `materials.json`. Plain `stucco` and plain `meadow` aren't baked, because nothing wears them untuned. The name only changes if the params change.
- **Not baked unless you pass `--all`:** `kurinuki_shino` and `rigidized_metal` (in the library, unused), and the debug `uv_grid` and `tile_noise`.
- **Glass and water** get a set like any other (their tint, roughness and ripples are real texture), but their see-through part isn't an image: an output that's the same everywhere (glass's Alpha and Transmission) is written as a number in `materials.json`, not as a map. Only an output that varies gets an extra map (`_Opacity`). 6G gives them their own glass and water masters.

### Blends: two layers and a rule, not a baked mix

The two blends depend on where a surface sits in the world, not on the tile, so they can't be baked into one tile. Each is recorded as two baked sets plus a mask rule, for 6F to fill in with real heights and 6G to build as a layered material:

- **Elders' wainscot:** `upper` = the stucco variant, `lower` = `ledgestone_cool`, rule `below_world_z`, `height_m` 0.9, hard edge (exactly as `wainscot_material`: stone where world Z < top). The top Z is per building (measured from the wall foot in `styling.wainscot_bases`), so `materials.json` holds the rule and 6F's `scene.json` holds each building's top Z.
- **Terrain:** `upper` = the meadow variant, `lower` = `beach`, rule `z_smoothstep`, shore at 3.0 m, blend ±0.8 m (as `terrain_material`: smoothstep on the surface's world Z). The heights are in the Blender scene's metres; 6F records whether the export's vertical exaggeration applies.

## How each set is baked (Blender 5.2, Cycles on Metal)

**Method: an orthographic emission render of each output on a 6 m plane.** It's the same set-up `swatch.py --tile-test` already uses, so it's proven on these materials. Blender has no way to evaluate a shader node tree from Python without rendering, and Cycles' own Bake button would do the same work with more set-up (a UV-unwrapped plane, an image node per pass), so the render is the simpler path.

- **The plane and camera:** a plane from (0, 0) to (6, 6) m with `UVMeters` = world x, y. Camera straight down, orthographic, `ortho_scale` = Tile, centred on (T/2, T/2), N × N pixels. So pixel i covers [i·T/N, (i+1)·T/N] and its centre is (i + 0.5)·T/N: the first and last columns are neighbours across the wrap, which is what makes the maps tile.
- **Clean values:** no world, no lights, light bounces 0, emission strength 1, view transform `Raw`, film not transparent, a 1-pixel box filter (each pixel is the average over its own square and nothing outside it), 16 samples, no denoising, no adaptive sampling. Output is 32-bit float EXR, which Blender writes scene-linear.
- **Three renders per set** (channels packed into one render where they share a precision):
  1. Base Color.
  2. AO, Roughness, Metallic as R, G, B (AO is 1.0 when the material has no AO output).
  3. Height ÷ `is_relief_m`, unclamped, in R; Alpha and Transmission in G and B when the material has them.
- **Group inputs:** each render copies the material's group-node input values, so a variant's params bake as the scene shows them.

### Maps, bit depths, colour spaces

| Map | File | Format | Colour space | What's in it |
|---|---|---|---|---|
| BaseColor | `T_<name>_BaseColor.png` | 8-bit RGB | sRGB (exact sRGB curve applied in numpy) | Base Color |
| ORM | `T_<name>_ORM.png` | 8-bit RGB | linear | R = AO, G = Roughness, B = Metallic |
| Height | `T_<name>_Height.png` | 16-bit grey | linear | 0..1 = 0..`relief_m` |
| Normal | `T_<name>_Normal.png` | 8-bit RGB | linear | tangent-space normal from the height, DirectX (green down) |

- **Orientation:** the image's top row is the top of the tile (v = 6 m), u runs left to right, so a map opened in Preview looks the way the wall stands. UV0 = UVMeters / 6 (6F's job) and the glTF V flip are recorded in `materials.json`.
- **Height:** `Height / is_relief_m`, clamped to 0..1. Its real minimum, maximum and the share of pixels clipped are written to `materials.json`, with a warning if more than 0.1 % clip (the stated relief is too small) or the maximum is under 0.5 (it's too large, wasting precision). In the materials, 0 is the bottom of the deepest joint and `relief_m` is the proudest point; Blender carves **inward** (the proudest point sits on the wall's face). `materials.json` records `"carve": "inward"`, so Unreal displaces by (h − 1) × `relief_m` and frames flush with the wall stay uncovered, as in Blender.
- **Normal:** from the float height (not the 16-bit PNG), in true metres, with central differences that wrap around the tile edges (`np.roll`), so the normal map wraps exactly when the height does:
  - dh/du = (h[i+1] − h[i−1]) × relief / (2 T/N), and the same for v;
  - n = normalise(−dh/du, −dh/dv, 1);
  - R = ½ + ½ n<sub>u</sub>, G = ½ − ½ n<sub>v</sub> (DirectX: green points down the image), B = ½ + ½ n<sub>z</sub>.
  - No strength fudge: a 2 cm stone lip gives the slope it really has. The Normal is what Unreal shows where it doesn't displace (relief under 2 cm, or far away), matching Blender's bump.

## Seams

Two checks per set, both in `seams.py`:

1. **Edge ratio (every map):** the jump across the wrap compared with an ordinary step between neighbouring pixels: mean |column N−1 − column 0| ÷ the mean |column i+1 − column i| over the whole image, and the same for rows. A seamless map scores about 1.0. **Pass: ≤ 1.5** in both directions.
2. **Half-tile shift (BaseColor, ORM, Height):** each pass is rendered a second time with the camera moved half a tile in u and v, then compared with the first image rolled by N/2 pixels. If the material really repeats every 6 m the two match up to sampling noise. This is `swatch.py --tile-test`'s check, done on the baked pixels. **Pass: mean difference < 0.01** (the README's existing threshold), p99 reported. It doubles the render time; `--no-shift-check` skips it for quick reruns.
   - **Detail finer than a pixel:** the probe below found `steel`'s Height at 0.025, over the threshold. Its orange-peel relief is finer than a pixel, so two renders with different random sub-pixel samples disagree even with no seam. So when a map fails the 0.01 test, it renders that pass once more at the *same* position with a different seed. That difference is the map's own noise floor, and the map passes if the shift difference is at most **1.5 × its noise floor**. A real seam shows up far above its noise; a noisy-but-seamless map sits right at it. The report says which rule passed each map.

A failed check doesn't stop the other sets, but the run exits 1 and the contact sheet marks the set red.

## `materials.json`

```json
{
  "version": 1,
  "generated": "2026-11-…T…Z", "blender": "5.2.2", "git": "<commit>",
  "res": 2048, "tile_m": 6.0, "samples": 16,
  "conventions": {
    "uv": "UV0 = UVMeters / tile_m; image top row = top of the tile (v = tile_m); u left to right",
    "BaseColor": "8-bit sRGB", "ORM": "8-bit linear, R AO, G Roughness, B Metallic",
    "Height": "16-bit linear, 0..1 = 0..relief_m; carve inward: offset = (h - 1) * relief_m",
    "Normal": "8-bit linear, tangent space, DirectX (green down), derived from Height"
  },
  "materials": {
    "ledgestone_cool": {
      "key": "ledgestone_cool", "params": {}, "blender_material": "M_LedgestoneCool", "group": "IS Ledgestone",
      "relief_m": 0.07, "displace": true,
      "maps": { "BaseColor": "ledgestone_cool/T_ledgestone_cool_BaseColor.png", "ORM": "…", "Height": "…", "Normal": "…" },
      "constants": {},
      "height": { "min": 0.0, "max": 0.98, "clipped": 0.0 },
      "seams": { "BaseColor": { "edge_u": 1.02, "edge_v": 0.99, "shift_mean": 0.003, "shift_p99": 0.02, "pass": true }, "…": {} },
      "bake_s": 61.4,
      "used_by": ["buildings.elders.parts.wall.wainscot", "site.retaining"]
    },
    "stucco__3f9a1c": { "key": "stucco", "params": { "Color": [0.7157, 0.6654, 0.5841, 1.0] }, "…": "…" },
    "glass": { "…": "…", "constants": { "Alpha": 1.0, "Transmission": 1.0 } }
  },
  "blends": {
    "elders_wainscot": { "rule": "below_world_z", "upper": "stucco__3f9a1c", "lower": "ledgestone_cool",
                         "height_m": 0.9, "edge": "hard", "top_z": "per building, in 6F's scene.json" },
    "terrain": { "rule": "z_smoothstep", "upper": "meadow__…", "lower": "beach", "shore_z_m": 3.0, "blend_m": 0.8 }
  },
  "failed": []
}
```

(The numbers above are placeholders for the shape.) `displace` is true when `relief_m` ≥ 2 cm, the same rule as `styling.DISPLACE_MIN_RELIEF`.

## Run time and disk

- **Measured** (Nov 6, `swatch.py --tile-test`, 1024² over 2 × 2 tiles, 16 samples, two emission passes):
  - `kurinuki`, the heaviest graph: about 2.5 s a pass, after a first render of 122 s that was almost all Metal kernel compiling.
  - `steel`, a light one: about 1 s a pass, with the kernels already cached.
  - Seams in the probe: kurinuki Base Color 0.0027, Height 0.0060 (pass); steel Base Color 0.0016 (pass), Height 0.0253 (over the threshold; see "Seams").
- **Run time at 2048:** four times the pixels, so about 10 s a pass for the heaviest materials and 2–4 s for light ones. Each set is 6 passes (3 maps plus the 3 shift renders, a seventh where the noise-floor re-render is needed) and a few seconds of numpy: **about 20–70 s a set**, and **about 10–20 minutes for all 25**. Add about 2 minutes on a cold shader cache.
- **Disk per set at 2048:**
  - BaseColor and ORM: about 6–10 MB each (8-bit; noisy detail compresses poorly).
  - Height: about 5–8 MB (16-bit).
  - Normal: about 8–12 MB.
  - So **about 25–40 MB a set, under 1 GB for all 25**.
  - The temporary EXRs (about 50 MB each) are deleted as each set finishes, unless `--keep-exr`. The internal disk's 74 GB free is plenty for 6E; the SSD matters for 6G's Unreal project.

## Tests

- **`test_bake_numpy.py`** (run with Blender's Python: `Blender -b --factory-startup --python-exit-code 1 -P tools/blender/tests/test_bake_numpy.py`):
  - Normal from an analytic height, h = A sin(2π u / T): matches the analytic slope to within one 8-bit step. A slope rising to the right gives R > ½; a slope rising up the image gives G < ½ (the DirectX sign).
  - The normal of a periodic height wraps: its edge ratio ≈ 1.
  - The sRGB curve at 0, at the 0.0031308 knee and at 1; ORM channel order.
  - Height normalisation: clamping and the clipped share.
  - The seam metrics: a seamless synthetic image passes; the same image with a step at the edge, or a ramp 0→1 across the tile, fails.
  - Targets: the reachable set from today's `styles.json` is the 25 sets listed above; variant names stay the same across runs and change when a param changes.
- **`test_bake_blender.py`:** a real 256 px bake of `tile_noise` (seamless by design) passes both checks, and a deliberately non-repeating test material (a ramp in u) fails both. The files exist with the right bit depths and sizes, and `materials.json` has the shape above.
- **The real run:** all 25 sets at 2048 pass, with timings in `materials.json`.

## Check-in B: what you'll get to look at

- **`build/3d/unreal/textures/contact.html`**, opened in the browser pane and saved as a PNG for your phone. One row per set, five pictures each, every one shown **2 × 2 tiles** so a seam would show as a line through the middle:
  1. BaseColor;
  2. ORM;
  3. Height;
  4. Normal;
  5. a quick "lit" preview (BaseColor shaded by the Normal under a low sun), so the relief reads without Unreal.
- Each row's label gives the name, where it's used, the relief, the bake time, and the seam numbers in green or red.
- **The seam report:** a table of every map's numbers, and any warnings (height clipping, unused relief).

## Decisions to confirm

1. **Which sets:** everything `styles.json` can reach (**25**, my pick), or also the two unused library materials (`--all`, 27)?
2. **Resolution:** **2048 for all** (2.9 mm a pixel on a 6 m tile, my pick), or 4096 for the hero walls (`kurinuki`, both ledgestones, `rigidized_bronze`), at four times the disk and time?
3. **Normal at 8-bit** (my pick: Unreal compresses normals to BC5 anyway), or 16-bit?
4. **Variant names** like `stucco__3f9a1c` (stable, made from the params, my pick), or names you pick in `styles.json` (for example `"bake_name": "stucco_warm"`)? The second means adding a key to `styles.json`.
5. **The half-tile seam check** doubles the bake time. Keep it on by default (my pick), or run it only with a flag?
6. **The noise-floor rule** for maps with detail finer than a pixel (`steel`'s Height): OK to pass a map whose shift difference is within 1.5 × its own render noise, or should such maps be baked at more samples until they clear 0.01 outright (slower, and may never get there for sub-pixel detail)?
7. **Output on the internal disk** at `build/3d/unreal/textures/` for now (under 1 GB), moving `build/3d/unreal/` to the SSD when it arrives for 6G?
