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

Six phases (plus 3B and 3C, added after Phase 3), each ending in something you can open and use. Lock and hide names land in phase 2, so the app is useful before the visual overhaul starts.

| Phase | Builds | Done when |
| --- | --- | --- |
| 1 · Foundation and data | Vite + TypeScript + R3F project, plan store with undo, Islandale data extracted to JSON | Terrain and lot render, and tests match the old file's terrain grid and 0.48 ac parcel |
| 2 · Core editing (first usable version) | Select, move, rotate, resize; lock; labels switch; layers panel; Scheme C cabins; autosave | You can rearrange Scheme C, lock it, hide names, reload, and find it unchanged |
| 3 · Graphics | PBR materials, sky lighting, soft shadows, ambient occlusion, cabin detail, display styles | Realistic and White model both look presentation-ready from the saved views |
| 3B · Design fidelity | Cabin wings (porches, decks, stairs), curved sitting steps, railings, curved boardwalk, roofs fitted to the outline, species trees, contours, cabins set into the slope | Scheme C and C2–C4 show everything the old planner shows, side by side from matching views |
| 3C · Keep the work, fit the openings, one home | Autosave that never loses work in both planners, save history, an openings editor and fit rules in both planners, one shared home for the plan that Claude Code (and Claude chat, if hosted) can edit | No edit is lost on close or reload; every opening fits its wall in both planners; the plan lives in one named place Claude can edit |
| 4 · UI and beginner experience | Four task tabs, one inspector, Beginner mode, tooltips, first-run tour, Present mode | Someone new can place, move, lock and save a cabin in about a minute without help |
| 5 · Port the rest | Decks, supports, walls, interiors, paths, stairs, railings, paint, site rules, archive | Every feature you still use from the old planner works, with undo and locks |
| 6 · Exports and renders | Path-traced stills, images, PDF plan / elevation / section sheets, glTF for SketchUp | The class deliverables come straight out of the app |

Don't start a phase until the one before passes its done-when check; that keeps the app runnable the whole way through.

Per-phase plans live next to this file: [PLAN-PHASE2.md](PLAN-PHASE2.md), [PLAN-PHASE3.md](PLAN-PHASE3.md), [PLAN-PHASE3B.md](PLAN-PHASE3B.md) (added after Phase 3: draw the full design before building tools on it), [PLAN-PHASE3C.md](PLAN-PHASE3C.md) (added at Finley's request: never lose work, openings that fit, one home for the plan), [PLAN-PHASE4.md](PLAN-PHASE4.md) (Phase 4 widened to graphics polish, tools and UI).

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

## Editing the plan from Claude

- **Claude Code, in this repo:** edit `data/plans/islandale.plan.json`. A running `npm run dev` app picks the change up as one undoable step. `npm run plan:commit` commits it.
- **Claude chat or Claude Code, anywhere:** edit the hosted home's database row `plans/islandale` in https://claude.ai/artifact/HpHkXNcd2ZWnp2UVdvPc3m. Read it first, then `update` with a merge such as `{"plan":{"objects":{"C-1":{"name":"..."}}}}`, pinned to the version you read. Anyone with the hosted page open sees the change. The old planner's layout is the row `legacy/layout`.
- **Keeping the two in step (Claude Code):** to pull, read `plans/islandale` with ArtifactData (`out_dir`) and write its contents to the repo file. To push, `set` the repo file into the row with `file_path`, pinned to the version last read. A pinned write fails if the row changed since that read, so neither copy is overwritten blindly.

## Opening fit rules

Both planners use these numbers (`src/buildings/openingLayout.ts` and the old planner's `ext:openings-fit` block). Lengths are feet; a cut's `x` runs from the wall's left end as seen from outside to the opening itself, and the trim sits outside that.

| Rule | Value |
|---|---|
| Outer frame to a wall end | at least 0.75 ft (9 in); across a corner sharper than 150°, the next wall's thickness (0.66 ft) ÷ sin(inside angle), if more |
| Gap between two openings' outer frames | at least 4 in; a later opening slides along, then narrows, else it is marked as a conflict |
| Head | sill + height at most the eave minus 0.5 ft |
| Sill | at least 0 (the floor); a window with sill 0 keeps it |
| Default trim (casing) | 3.5 in |
| Smallest width or height | 1 ft |
| Snap (old planner's editor) | 1 in, rounding inward so a snap never crosses a limit |
| Wall covered by another enclosed part | the opening is kept but hidden |

Stored fields shared by both planners: `id`, `kind` (window, slider, door, cutout), `edge`, `along`, `x`, `w`, `h`, `sill`, `trim`, `mullV`, `mullH`. Head and from-right are worked out, not stored.

## Deliberate changes from the legacy file

Record here any behaviour that the rebuild intentionally does differently from `legacy/islandale-planner.html`.

- Phase 2 draws every object as a plain prism of its footprint (no roofs, wings, cuts or interiors) in its legacy colour; the full geometry returns in Phase 5. Curved footprints draw as their bounding box until then.
- Phase 3 draws openings as framed glass on the wall face rather than cutting the wall, and fits pitched roofs to the footprint's bounding box as the legacy roofGeometry did. Saved views and sun settings are new; the planned "Deck at sunset" view became "Golden hour" at 4:45 pm, because the legacy sun maths sets the September sun at about 6:20 pm and the west slope shades the cabin before then.
- A legacy bridge's route points are stored relative to the bridge's position instead of as absolute site points, so the bridge can be moved as one object.
- Phase 3C (new app): autosave also saves when the tab is hidden or closed, writing a synchronous copy to localStorage (`islandale-plan.shadow`); the newer of the two copies wins on load. An unreadable save is kept as `islandale-plan.unreadable-<time>` before autosave resumes, and a file from a newer app opens read-only. The last 20 saves are in History. Only one tab edits at a time (a Web Lock); others are read-only until they take over. The leave-page prompt shows only when a save has failed, because the closing copy covers a save that is still pending.
- Phase 3C (old planner), block `ext:autosave` appended to the end of `legacy/islandale-planner.html`: the layout saves to `islandale-layout` 0.4 s after every undoable change, every 2 s if anything else changed it, and when the tab is hidden or closed. "Save in browser" became "Save now". A History list keeps the last 10 layouts in `islandale-layout.history`, plus the layout as it was opened. The Walls editor's first change each time it opens also goes on the main undo stack.
- Phase 3C (new app): the plan's home is `data/plans/islandale.plan.json`. While `npm run dev` runs, the dev server serves it at `/__plan`; every write names the revision it was based on, keeps the previous version in `data/plans/.history/` (last 50, not in git), and is refused if the file changed meanwhile, in which case the file's version loads as one undoable step. Editing the file (Claude Code) updates the open app the same way. `npm run plan:commit` commits it. End-to-end tests run their own server on port 5174 with their own plan folder.
- Phase 3C (new app): openings are laid out by the fit rules above, drawn with flush casings that close at the corners, and edited in the Openings panel. An edit stores the fitted numbers; a saved scheme that breaks the rules is not changed when it loads, and the panel offers **Fit all**. Resizing or reshaping a cabin re-fits its openings in the same undo step. An along-cut is one opening with jambs only at its ends and at sharp corners.
- Phase 3C (old planner), block `ext:openings-fit`: the Walls editor's clamp (`wlClamp`) is replaced by the fit rules, the fields take feet and inches and gain Head, From right, Trim, Mullions, Centre and Align heads, From-left reads correctly on mirrored curved walls, openings on straight walls get a flush frame inside the hole, and a wall covered by another part says so. Opening the Walls editor fits that building's openings as one undo step; resizing a building re-fits them. Not done there yet: frames on curved walls, starting doors at the slab top in 3D, and merging overlapping holes in `wallMeshes` (the fit now prevents overlaps).
- Phase 3C (both planners): the hosted home is the claude.ai artifact https://claude.ai/artifact/HpHkXNcd2ZWnp2UVdvPc3m, with capabilities `{db, user}`. It serves the new app's build as the page and the old planner as `legacy.html`. Only the main page gets the claude.ai runtime, so the **Old planner** button (shown only in the build) opens the old planner in a frame over the new one, and its `ext:hosted-home` block borrows the main page's runtime. Under the dev server the repo file stays the home; on claude.ai the new app uses `src/store/artifactHome.ts` instead. The plan is one database row, `plans/islandale`, holding the plan file as an object (about 70 KB, under the 256 KiB row limit; a bigger plan is refused with a toast and stays in the browser). This is simpler than the planned one row per object, because the store has no transactions and a half-written plan would be worse than a refused one. The revision is a hash of the row's content, so an edit made anywhere counts. A change notice counts only when its revision is one this page has neither read nor written, and it waits behind any save in flight, so the app never mistakes its own save for someone else's. A file from a newer planner turns the tab read-only instead of being saved over. A short `acquire` lease, retried for a few seconds, keeps two tabs or devices from writing at once. While the page waits for the database on opening, the plan is read-only ("Opening the saved plan…"), so no edit is lost when the saved plan loads.
- Phase 3C (old planner), block `ext:hosted-home`: the layout goes to the row `legacy/layout` as `{layout, savedAt}`, taken from the page itself rather than from browser storage. Before each write the row is read. If someone else changed it, their layout is loaded as one undoable step and nothing is written over it. Late echoes of this page's own saves are ignored. The browser remembers a hash of the last hosted version it saw (`islandale-layout.hosted-seen`): on reopening, a layout newer here is kept and sent up, and an edit made elsewhere wins. A hosted layout that fails to load is left in the database untouched, with a warning. Outside claude.ai the block does nothing. `npm run build` copies the old planner into `dist/` as `legacy.html`.
- Paths and rails (branch `paths-rails`, Oct 28 2026). **Pads drape over the ground**: paths, lanes, the driveway, parking and the patio are cut into 1 ft cells, and every vertex sits the pad's thickness above the ground as the terrain mesh draws it (`surfaceElevationAt`, sunk-floor cuts included), with a skirt down the edges. The old planner drew them as flat slabs at the ground height of their centre, so "Path to beach" floated or sank by up to 1.2 m. Other flat objects (gardens, meadows, boulders) are unchanged.
- Paths and rails: **a boardwalk whose route only falls (or only rises) keeps one even grade** with plan distance from its first point to its last. The old planner's 3D spline spread the fall unevenly, so a stretch of the Elders' walk ran at 1:19. The walk's real grade is 1:20.4 (3.8 ft over 77.4 ft along the curve), not the 1:21 in its name; the route data was left as it is.
- Paths and rails: **rails follow the old planner's rules**, replacing Phase 3B's "only where the drop under that 2 ft piece passes 30 in". Deck wings are railed on every open edge whatever their height, except sitting-step edges, and `rail: 'sides'` leaves a deck's ends (odd edges) open. Porches are railed all round when raised, forced, or when the ground 0.9 m outside them is more than 30 in below the floor plus its 0.15 m slab (legacy `surfaceDropFt`). Every stair wing has handrails unless its rail is off, even one landing level with the ground (the old planner counts its slab as a step). This adds the rails on the Gathering prow stair, the Elders' wedge rear porch and the wedge deck's open ends; C and C2–C4 now rail exactly the wings the old planner does. Rail pieces next to another mass are still left out.
- Known limits of the hosted home. The page's database has no conditional write, so a Claude edit landing in the instant between the page's check and its write is still lost; Claude's own writes are pinned with `if_version`, so they never overwrite the page. When the old planner loads an edit from Claude, it saves the layout in its own form, which drops fields it does not know and rounds positions.
- Phase 3C: the old copies cannot be brought in automatically, because each page's browser storage belongs to its own site (localhost, the old artifact, the hosted home) and none can read another's. The repo file already holds the localhost plan and was written into the hosted row. To bring in the old artifact's layout, use **Copy layout as text** there, then in the hosted home click **Old planner**, **Paste layout…**, paste, and **Load it**.
