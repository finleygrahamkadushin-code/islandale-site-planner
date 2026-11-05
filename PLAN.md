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

**Order change (Oct 29 2026, Finley's OK):** Phase 5 parts 5A–5D come before Phase 4, because the design itself is what the new app is missing; Phase 4 follows with 5E's tools folded into its Track 2, then 5F. See [PLAN-PHASE5.md](PLAN-PHASE5.md).

**Order change (Nov 2 2026, Finley's request):** drawing sheets, part of Phase 6, come forward and land on their own branch (`drawing-sheets`, cut from `phase-5a-parts-rails`), because Finley draws each building by hand at 1/4" = 1'-0" for class now. The rest of Phase 6 (path-traced stills, section sheets, glTF) stays where it is. See [PLAN-DRAWING-SHEETS.md](PLAN-DRAWING-SHEETS.md).

Per-phase plans live next to this file: [PLAN-PHASE2.md](PLAN-PHASE2.md), [PLAN-PHASE3.md](PLAN-PHASE3.md), [PLAN-PHASE3B.md](PLAN-PHASE3B.md) (added after Phase 3: draw the full design before building tools on it), [PLAN-PHASE3C.md](PLAN-PHASE3C.md) (added at Finley's request: never lose work, openings that fit, one home for the plan), [PLAN-PHASE4.md](PLAN-PHASE4.md) (Phase 4 widened to graphics polish, tools and UI), [PLAN-PHASE5.md](PLAN-PHASE5.md) (Phase 5 split into six parts from an audit of every feature the old planner has, with the full gap list).

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
- Phase 5A: **per-edge rails keep what is drawn on the first edit.** Overrides are stored as the old planner stores them (`rails: { [edge]: true | false }` on the wing, or on a standalone deck's own params; a missing edge is auto). A wing with no map keeps the whole-wing rule above, so C and C2–C4 look as they did. The old planner's first per-edge write froze only the `rail` flag, so low deck edges lost their rails at the first click; the new app instead stores on or off for every edge where the whole-wing rule and per-edge auto disagree, leaves the rest on auto, and drops the `rail` flag, so a click changes only the edge clicked. Rail edits are refused on a locked building (the old planner has no locks).
- Phase 5A: **wing edits tidy what is keyed by index.** A wing's rotation is stored in (-180, 180] (the old planner mixed -90 and [0, 360)). Its per-edge rails are dropped when its shape, points or edge count change, since they would name the wrong edges. Removing a wing moves later wings' exterior settings (`ext.masses["n"]`, `ext.walls["n:edge"]`) down one in the same undo step and drops the removed wing's, where the old planner left them on the wrong wing. Mass numbers everywhere skip malformed wings and stop at 12, and adding a 13th wing is refused with a toast.
- Phase 5A: **rail style lives where the old planner keeps it**, per building at `ext.parts.rail.style` (wood is the default and is not stored; emptied `rail`, `parts` and `ext` objects are removed), and a part's own `ext.masses["n"].rail.style` still wins when reading, so both planners and the hosted home agree.
- Phase 5A: **rails open where the old planner opens them**, replacing "rail pieces next to another mass are left out" (2 ft pieces, 1.5 ft halo, any mass of the building). Each edge now keeps the runs left by: this building's stair and ramp tops (the exact span of the top, the old `stairTopSpan`), path-piece and bridge ends within 0.35 m (plus 5 cm each side), other objects' deck edges lying along it, a door's 36 in landing (its width plus 15 cm each side), and enclosed walls within 0.45 m and parallel within about 10°; runs of 15 cm or less are dropped. Porch rails still stop 0.6 ft short of the main walls, and porch posts in front of another mass's door are left out. One deliberate difference: a stair's top span is worked out on each edge it meets (its sides carried along the stair to that edge's line) rather than on its host edge alone, so a stair across two facets of a curved deck opens both exactly; and doors hidden inside another enclosed mass open nothing. C and C2–C4 still rail the same wings; `railedEdges()` in the scene and `src/scene/railSite.test.ts` record the edges.
- Phase 5A: **per-edge rule once a wing has a map** (old attach-core `rails`): an edge that is not a sitting-step edge is drawn when it is on, or when it is auto, free (no other mass of the building covers it) and has the ground 0.9 m outside its ends and middle more than 30 in below its walking surface. One deliberate difference from attach-core `rails`, which never draws a covered edge: an explicit on draws a covered edge too. A wing with no map keeps the whole-wing rule, which draws covered edges as well (main and enclosed walls then open them, but runs stay where the cover is another open wing or the house covers only part of the edge, as on A-0's deck, D-0, G-1 and I-1's rooftop porch); the first edit stores on for those edges, so they keep their runs and a click changes only the edge clicked. Covered edges have no chip, and an all on or all off writes free edges only, so it returns covered edges to auto (not drawn), as in the old planner.
- Phase 5A: **rail styles at the new app's 36 in.** Wood keeps the new app's guard (top rail at 36 in, bottom rail, posts about every 6 ft, balusters at 4 in gaps) for porches, deck wings and standalone decks alike, where the old planner drew three different wood guards 0.65 to 0.95 m high with no balusters (and deck-wing posts standing 0.3 m above their rail). Steel, cable and glass use the old planner's member sizes and spacing (posts every 1.5 m, 1.2 m for cable; steel pickets every 11 cm; seven cables; 12 mm glass panes) but top out at 36 in. Steel and cable are #3b3f44, wood deck rails #6e5a44, porch rails the wall colour, glass #a9d6e2 at 30% opacity in the realistic style (the white model, sketch and diagram give the panes their window-glass tones, still at 30%, with sketch edges). Style `none` draws no guards and no stair handrails.
- Phase 5A: **standalone decks** (`type 'deck'`) are drawn as a deck on posts at their height, with guards all round when more than 30 in up or when their rail is on (the old `guardRing`), per edge once they have a map, instead of a plain prism.
- Phase 5A: **stairs and ramps are built as the old `stair-geom` block builds them**, replacing Phase 3B's solid tread blocks with a run stretched to 11 in treads. The run stays the wing's depth and is split into one tread per riser (risers of 7 in or less); a wing too short for 11 in treads is drawn as it is and marked not ok (`stairInfo`, flagged in the part inspector). Stairs get 4 cm treads with a 2.5 cm nosing, the top tread fitted to the host edge it meets (the nearest same-level edge within 1.5 ft, straight, angled or curved), 2 cm closed risers, housed 4 × 25 cm stringers, 9 cm posts every 2.4 m where a stringer is more than 0.4 m off the ground, and a 10 cm concrete foot plate. Ramps are drawn for the first time: a level plate to the host, one slope over the whole run, 2 in curbs and skirt boards to the ground; their slope and a steep warning past 1:12 are computed (`stairInfo`) and shown in the part inspector, and there are no landings (as in the old planner). Handrails stand 0.9 m over the nosing line or slope with posts at most 1.2 m apart and the building's rail style (wood balusters every 10 cm, two steel rails, cables, or a glass pane); stairs need more than one riser, ramps always have them; with a door of any building at the top they start 0.3 m further down and leave out the top post (the old rail-clear rule, which also overrides a wing's own `clearTop`, as it does in the old planner). Deliberate changes: **datum** (option B): the drop is the building floor less the ground at the nominal foot, at least 0.3 m, plus the wing's level, with no 0.15 m slab, so the top is flush with the floor and the foot plate sits on the ground; riser counts can be one lower than the old planner's (C's prow stair has 2, not 3). The 0.3 m least drop still gives every stair at least two risers, so every stair wing keeps its handrails unless its rail is off or the style is none, and C and C2–C4 rail the same wings; only a stair whose foot is pinned (`footZ`) can come down to one riser, and then it has no handrails. The host is found by the nearest-edge rule only, not the old join-core junction match, so C-2's stair, 3 ft off its porch, keeps a straight top. The foot plate uses the shared concrete surface and posts the shared wood surface rather than the old #8a8780 and #6e5a44, and the old per-part paint colours for stairs and ramps wait for the Exterior panel.
- Phase 5A: **picking and editing parts** works as the old `wing-select` block does (click a selected building again, or Alt+click, to pick the part under the pointer; Escape drops the part first, then the selection; an outline, a HUD chip with the old text, edge squares, a grip and a knob; arrows nudge a wing in site directions, Q/E/R turn it, Delete removes it), with these deliberate changes: **edge drags snap to 1 in**, not 1 ft (Shift is free); **the grip slides a wing along the host edge it touches** (the nearest edge of another part lying along one of its own within 0.6 ft and 10°; stairs and ramps host nothing), moving its centre in 1 in steps, and moves it freely on the ground with each building axis snapped to 1 in only when it touches nothing (the old grip always moved freely in 1 ft steps); the knob is free with Shift rather than in 1° steps. Each drag, key press, add and removal is one undo step and is refused on a locked building with its toast; a locked building can still have a part picked to read it, but shows no handles or chips. The handles and chips are DOM chips pinned to the scene, offset on screen as the old ones were (rail chips 22 px out, + chips 44 px), and they keep their clicks from selecting or clearing what is behind them.
- Phase 5A: **adding parts from the + chips** follows the old `attach-add` sizes, placement, slide-along-the-edge and refusals (Deck, Porch, Stair, Ramp, and Door on enclosed walls; the new wing becomes the picked part). Stair and ramp runs are sized from the displayed ground (sunk buildings' cuts included), where the old planner sampled the raw terrain. A ramp needing more than 40 ft is refused with the old toast but Connect does not start (it comes in 5C), and the `Stair → …` and `Connect…` buttons are left out until then. The door toast points to the Openings panel ("move or resize it in Openings"), the new app's place for it, rather than the old Walls editor. The old "Add to this part" side panel is not ported; the + chips and the part inspector cover it.
- Phase 5A: **the part inspector** replaces the cabin's position and size fields while a part is picked: kind (with the old side effects: stairs and ramps lose roof and walls and are 3 to 8 ft wide, a deck is 1 ft high, other kinds take the cabin's wall height if they had none), name, width, depth or run, wall height, level (0 to 30 ft), offsets and angle, in feet and inches (offsets take a leading minus), a rail summary for decks and porches, risers, treads and an ok warning for stairs, slope and a steeper-than-1:12 warning for ramps, Remove and Back to cabin. The main walls show only width, depth and wall height. The Railings panel and rail chips show an edge of a wing with no per-edge map as auto with what is drawn ("auto (railed)" where the whole-wing rule rails an edge that per-edge auto would not).
- Phase 5A: **a new width or depth scales a poly or blob part's points** about its origin, to 0.01 ft, from the part inspector or the cabin's own size fields, as the old `orgScale` does, so C-0's main walls and Deck 3 can be resized; a Kind change, which clamps a stair or ramp to 8 ft wide, leaves the points alone, as the old planner's does. Because the points change, a per-edge rails map on that wing is dropped (see "wing edits tidy what is keyed by index"), where the old planner kept it.
- Phase 5B: **floor plans are plan data with one undo stack.** A cabin's floors stay in `params.floors` as the old planner stores them, and every interior edit (rooms, openings, furniture, floors) is one step on the main undo stack and is refused on a locked cabin or layer, where the old interior editor kept its own 60-step undo and had no locks. A and B's rectangle rooms `{x, z, w, d}` and side openings (`side: n/e/s/w`) are migrated when read, as the old `ensureFloors` does, but written back only by an edit, so loading a scheme changes nothing in the file. New ids continue from the highest id in that cabin, rather than from one counter shared by every cabin.
- Phase 5B: **the interior editor** opens from the cabin inspector's **Interior** button over the whole window (the old one sat over the 3D view), with Back to 3D, Escape stepping back (tool, then selection, then closing). The plan pans by dragging empty floor, with the middle or right button, or with Space held, and zooms with the wheel; there is no separate pan tool (old H). An opening is dragged along its own wall. While the editor is open the 3D view's keys (Delete, arrows) do not act on the cabin; undo and redo still work.
- Phase 5B: **left for later**, as the 5B plan says: auto-fill rooms, auto doors and windows, auto-furnish, the walk check and Describe it. Showers keep the catalogue's plan symbol and a plain box in 3D; their curb, drain, glass and bench are stored, checked and shown in the inspector, but not drawn yet (old shower symbol and 3D detail).
- Phase 5B: **Roofs off** (from 5E, needed to see the rooms) hides every roof and the wall-top cap; porch top beams stay. It is view state, not saved with the plan.
- Phase 5C: **path pieces** keep the old fields (`kind`, `surface`, `rail`, `ends {zA, zB}`, `lift`, length `w`, width `d`) and end-level rules. Walks still draw as draped pads; stairs and ramps are built by the same stair planner as stair and ramp wings (the old stair-geom path); landings sit on a skirt and boardwalks on posts every 6 ft or so, both with 36 in guards (posts every 4 or 6 ft, a mid rail) in wood, where the old pieces drew their own simpler handrails. New pieces come from a **Path pieces** panel (the old library entries): a ghost box follows the pointer, R turns it, a click places it, Escape stops. A piece snaps when placed and when moved by hand (no Shift-to-skip yet, since the gizmo does not see Shift), and snapping reads the surveyed ground. **Continue from A / B** are buttons in the Path piece panel instead of a double-click near an end.
- Phase 5C: **Connect (C)** shows a chip on every door, free deck or porch edge, stair or ramp foot, piece end and driveway edge (targets within 0.6 m share one chip) and puts the options in the side panel rather than a popover. It offers walk, boardwalk, ramp and stair; the old Steps and Bridge options are left out, and the ramp option uses only the straight chain (1:12 runs with 5 ft landings), not the ground-following auto route, so where no straight ramp fits it is greyed out with the length it would need. A stair's level pad at the foot is added for any gap over 1 mm (old 5 cm), so a chain always ends on the picked end. Built pieces are named after the option and the place they reach.
- Phase 5C: **Levels & junctions** sits in the building's inspector. Fixes are worked out as patches and applied as one undo step; a locked object gets none (the old planner had no locks). A snap-end fix slides the piece onto the edge point without turning it. Hidden objects are ignored; only cabins and standalone decks are hosts; a wing's level item always shows on its own row. "6 in step" chips show only where a junction steps (not where something is far off level), at the higher surface.
- Phase 5C: **the accessible-route check** leaves hidden objects out, gives route verdicts to cabins only (standalone decks lend their edges), counts kindless pads as path pieces only up to 6 ft wide (so Scheme C's 7 ft lanes are not route pieces, as in the old check), and takes door anchors from the wall layout's door pieces, so a door split across two facets of a curved wall can give two anchors. Fix piece chooses its fix from the issue code and closes a gap by snapping. Auto route pieces keep `rail` on auto. The route verdicts are a side-panel section (shown when nothing is selected) and the piece verdict sits in the Path piece panel; the code check panel itself waits for 5E.
- Phase 5D: **curved outlines** (ellipse, kidney, teardrop, blob, ribbon) come from the old organic maths in `src/buildings/organic.ts` and are returned by `localFootprint`, so walls, slabs, posts, rails, openings, earthworks and the drawing sheets all read the same curve (about 1.5 ft chords, 32 to 96 points, starting at the back centre). Ribbon is a pad shape only, as in the old pad editor. A ribbon's new width scales its centreline (old `orgScale`); its path width is just the number.
- Phase 5D: **the Shape and roof fields** sit in the cabin inspector and the part inspector (footprint, the one extra field the old planner shows for it, roof type, ridge, pitch, overhang, finish and shell curl; pads get their shape list and Cars drawn). Each change is one undo step and is refused on a lock. Shell curl is shown for vault too, which ignores it.
- Phase 5D: **walls are built with thickness and real holes** (`src/buildings/wallShell.ts`), replacing Phase 3's framed glass on the face. One mitred band per mass, smooth where a vertex bends less than 30° and creased at sharper corners (the old planner chose by shape: one smooth band for curved shapes, overlapping boxes for straight walls). Reveals are square to the wall and ends meet at a true mitre. Holes come exactly from the 3C layout's pieces, so an along-cut that turns a sharp corner opens the corner; buried openings cut no hole. Glass and door leaves are boxes at mid-thickness (2 cm glass, 4.5 cm door); casings and sills stay on the outer face. Thickness is per edge, so a glass wall beside a solid one mitres to both. Curved glass walls get the mullion grid too (the old planner drew them bare). The ceiling cap covers the inside ring in the wall colour. Along-cuts that run past the end of the perimeter are still dropped (3C), not wrapped.
- Phase 5D: **sculpted roofs** (`src/buildings/sculptRoof.ts`) port the old `roofSurface`: dome and sod from the membrane solve, vault and shell from the chord with curl and the ridge sweep, saddle as a hyperbolic paraboloid, with slab, soffit, fascia, glass or cladding infill, porch struts, ribs, contours, seams and mullions, and seeded sod tufts; gambrel has its own two-pitch roof. Deliberate changes: the eave offset uses `polyOffset` (corner clamp 0.5 rather than 0.4); copper and sod tops use their finish texture and one colour instead of per-vertex patina and turf mottling; tufts are drawn only in Realistic; classic roofs in glass get a 1.2 m mullion grid with glass soffit and fascia; a rectangular gambrel's ends are filled in the siding with a fascia and soffit; the sod roof type is the old membrane pillow, replacing Phase 3's flat slab; the C4 tip column takes its height from the drawn prow roof. `roofTipPost` is not read from the data yet, and `sculptRiseFt` waits for the height check.
- Phase 5D: **finishes go through the old `ext` model** (`src/buildings/exterior.ts`): a painted wall (`ext.walls["mi:edge"]`), then a painted mass (`ext.masses[mi]`), then the whole house (`ext.parts`), then the scheme's own fields, then the defaults, for walls, roofs, gable and dome infill, trim, decks and rails. A stored value that is not valid is passed over to the next scope; a paint with a bad value, part, mass or wall is refused (the old code ignored these); only `null` removes a field; a whole-house wood rail is not stored (as 5A's rail style); an edit that changes nothing is no undo step; colours are always `#rrggbb`; a curved mass has one wall, `"mi:0"`; stairs and ramps read the deck. Roofs with no colour of their own are the wall colour × 0.55 (old default); metal takes the scheme's or a painted colour, else #8d949a; copper and sod keep their finish colour unless painted; trim keeps the roof colour unless painted. Wall kinds and roof finishes are the old five and four (cedar, board, timber, stone, glass; glass, copper, metal, sod); "painted" keeps the building's siding.
- Phase 5D: **Paint mode (P)** works as the old one does: a click picks the element under the pointer (its part, mass and wall) for the **Exterior panel**, whose fields then paint it at the chosen reach (this element, this mass, whole house), rather than stamping a separate brush on click as the 5D plan first said. Other objects say paint works on buildings and decks; a chip names what the pointer is over. The panel also lists every override with its reset, the old presets, and Reset exterior, and works without Paint mode from its Mass, Part and Wall selects. A paint is one undo step and is refused on a lock.
- Phase 5D: **earthworks** (`src/site/earthworks*.ts`) port the old `earthRebuild` passes: fill benches, sunken courts, berms against chosen walls with a rounded crest (never filling inside a building), ponds (water at the lowest rim point less 0.06 m, a soft bowl, a wet margin), retaining walls along deep cuts in stone or concrete, and the old ground tints (berm, court, bank, mud, wet), shown in Realistic over the new ground colours. Objects whose reaches overlap share one fine patch and others get their own (the old planner used one), each pinned to the survey at its edge so it cannot crack against the terrain; the ground is rebuilt when the plan changes, not during a drag. Sunk floors now behave as in the old planner, replacing Phase 3B's simplification: the cut sits at floor − 0.03 m with a 3 ft margin, a 10 ft court downhill and a retaining wall in a steep cut edge (Scheme C's sunk prow gains its court and stone wall). Kept from the old planner although it looks like a slip: berms on curved buildings filter out chords under 0.5 m, so 'uphill' falls back to the steepest chord and courts to edge 0 (Scheme E's under-the-hill hall and Elders' hollow).
- Phase 5D: **site objects are drawn as themselves**: meadows (seeded tufts and flowers over their outline; a meadow with no seed of its own is seeded from its id, where the old planner used load order), boulders (seeded rocks, identical to the old ones for D–I), pools (coping, shell, water and infinity spill at their level; the water is a true offset by the coping, so F's 42 × 9 ft horizon pool holds 39.6 ft of water, not the old 30.8), shed and shop as small buildings with the old library's defaults, and parked cars (as many as fit a 2.3 m bay, up to 8, resting on the draped pad; the old planner drew none when they did not all fit). Pools do not cut the ground, as in the old planner.
- Phase 5D: **supports** are drawn by kind as the old `supportsMesh`: piers, pilings and posts on beams, x-bracing between outer posts over 1.8 m (decided per bay, rectangles only), stilts as raking struts on footings, a mast core with a strut to every plate point, slab skirts with an apron, ring-and-grid posts on curved plans. Every member runs to the real ground under it, not one depth per building. Standalone decks stand on their own supports. **Bridges** come in the old ribbon, truss and cable styles.
- Drawing sheets (Phase 6 work brought forward, branch `drawing-sheets`): **the old planner's floor-plan and elevation sheets are replaced** by true-scale sheets from the **Sheets** button. Each building gets a vector floor plan at 1/8", 1/4" or 1/2" = 1'-0" on Letter, Tabloid, Arch C or Arch D, with every straight edge, curve (radius, sweep, arc length), opening and stair dimensioned, tiled across pages with alignment marks when it does not fit one. It also gets four elevations rendered from the live 3D scene as black lines on white at the same scale, with grade, level lines in NAVD88 and dimension chains, and measurement tables with a CSV download. A 1 inch check bar sits on every sheet. The old sheets were SVG drawings shown as an image to save or copy, not laid out on paper at a print scale, and its floor plans needed rooms. The site plan is not ported yet. Curved footprints are drawn as their true outline (Nov 4 rework): each curve as arcs meeting end to end (an ellipse by the four-centre construction, with its exact centre and axes), labelled only where its arcs meet, with stations every 2 ft round from P1; openings on a curve are located round the wall from P1, as the old planner stored them. Walls are drawn with their thickness (Nov 4 rework): the outline is the outside face, which every dimension is to; the inside face is drawn and the wall hatched (glass curtain walls thin and unhatched), openings cut through with square jambs and glass at mid-wall, curved walls give both radii, and each part's thickness is dimensioned. The old sheets drew walls as a single line. Roofs are measured from the scene's own roof (Nov 4 rework): the same parameters, finish and builder, so shell and dome rises match; levels are named by roof type (high and low eave, valley, gambrel break, apex, crown, shell lip, a dipped prow's tip eave and tip column), slopes are given as built, and the plan draws the roof's ridges, hips, valleys and breaks as the 3D mesh has them, sculpted contours, ribs and lip, a shed's slope arrow and the tip column. The old plan sheet drew roof linework by type from its own formulas; the new one reads it off the built roof. Earthworks and levels (Nov 4 rework): the Levels table gives finished grade (the earthworked ground the scene shows) and surveyed grade at the walls separately, with the cut floor, berm crests and the sink; retaining walls, berms, sunken courts and the limits of fill and cut are drawn on the plan with spot heights and listed in their own tables, and the elevations draw the survey dashed where it differs. The old planner's plan sheet showed berms and walls from its earthworkPlan; the first new sheets had none and called the finished grade "grade under the building". Enclosed and deck areas count overlapping parts once. Door swings are not stored (exterior cuts have no hinge or swing field), so the plan draws them opening in from the right jamb, dashed, and says they are assumed. Rooms (Nov 4 rework): the plans draw each floor's rooms from the interior plan (partitions as double lines, interior doors with their stored swing, each room's name, size and area inside its walls, furniture when asked), one plan per floor on a cabin of several, with Rooms and Interior openings tables; partitions and openings are tested against the true walls, so on curved cabins the editor's chorded "partitions" along the curve are not drawn, and room areas are inside the 3D shell's 8" walls where the interior editor's own net uses 6". The old sheets drew rooms from the old interior model; the first new sheets had none. Supports (Nov 4 rework): a foundation plan after the floor plans draws what each part stands on, over the parts' outlines (posts and piles at their section, beams dashed, a mast, stilts and footings), laid out by the scene's own `supportPlan` and wing-post helpers, with one spacing chain per distinct row and column of posts and a Supports table (kind, size, count, spacing, height to the ground); a Supports toggle takes the sheet off. They are kept off the floor plans, where the chains crowded C-0's 1/4" plan. The old plan sheet drew posts, piers and pilings as dots from its own grid formula (`supportPoints`, not the 3D layout), with no size, beams or spacing; the first new sheets had none.
- Drawing sheets, 5D rework (branch `sheets-5d-capture`): **elevations draw the outline each surface makes from that side as well as its creases**, so dome, sod and vault roofs have a profile. An edge the mesh shades smooth is not a crease (round posts and stilt struts read as two lines, not hatching). Elevations always show the roofs: a capture holds them on through Roofs off, and the toggle itself is not touched. They leave out the rooms, sod tufts and every kind of line overlay. They include the building's retaining walls, door thresholds and deck filler strips, which are tagged `sheetOwner`, not `objectId`, so picking and paint are unchanged.
- Known limits of the hosted home. The page's database has no conditional write, so a Claude edit landing in the instant between the page's check and its write is still lost; Claude's own writes are pinned with `if_version`, so they never overwrite the page. When the old planner loads an edit from Claude, it saves the layout in its own form, which drops fields it does not know and rounds positions.
- Phase 3C: the old copies cannot be brought in automatically, because each page's browser storage belongs to its own site (localhost, the old artifact, the hosted home) and none can read another's. The repo file already holds the localhost plan and was written into the hosted row. To bring in the old artifact's layout, use **Copy layout as text** there, then in the hosted home click **Old planner**, **Paste layout…**, paste, and **Load it**.
