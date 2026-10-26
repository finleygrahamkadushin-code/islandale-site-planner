# Phase 3 plan: graphics

Status: **built, waiting for Finley's look (Oct 26 2026).** Realistic and White model checked from all five saved views in the browser; screenshots sent. Deviations are noted at the end.

Branch: `phase-3-graphics` (branched from `phase-2-core-editing`).

## Goal

Make the plan look like built work instead of coloured blocks, without slowing down editing. Everything Phase 2 does (select, move, lock, labels, layers, autosave) keeps working in every display style.

**Done when:** Realistic and White model both look presentation-ready from the saved views.

## What you will be able to do at the end

- See the site under a real sky, lit by the sun for a season and hour you pick, with soft shadows that move as you drag the hour.
- See the water of Mud Bay at the tide level you set (0 to 12 ft NAVD88, as in the old planner).
- See cabins with their real roof shapes (gable, hip, shed, pyramid, butterfly, prow, flat, sod), roof thickness, fascia and eave overhangs, and the walls clad in true-size siding.
- See doors, sliders and windows from the old file as framed glass in the walls, at their real positions, widths, heights and sills.
- See posts or a slab under each cabin reaching down to the actual slope, instead of a block floating or sinking.
- Switch the whole view between **Realistic**, **White model**, **Sketch** and **Diagram** from the top bar.
- Jump to saved views: **Overview**, **From the water**, **Entry at the west notch**, **Deck at sunset**, **Plan (top)**.

## Not in Phase 3 (comes later)

- Deck wings, porches and stairs attached to cabins, walls editor, interiors (Phase 5).
- True boolean cuts through wall thickness with `manifold-3d` (Phase 5 walls editor). Phase 3 draws openings as recessed glass with frames on the wall face.
- Satellite imagery on the terrain, instanced trees and beach grass, shoreline foam (Phase 5 or later; trees stay as one canopy per tree, with better materials).
- The path-traced Render button and PDF sheets (Phase 6).
- The switch to WebGPU. Phase 3 stays on WebGL; see the TSL note below.

## Steps

1. **Environment state.** A small view-state slice in the store: season (June, September, December), hour (7 to 19), tide (0 to 12 ft), display style, and the saved view. Saved with the plan, never an undo step. An Environment group in the side panel with the three sliders.
2. **Sun and sky.** Port the old planner's sun maths (latitude 48.46°, solar noon 12:18, declination by season) into a tested function. Drive a drei `Sky`, the directional light and a hemisphere fill from it. ACES Filmic tone mapping and sRGB output.
3. **Soft shadows fitted to the lot.** Shadow camera sized to the parcel plus a margin, 4096 map, soft PCF shadows, a small normal bias so the terrain does not self-shadow.
4. **Water.** A large plane at the tide elevation with a slightly reflective blue-grey material, fading to haze in the distance with scene fog.
5. **Ambient occlusion and anti-aliasing.** `@react-three/postprocessing` with N8AO (ambient occlusion) and SMAA.
6. **Procedural materials.** Canvas-drawn textures, no downloads: board-and-batten, horizontal lap and cedar shingle siding; standing-seam metal, cedar shake and green sod roofs; deck boards with gaps; concrete. Walls get UVs measured in feet along the perimeter so boards are true size. Glass is a physical material that reflects the sky.
7. **Cabin geometry.** Split each building into parts: walls (the footprint prism), roof, fascia and eaves, posts or slab foundation down to grade, and openings. Roofs follow the old `roofGeometry`: gable, hip, shed, pyramid, butterfly and prow; sod as a thick green flat roof; shell and dome as a smooth cap. Pitch is rise per foot of run (`pitch / 12`); `ridge` picks the ridge direction; `overhang` sets the eaves.
8. **Display styles.** Realistic (all of the above). White model (every surface white, soft AO, grey ground, no textures, water pale). Sketch (white surfaces with black edge lines). Diagram (one flat colour per object, no textures).
9. **Saved views.** Five camera presets with smooth transitions. "Deck at sunset" also sets the hour to 19 in September.
10. **Check and commit.** Walk both done-when styles through the saved views, send screenshots, run the tests, commit.

## Design decisions (say if you disagree)

- **Sun by season, not calendar date.** The old planner used June / September / December; a full date picker can come later.
- **Post-processing:** `@react-three/postprocessing` on WebGL now, as the stack table in PLAN.md says. The working rule says new shaders and effects go in TSL; Phase 3 writes no custom shaders (only built-in materials, canvas textures and library effects), so there is nothing to port yet. At the WebGPU switch, AO and SMAA move to the TSL post-processing nodes.
- **Openings without boolean cuts for now:** the wall stays solid; the opening is a dark glass panel set just proud of the wall with a frame. It reads correctly from outside and is cheap to redraw while dragging.
- **Siding per object:** a `siding` param (`batten`, `lap`, `shingle`) and a `roofMat` param (`seam`, `shake`, `sod`); defaults by roof type (sod roof → sod, otherwise standing seam) and board-and-batten walls. Colour still comes from `color` and `roofColor`.
- **Performance:** textures shared between objects; roofs and walls rebuilt only when their size or shape changes, not when an object moves.

## Tests to write first

- Sun: noon in June is high in the south (azimuth about 180°, elevation about 65°), 7 am in December is below the horizon, and the afternoon sun is in the west.
- Roof geometry: each roof type's bounding box matches its footprint plus overhang, its peak height matches pitch × span / 2, and it has no degenerate faces.
- Wall UVs: a 16 ft wall gets a U range of 16.
- Openings: a legacy cut on edge 0 at x 12.25 ft, 3.5 ft wide lands on that edge at the right place.
- Display style and environment: switching changes no plan data and adds no undo step.
- Playwright: each display style renders without console errors, and each saved view moves the camera.

## Deviations noted while building

- **Phase 1 units bug, fixed.** The legacy terrain grid is in metres, not feet; Phase 1 had scaled it by 0.3048, flattening the site. Found because the tide water flooded the lot. Heights now match the old planner.
- **Deck at sunset** looks back at the gathering cabin from the seaward lawn at 5:45 pm, not from the deck at 7 pm. By the old planner's sun maths the September sun sets at about 6:20 pm, and the deck itself is a Phase 5 wing, so a camera "on the deck" floated among the posts.
- **Pitched roofs follow the footprint's bounding box**, as the old `roofGeometry` did. On curved plans (the gathering prow) the eaves reach past the wall at the corners; Phase 5 can fit roofs to the outline.
- **Prow roof** is drawn as a gable whose seaward end comes to a point. The old file's sculpted prow variants (C2–C4) differ in detail and come back with the Phase 5 roof editor.
- **Openings** are framed glass on the wall face (no boolean cuts yet), as planned.
- **Water** uses drei's `MeshReflectorMaterial` (a blurred planar reflection) instead of a plain physical material, which read as a grey floor.
- **Frame rate:** 115–120 fps in every style on the M4 Pro at 2× pixel density. A page that has been hot-reloaded many times in dev can drop far lower; a fresh load is the real figure.
- `window.islandale.camera()` and `window.islandale.renderInfo()` were added as read-only probes for tests and debugging.
