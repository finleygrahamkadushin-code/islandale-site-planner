# 6E · Bake textures for Unreal

Status: **signed off at check-in B by Finley (Nov 9 2026)**, merged into local `main` by the coordinator. The follow-up fixes from an independent review (Nov 9) are on branch `claude/phase-6e-bake-2ec41d`; see "Review fixes".

This file describes 6E **as built**. The plan Finley approved at check-in A (Nov 6) said 2048 px and an 8-bit normal. He then asked for the highest quality, with time and disk no object, and for the Phase 6 research videos to be applied. "History" at the end records the original decisions and what changed them.

**What it does:** turns every procedural Blender material the scene wears into a set of seamless image textures that Unreal can use:
- Each set is one 6 m × 6 m tile at **4096 px** (1.5 mm a pixel): BaseColor, ORM (AO, Roughness, Metallic), a 16-bit Height and a 16-bit Normal.
- It also writes `materials.json`, which tells 6F and 6G what each set is, how deep its relief goes, how the two blended surfaces (the Elders' wainscot and the meadow-to-beach shore) mix their layers, and some starting values for Unreal.
- Every set is checked for seams, and the run fails if one doesn't wrap.

Out of scope for 6E: exporting meshes (6F), anything inside Unreal (6G), and changing how any material looks.

## Files

All in `tools/blender/` (Track U's folder). Nothing in `src/`.

| File | What it does |
|---|---|
| `bake_textures.py` | The entry point, run in Blender: `Blender -b --factory-startup -P tools/blender/bake_textures.py -- [--keys a,b] [--all] [--res 4096] [--samples 64] [--height-samples 256] [--out build/3d/unreal/textures] [--no-shift-check] [--checks-only] [--previews-only] [--contact-only]` |
| `islandale3d/bake/__init__.py` | `bake_set` (render, encode, check and write one set), `verify_set` (re-check a baked set without rebaking), the previews |
| `islandale3d/bake/targets.py` | Which sets to bake: walks `styles.json` the way `styling.py` resolves it. One entry per (key, params) pair, with where it's used, plus the blends and the Unreal hints |
| `islandale3d/bake/render.py` | The Blender side: a plane with `UVMeters`, an orthographic camera, and one emission render per pass to a float EXR |
| `islandale3d/bake/encode.py` | numpy only: sRGB, Height normalisation, Normal and AO from Height, and PNG writing and reading (8- and 16-bit, no dependency beyond numpy) |
| `islandale3d/bake/seams.py` | numpy only: the seam checks |
| `islandale3d/bake/manifest.py` | `materials.json` |
| `islandale3d/bake/contact.py` | The contact sheet (`contact.html`) |
| `tests/test_bake_numpy.py` | Fast tests of `encode`, `seams` and `targets`, no rendering |
| `tests/test_bake_blender.py` | Real 256 px bakes: good and deliberately broken materials, orientation, exact colour |
| `README.md` | The "Bake for Unreal (6E)" section |

Output goes to `build/3d/unreal/textures/` (gitignored), one folder per set, plus `materials.json`, `contact.html` and `contact.png`.

## Which materials get baked

Everything `styles.json` can reach: **25 texture sets**, 23 plain keys and 2 tuned variants.

| Where in `styles.json` | Keys |
|---|---|
| The four named buildings | `kurinuki`, `charred_wood`, `standing_seam`, `ledgestone_warm`, `steel`, `copper_roof`, `rigidized_bronze`, `ledgestone_cool` (the Elders' wainscot), **`stucco` with the warm-white `Color`** (Elders' walls, headers, sills) |
| `defaults.parts` | `cedar`, `deck_boards`, `glass`, `concrete`, `concrete_slab`, `timber` (plus `steel`, `standing_seam`, `charred_wood` above) |
| `wall_kinds`, `roof_mats`, `rail_styles` | `board_batten`, `glass_tinted`, `sod_roof` (plus keys above) |
| `site` | **`meadow` with `Green Amount` 0.24** (terrain and earthworks), `beach`, `flagstone`, `gravel`, `water`, `madrone_bark` and `leaves` (the 6D trees) |

- **Tuned variants** are baked under their own name, `<key>__<6 hex chars of a hash of the params>`: today `stucco__aa9d13` and `meadow__63c904`.
  - Params are canonicalised before hashing (every number a float, rounded to 9 decimals), so `1` and `1.0` give the same name.
  - Two different (key, params) pairs that land on one name stop the run with an error.
  - Plain `stucco` and plain `meadow` aren't baked, because nothing wears them untuned.
- **`--all`** adds `kurinuki_shino` and `rigidized_metal` (in the library, unused). The debug `uv_grid` and `tile_noise` are never baked.
- **A set nothing reaches any more** drops out of `materials.json` on the next run. Its folder stays on disk, and the run names it.
- **Glass and water** get a set like any other. An output that's the same everywhere (glass's Alpha and Transmission) is written as a number in `materials.json`. Only an output that varies gets an extra map (`T_<name>_Opacity`), and an old Opacity map is deleted when a rebake no longer makes one. 6G gives glass and water their own masters.

### Blends: two layers and a rule, not a baked mix

The two blends depend on where a surface sits in the world, so they can't be baked into one tile. Each is recorded as two baked sets plus a mask rule:
- **`elders_wainscot`:** upper = `stucco__aa9d13`, lower = `ledgestone_cool`, rule `below_world_z`, `height_m` 0.9, hard edge, exactly as `wainscot_material`. The top Z is per building (from `styling.wainscot_bases`), so 6F's `scene.json` carries it.
- **`terrain`:** upper = `meadow__63c904`, lower = `beach`, rule `z_smoothstep`, shore at 3.0 m, blend ±0.8 m, as `terrain_material`. 6F records whether the export's vertical exaggeration applies.

## How each set is baked (Blender 5.2, Cycles on Metal)

**An orthographic emission render of each output on a flat plane**, the set-up `swatch.py --tile-test` already used. Blender can't evaluate a shader node tree from Python without rendering, and Cycles' Bake button would do the same work with more set-up.

- **Framing:** the plane carries `UVMeters` = world (x, y). The camera looks straight down, orthographic, `ortho_scale` = Tile, framing exactly [0, Tile]² on N × N pixels. Pixel i covers [i·T/N, (i+1)·T/N] with its centre at (i + 0.5)·T/N, so the first and last columns are neighbours across the wrap.
- **Clean values:**
  - no world, no lights, light bounces 0, emission strength 1;
  - view transform Standard (the EXR is scene-linear either way);
  - a 1-pixel box filter, so each pixel is the average over its own square;
  - no denoising, no adaptive sampling;
  - 32-bit float EXR, read back and deleted.
- **Three renders per set:**

  | Render | Contents | Samples per pixel |
  |---|---|---|
  | 1 | Base Color | 64 |
  | 2 | AO, Roughness, Metallic as R, G, B (AO 1.0 when the material has no AO output) | 64 |
  | 3 | Height ÷ the stated relief in R; Alpha and Transmission in G and B when the material has them | **256**, because the normal comes from it |

- The group's input values are copied, so a variant's params bake as the scene shows them.

### Maps

| Map | File | Format | What's in it |
|---|---|---|---|
| BaseColor | `T_<name>_BC.png` | 8-bit RGB, sRGB (exact curve, in numpy) | albedo only, nothing lit or occluded |
| ORM | `T_<name>_ORM.png` | 8-bit RGB, linear | R = AO, G = Roughness, B = Metallic |
| Height | `T_<name>_H.png` | **16-bit** grey, linear | 0..1 = 0..`relief_m` |
| Normal | `T_<name>_N.png` | **16-bit** RGB, linear | tangent-space normal from the height, DirectX (green down) |
| Opacity | `T_<name>_Opacity.png` | 8-bit grey, linear | Alpha × (1 − Transmission), only when it varies |

- **Orientation:** the image's top row is the top of the tile (v = 6 m), with u running left to right. A real-bake test checks all four corners.
- **AO:** the material's own AO output, or, where it has none, a gentle cavity AO computed from the height with a blur that wraps. `ao_source` says which.
- **Height is never clipped.** The range is 0..1 of the stated relief (`is_relief_m`), widened to fit wherever the material goes past it (`concrete`, `concrete_slab` and `madrone_bark` do, on 0.1–0.8 % of their pixels).
  - `relief_m` is then the real range in metres, `blender_relief_m` the stated one, and `face_h` the H value where Blender's wall face sits (1 unless the material rises past its stated relief).
  - Blender carves **inward**, so Unreal displaces by (h − `face_h`) × `relief_m`. `ue.displacement_center` = `face_h`.
- **Normal:** from the float height (before quantising), in true metres, by central differences that wrap (`np.roll`). n = normalise(−dh/du, −dh/dv, 1), then R = ½ + ½n<sub>u</sub>, G = ½ − ½n<sub>v</sub> (DirectX), B = ½ + ½n<sub>z</sub>. There's no strength fudge.

## Seams

Two independent checks per set, in `seams.py`. A set's `status` is `pass` only when both ran and passed. With `--no-shift-check` it's `unchecked`, which is never a pass. The run exits 1 if any current set fails, 2 if none fails but some are unchecked or not baked, and 0 otherwise.

1. **Edge check: does the FILE wrap?** Run on every map as written (BC, ORM, H, N, Opacity).
   - It compares the change across the wrap with the **4th-largest** change inside the tile. Each change is measured over two pixels, |column i+1 − column i−1|, so a joint counts fully whether it lands on a pixel boundary or between pixel centres. Rows work the same way.
   - A board joint, roof rib, course line or slab joint on the tile edge (`wrapped_cells` puts cell boundaries there) is judged like the joints mid-tile. A cliff that happens once per tile, at the wrap, has nothing comparable inside, even next to one large interior step.
   - **Pass: ≤ 1.5** in both directions.
2. **Shift check: does the MATERIAL repeat every 6 m?** Each pass is rendered at 1024 px (16 samples), then again with the camera moved half a tile in u and v, and compared after rolling the first image by half its size.
   - It compares per channel and takes the **worst channel**, so a constant channel can't dilute a seam. For the third render, only the outputs the material really has are compared (Height, Alpha, Transmission), so a relief-less material with varying opacity (leaves, glass) is checked too.
   - Two statistics: the **mean** difference, and the **line**, the worst single row or column mean of the difference. A seam is a line: a 2 cm one at 0.4 contrast is 0.33 % of the pixels and moves the mean only to ~0.001, but its column shows at 0.4.
   - **Pass: mean < 0.01 and line < 0.03.**
   - **Noise floor:** a pass that misses those thresholds is rendered once more at the same place with another seed. It then passes if both its mean and its line are within **1.5 ×** that noise floor. That's for detail finer than a pixel, such as `steel`'s orange-peel height. p99 is reported, not judged.

Limits worth knowing:
- A defect shaped exactly like the pattern's own joints (a joint-sized step at the wrap on a board material) can't be told from a joint by any check that doesn't know the pattern. The contact sheet's 2 × 2 tiles are the check for that.
- `--checks-only` re-runs both checks on an existing bake without re-rendering the maps.

## `materials.json`

```json
{
  "version": 1, "generated": "2026-11-09T…Z", "blender": "5.2.2 LTS", "git": "<commit>",
  "res": 4096, "tile_m": 6.0, "samples": 64, "height_samples": 256, "shift_check": true,
  "conventions": { "uv": "…", "BC": "…", "ORM": "…", "H": "…", "N": "…", "Opacity": "…", "constants": "…" },
  "materials": {
    "ledgestone_cool": {
      "key": "ledgestone_cool", "params": {}, "blender_material": "M_LedgestoneCool", "group": "IS Ledgestone",
      "tile_m": 6.0, "res": 4096, "relief_m": 0.039, "blender_relief_m": 0.039, "face_h": 1.0, "displace": true,
      "maps": { "BC": "ledgestone_cool/T_ledgestone_cool_BC.png", "ORM": "…", "H": "…", "N": "…" },
      "constants": { "Metallic": 0.0 }, "ao_source": "material", "outputs_baked": ["AO", "Base Color", "…"],
      "height": { "min": 0.0, "max": 1.0, "beyond_stated": 0.0, "range": [0.0, 1.0], "face_h": 1.0 },
      "albedo_luminance": { "mean": 0.2, "p01": 0.029, "p99": 0.5 },
      "seams": {
        "edge": { "BC": { "edge_u": 0.7, "edge_v": 0.6, "edge_pass": true }, "…": {} },
        "shift": { "color": { "channels": ["Base Color"], "shift_mean": 0.003, "shift_line": 0.006, "shift_p99": 0.02,
                              "shift_pass": true, "shift_rule": "absolute" }, "orm": {}, "height": {} },
        "shift_checked": true
      },
      "status": "pass", "pass": true, "warnings": ["albedo below 0.03 …"],
      "ue": { "master": "opaque", "specular": 0.5, "cell_bomb": false, "triplanar": false, "metallic_present": false,
              "height_range_cm": 3.9, "displacement_center": 1.0 },
      "previews": { "BC": "preview_BC.png", "…": "…" }, "used_by": ["buildings.elders.parts.wall.wainscot", "site.retaining"],
      "bake_s": 315.0
    }
  },
  "blends": { "elders_wainscot": { "rule": "below_world_z", "…": "…" }, "terrain": { "rule": "z_smoothstep", "…": "…" } },
  "failed": [], "unchecked": [], "missing": []
}
```

(The numbers are illustrative.) `displace` is true when the stated relief is ≥ 2 cm, the same rule as `styling.DISPLACE_MIN_RELIEF`. The `ue` block holds starting values for 6G from the research playbook: specular 0.1 on natural surfaces, cell bombing only on meadow, beach and gravel, triplanar on bark.

## Run time and disk (measured)

- **Full bake at 4096** (64 / 256 samples, Nov 8): **63 minutes** for all 25, with 25–350 s a set (kurinuki, the ledgestones, flagstone, gravel, beach and meadow are the slow ones). Add a few minutes for Metal kernels on a cold shader cache.
- **`--checks-only`:** a few seconds a set (shift renders at 1024 px, plus reading the PNGs back).
- **Disk:** **2.5 GB** for all 25. The 16-bit normals are the largest (kurinuki's is 63 MB). The temporary EXRs are deleted as each pass is read.

## Tests

Run with Blender's Python: `Blender -b --factory-startup --python-exit-code 1 -P tools/blender/tests/<file>`.

- **`test_bake_numpy.py`** (21 tests):
  - The normal against an analytic steep sine, within 2·10⁻⁴ relative. The DirectX signs (rising right gives R < ½; rising up the image gives G > ½), and a bump lit from the top left reads raised.
  - A periodic height gives a periodic normal; the sRGB curve; Height widening; PNG round trips at 8 and 16 bits, with the top row as the tile's top; derived AO darkens pits and wraps.
  - Edge check: seamless and noise pass; wrong period and a ramp fail; a joint on the edge passes; one cliff per tile fails even beside one big interior step; a joint on a pixel boundary at the wrap passes when the joints inside fall between pixel centres.
  - Shift check: the noise-floor rule; a **localised 2 cm seam** is caught by the line; the worst channel counts, not the average.
  - Targets: the 25 sets; variant names stable, sensitive, and the same for 1 and 1.0; today's names unchanged; a name collision raises; the blends.
  - Previews never trim the tile.
- **`test_bake_blender.py`** (7 real bakes at 256 px):
  - Tile noise passes.
  - A cliff on the tile edge fails the edge check, and a wrong-period ramp fails the shift check.
  - **Orientation:** BaseColor = (frac(u/T), frac(v/T), 0), with all four PNG corners asserted.
  - An opacity-only material is shift-checked on Alpha, a wrong-period one fails, and a rebake without opacity deletes the old Opacity map.
  - `--no-shift-check` gives `unchecked`, not a pass.
  - A flat colour comes out exact through the EXR, sRGB and PNG path, and its constants are noted.

## Check-in B (signed off Nov 9)

`build/3d/unreal/textures/contact.html` (and `contact.png`) has one row per set: BaseColor, ORM, Height, Normal and a lit preview (low light from the top left), each shown **2 × 2 tiles**. Each row gives where the set is used, its relief, bake time, seam numbers and warnings, followed by the seam report table. Each set also has a 3 × 3 lit preview. Things to know:
- Kurinuki has one dark-green carved patch that repeats visibly every 6 m in a 3 × 3 view. That's in the material; 6G's macro variation, or a tweak to the material, would hide it.
- Charred wood, the cool ledgestone and water sit just under the 0.03 albedo floor (expected for those materials).

## Review fixes (Nov 9)

An independent review before `main` is pushed:
1. **Shift check:** compares the worst channel, adds the line statistic for localised seams, and checks Alpha and Transmission.
2. **Edge check:** compares with the 4th-largest two-pixel change inside the tile instead of the largest one-pixel step.
   - A first try, the 8th-largest one-pixel step at 4096, failed `cedar` (1.90) and `concrete_slab` (2.0) on joints that are really there. Cedar's joint on the edge falls on a pixel boundary, while its joints inside fall between pixel centres and split their step over two pixels. Concrete slab has only four control joints a tile (every 1.5 m), so an 8th-largest step isn't a joint.
   - Measuring over two pixels with a rank of 4 fixes both. All 25 sets score ≤ 1.07 against the 1.5 limit, and a cliff once per tile still fails.
3. **`materials.json`:**
   - `shift_checked` and `status`, with `unchecked` never counted as a pass;
   - prunes sets `styles.json` no longer reaches;
   - `failed`, `unchecked` and `missing` cover the current sets only;
   - deletes a stale Opacity map;
   - a clear error when `--previews-only` (or `--contact-only`, `--checks-only`) finds no `materials.json`.
4. **Tests:** the orientation bake, a tighter slope test, localised-seam and diluted-channel cases.
5. **Variant names:** canonical params, and a collision raises (today's names are unchanged).
6. **This file:** made consistent with what shipped.

The maps themselves didn't change. All 25 sets were re-checked under the stricter rules with `--checks-only`; the result is in the commit message.

## History: the decisions at check-in A (Nov 6)

Finley OK'd all seven recommended answers. The two marked † were then changed by his "as high quality as possible" and the research playbook.

| # | Decision | Answer at check-in A | As built |
|---|---|---|---|
| 1 | Which sets | the 25 `styles.json` reaches | same (`--all` for 27) |
| 2 † | Resolution | 2048 for all | **4096 for all**. Not 8192: the videos call 8K overkill, and 25 sets of 8K would overflow Unreal's texture streaming on a 24 GB Mac, which blurs textures |
| 3 † | Normal bit depth | 8-bit | **16-bit** (playbook), as is Height |
| 4 | Variant names | hashed from the params | same, now canonicalised |
| 5 | Half-tile check | on by default | same, at 1024 px, plus the line statistic |
| 6 | Noise-floor rule | within 1.5 × the render noise | same, applied to both mean and line |
| 7 | Output | internal disk, `build/3d/unreal/textures/` | same (2.5 GB) |

Other changes after the OK:
- The playbook's file names (`_BC/_ORM/_H/_N`) replace `_BaseColor/_ORM/_Height/_Normal`.
- 256 samples for Height.
- AO from height where a material has none.
- Height widened instead of clipped.
- The research's albedo check and Unreal hints.
- The edge check was reworked three times. The average step flagged joints on the tile edge; the largest step was too lenient; and the 8th-largest one-pixel step flagged real joints that sit on a pixel boundary (review fix 2).

The timing probe (Nov 6, `swatch.py --tile-test`, 1024 px, 16 samples) measured kurinuki at about 2.5 s a pass after 122 s of Metal kernel compiling, and steel at about 1 s. Steel's Height scored 0.025 there, which is what led to the noise-floor rule.
