# Islandale Site Planner: Rebuild Plan

Oct 24, 2026 · @Finley

## Summary

Rebuild the Islandale Site Planner as a proper web project on modern three.js, keeping it focused on the Lopez Island lot for now. The current planner works and has a lot in it, but it is one 1.3 MB hand-edited HTML file with about 25 features patched on top of each other, running three.js r128 (2021) with flat Lambert materials.

The rebuild has three goals:

- **Better graphics:** realistic lighting and materials, real architectural detail, and a clean white-model mode for critiques.
- **Better UI:** fewer, clearer tools; locking; hiding names; a beginner mode someone with no experience can use.
- **A solid base:** organized code that is easy to extend, so the planner can later handle any site with a terrain scan.

Scope for now: Islandale only. Scheme C is the current design; the other schemes move to an Old designs archive. The home screen and other sites come later (see the last sections).

**Using this doc with Claude Code:** keep a copy of this plan in the project folder (export it as Markdown and save it as `PLAN.md`) and start each session from the brief at the end. Claude Code reads it and works through the build order one phase at a time.

## Engine choice

Use **three.js** (current release r186, September 2026) with **React Three Fiber** on top. It is the same engine family the planner already uses, so terrain, schemes and geometry logic port over, and it has the largest set of add-ons for exactly what this app needs: gizmos, realistic lighting, outlines, and a path tracer for photo-quality stills. It stays a website, so it is still a link you can share.

| Option | Best at | Weak at | Fit for Islandale |
| --- | --- | --- | --- |
| [three.js](https://www.utsubo.com/blog/threejs-2026-what-changed) + React Three Fiber | Huge ecosystem, architecture-style rendering, runs in any browser | You assemble the editor tools yourself from libraries | **Pick this** |
| [Babylon.js](https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/) | All-in-one: built-in gizmos, inspector, area lights, node editors | Smaller community; fewer architecture add-ons; full port of existing code | Strong second |
| CesiumJS | Streaming real terrain and 3D Tiles for anywhere on Earth | Modeling and editing buildings | Borrow its terrain ideas later, not the core |
| Unity / Unreal / Godot | Best-in-class visuals and game tooling | Installs and heavy builds instead of a link; rebuilds everything a browser gives free | Overkill |

**Renderer:** start on the classic WebGL renderer, then switch to `WebGPURenderer` once the scene is stable. WebGPU is on by default in Chrome, Edge and Safari 26, and [three.js falls back to WebGL 2 automatically](https://www.utsubo.com/blog/threejs-2026-what-changed) where it is missing. Two catches from [migration write-ups](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026): custom shaders and post-processing must be rewritten in TSL (three.js's shading language), and Firefox on Linux, Intel Macs and Android still falls back to WebGL. So write new effects in TSL from day one and treat WebGPU as a speed-up, not a requirement.

## Recommended tech stack

A TypeScript + React project built with Vite, kept in a GitHub repo that Claude Code works in, and published as a static website.

| Layer | Choice | Why |
| --- | --- | --- |
| Language and build | TypeScript, Vite | Type errors caught before they break the app; fast reloads while you work |
| 3D | three.js, React Three Fiber, drei | Scene as components; drei supplies camera controls, move/rotate gizmos, environment lighting, outlines, HTML labels |
| Effects | `@react-three/postprocessing` (WebGL) now, TSL post-processing when moving to WebGPU | Ambient occlusion, outlines, anti-aliasing |
| Geometry | `manifold-3d` for boolean cuts, `three-mesh-bvh` for fast picking | Clean window and door openings; smooth clicking on dense terrain |
| State and undo | Zustand + `zundo` | One store holds the whole plan; undo/redo comes almost for free |
| UI parts | Radix UI primitives + your own CSS tokens | Accessible menus, dialogs, tooltips without a heavy look you then fight |
| Saving | IndexedDB (local autosave) + JSON export/import | Never lose work; plans are plain files you can back up or share |
| Testing | Vitest (logic), Playwright (clicks through the app) | Catches regressions as features get ported |
| Hosting | GitHub Pages or Vercel | Free, a link per version |

**Rule that keeps it maintainable:** the plan is data, the scene is drawn from the data. Every cabin, deck and wall is a plain object in the store (`{type, position, rotation, params, locked, hidden, labelVisible}`); the 3D view, the inspector, the plan drawings and saving all read from that one source. The current planner mixes these, which is why each feature had to patch the others.

Suggested folders:

```
src/
  app/          home, layout, routing
  store/        plan data, undo/redo, selection, locks, visibility
  site/         terrain, parcel, setbacks, tide, sun (Islandale data lives here)
  buildings/    cabin generator, roofs, walls, openings, decks, stairs, rails
  scene/        lights, materials, display styles, cameras, post-processing
  ui/           toolbar, inspector, layers panel, tooltips, tour
  tools/        select, move, rotate, measure, place, paint
  export/       images, PDF sheets, glTF
data/islandale/ terrain grid, parcel, schemes A–D (JSON)
```

## Graphics upgrades

The biggest visual gain comes from lighting and materials, not more geometry: switch to physically based materials under real sky lighting, then add the architectural details that make a cabin read as built.

**Lighting**

- Physically based materials (`MeshStandardMaterial` / `MeshPhysicalMaterial`) instead of Lambert.
- Sky lighting from an HDRI or a procedural sky, tied to the existing sun position, date and hour.
- ACES or AgX tone mapping and correct sRGB colour, so whites stop looking grey and shadows stop looking flat.
- Soft shadows that fit the lot tightly (cascaded or a fitted shadow camera), plus ambient occlusion so corners and eaves darken naturally.

**Materials (procedural, so no texture downloads)**

- Siding: board-and-batten, cedar shingle, horizontal lap; scale set in feet so boards are true size.
- Roofs: standing-seam metal with visible seams, cedar shakes, green roof.
- Glass: reflects the sky and Mud Bay; slight tint.
- Concrete piers, deck boards with gaps, galvanised or cable railings.

**Architectural detail**

- Window and door frames, mullions and sills; openings cut cleanly through the wall thickness.
- Roof thickness, fascia boards, eave overhang soffits, gutters.
- Foundations that meet the real slope: piers and stepped footings instead of floating boxes.

**Display styles (one switch in the toolbar)**

- **Realistic:** everything above.
- **White model:** all-white surfaces, soft ambient occlusion, grey ground. The studio critique look.
- **Sketch:** white surfaces with black edge lines, like a hand drawing.
- **Diagram:** each cabin in a flat colour for presentations about the program.

**Site realism**

- Satellite or aerial imagery draped on the terrain, faded where buildings sit.
- Instanced trees and beach grass placed from the imagery or by hand.
- A water surface that rises with the tide slider, with soft shoreline foam and distance haze over Mud Bay.

**Presentation renders**

- A "Render" button that runs `three-gpu-pathtracer` from the current camera for a photo-quality still (takes seconds to minutes; the live view stays fast).
- Saved camera views ("From the water", "Entry at the west notch", "Deck at sunset") for quick, repeatable shots.

## UI and experience

Organize the app around four tasks instead of one long panel, and show only the tools for the task at hand. Someone opening it for the first time should be able to orbit, place a cabin, move it and save within a minute.

**Layout**

- **Top bar:** plan name, the four task tabs (Site, Build, Interior, Present), undo/redo, display style, save status.
- **Left tool strip:** the tools for the current tab only (Build: select, move, rotate, measure, add cabin, add deck, add path).
- **3D view:** fills the screen; compass, scale bar and a small hint line ("Drag to orbit · right-drag to pan").
- **Right inspector:** settings for the selected object only; a Layers panel when nothing is selected.
- **Command search (Ctrl/Cmd + K):** type "roof pitch" or "lock" to jump to any setting.

**Lock**

- Padlock on each object in the layers list and in the inspector. A locked object cannot be moved, rotated, resized, deleted or edited, and its gizmo is hidden.
- "Lock terrain and lot" on by default, so the ground and parcel can never be dragged by accident.
- "Lock all" for handing the plan to someone else to explore.
- Clicking a locked object still selects it (to read its info) and shows a small padlock toast if you try to move it.

**Hide names and layers**

- Labels switch in the top bar: All, Selected only, None. Each object can also hide its own label.
- Layers panel with an eye and a padlock per category: Buildings, Decks and paths, Labels, Dimensions, Setbacks, Contours, Trees, Imagery, Water.

**Easy for beginners**

- **Beginner / Advanced switch.** Beginner hides code checks, structural supports, ridge curl and other technical settings; every remaining control has a plain-language name.
- **First-run tour:** five short steps (orbit, select, move, lock, save), skippable, replayable from Help.
- **Tooltips on everything**, including a one-line explanation of terms like setback or OHWM.
- **Safe by default:** autosave, undo for everything, confirmation before deleting, and "Reset view" always one click away.
- **Empty states that teach:** an empty Build tab says "Add a cabin from the tool strip, then drag it into place."

**Present mode**

- Hides every editing control; full-screen 3D with the saved camera views as a strip of buttons.
- Optional sun animation through a day, and labels set to None by default.

**Simplify what exists**

- One way to do each thing: today there are separate move handles, a Shape panel and wing fields for the same edit; keep the 3D handles and one inspector.
- Islandale-specific checks (San Juan County code, shoreline setback, tide) become a "Site rules" group you can collapse.
- Drop any feature you have not used in the last few weeks; it can come back later from the old file.

## Islandale content to carry over

The first job is to pull the data out of the old file into JSON, so nothing that took work to build is lost; the features are then rebuilt one by one against that data.

**Designs**

- **Current design:** Scheme C, with its prow variants C2 (traditional prow), C3 (twin prow) and C4 (shell prow) kept as options under it.
- **Old designs archive:** Schemes A, B and D (Nautilus & Kelp, the rules-off dream scheme). Openable and restorable, but out of the main view.
- **Also found in the old file (Phase 1 extraction, Oct 24 2026):** schemes E · Under the Meadow, F · Sky Datum, G · Tide Shell, H · Sod & Contour and I · Little Sky Datum. They are extracted with the rest and go into the archive alongside A, B and D.

**Site data (keep exactly)**

| Data | Source in the current file |
| --- | --- |
| Terrain | USGS 3DEP 1/9 arc-second LiDAR DEM, sampled every 2 m (6.6 ft), NAVD88 |
| Parcel line | San Juan County assessor via the WDFW statewide parcel service; 0.48 ac (20,847 sq ft) |
| Rules | Shoreline setback logic and the SJCC 18.50.540 code check |
| Environment | Tide range, sun by date and hour, seasons |

**Features to port, in priority order**

1. Terrain, parcel, setbacks, contours, sun and tide.
2. Cabins with roofs (gable, shed, prow shapes, pitch, overhang) and the move/rotate/resize handles.
3. Decks, attached and joined parts, supports and piers.
4. Walls editor: doors, windows, sliders, cutouts.
5. Interior: floors, rooms, furniture, accessibility checks.
6. Paths and routes, stairs and railings, including the auto-route and slope checks.
7. Exterior paint and materials.
8. Plan sheet and elevation exports.

The AI "describe it" helpers in the old file are last in line; rebuild them only if you still use them.

## Build order

Six phases, each ending in something you can open and use. Lock and hide names land in phase 2, so the app is useful before the visual overhaul starts.

| Phase | Builds | Done when |
| --- | --- | --- |
| 1 · Foundation and data | Vite + TypeScript + R3F project, plan store with undo, Islandale data extracted to JSON | Terrain and lot render, and tests match the old file's terrain grid and 0.48 ac parcel |
| 2 · Core editing (first usable version) | Select, move, rotate, resize; lock; labels switch; layers panel; Scheme C cabins; autosave | You can rearrange Scheme C, lock it, hide names, reload, and find it unchanged |
| 3 · Graphics | PBR materials, sky lighting, soft shadows, ambient occlusion, cabin detail, display styles | Realistic and White model both look presentation-ready from the saved views |
| 4 · UI and beginner experience | Four task tabs, one inspector, Beginner mode, tooltips, first-run tour, Present mode | Someone new can place, move, lock and save a cabin in about a minute without help |
| 5 · Port the rest | Decks, supports, walls, interiors, paths, stairs, railings, paint, site rules, archive | Every feature you still use from the old planner works, with undo and locks |
| 6 · Exports and renders | Path-traced stills, images, PDF plan / elevation / section sheets, glTF for SketchUp | The class deliverables come straight out of the app |

Don't start a phase until the one before passes its done-when check; that keeps the app runnable the whole way through.

Per-phase plans live next to this file: [PLAN-PHASE2.md](PLAN-PHASE2.md).

## Later: making it bigger

Not in scope yet, but the structure above is built so these drop in without a rewrite.

- **Home screen:** a card per plan (thumbnail, site, last edited) and a New plan button. A new plan opens blank.
- **New plan options:** blank flat site; find a site by address; upload a scan.
- **Any US site:** USGS 3DEP LiDAR covers almost the whole US, so terrain can load the same way Islandale's did, with aerial imagery draped on top.
- **Lot lines elsewhere:** Washington has a free statewide parcel layer; other places trace the lot on the imagery or type in survey bearings and distances.
- **Uploads:** phone LiDAR scans (Polycam, iPhone scanner) and downloaded elevation files, for small sites and places outside the US.
- **Site rules as packs:** the San Juan County rules become one optional pack, so other sites are not cluttered by Lopez Island rules.
- **Sharing:** cloud saves, named versions and comments from your teacher or classmates.

Open question for then: whether the published site can call the USGS service directly from the browser, or whether terrain is fetched by a small server function.

## Brief for Claude Code

Save this doc as `PLAN.md` in the repo and keep the old planner as `legacy/islandale-planner.html` for reference. Start the first session with:

```
Read PLAN.md. We are rebuilding the Islandale Site Planner as a
Vite + TypeScript + React Three Fiber app, Islandale only for now.

Phase 1: set up the project, then extract the terrain grid, parcel
line and schemes A–D (with C2–C4) from legacy/islandale-planner.html
into JSON under data/islandale/. Write tests that check the terrain
size and the parcel area (0.48 ac / 20,847 sq ft) match the old file.

Work one phase at a time. Before coding a phase, tell me the plan
in a few lines and wait for my OK. After each phase, run the app,
check it in the browser, and commit.
```

**Working rules to give it (or put in `CLAUDE.md`)**

- The plan is data in the store; the scene only draws from it. No feature edits another feature's objects directly.
- Every new action is undoable and respects locks.
- Use real units: feet and inches in the UI, metres internally, NAVD88 elevations.
- New shaders and effects in TSL so the WebGPU switch is painless.
- One phase per branch; commit small; keep the app runnable after every commit.
- When porting a feature, compare against the legacy file's behaviour and note any deliberate change in `PLAN.md`.

## Deliberate changes from the legacy file

Record here any behaviour that the rebuild intentionally does differently from `legacy/islandale-planner.html`.

- Phase 2 draws every object as a plain prism of its footprint (no roofs, wings, cuts or interiors) in its legacy colour; the full geometry returns in Phase 5. Curved footprints draw as their bounding box until then.
- A legacy bridge's route points are stored relative to the bridge's position instead of as absolute site points, so the bridge can be moved as one object.
