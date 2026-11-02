# Phase 5 plan: port the rest of the old planner

Status: **5A approved Oct 29 2026 and in progress, ahead of Phase 4** (option 1 below). Edit anything here; Claude Code reads this file before starting each part of Phase 5.

## Why this plan

The new app draws Scheme C well, but it can only rearrange what is already there. On Oct 29 2026 we audited the old planner block by block. Nine readers covered every slice of `legacy/islandale-planner.html` and checked `src/` for each feature. A checker then spot-checked 27 of their answers (correcting 9) and looked for anything they had missed.

Result: **399 features in the old planner; 56 work in the new app, 62 are partial, 281 are missing.** The full list is in the appendix at the end of this file.

Where the gaps are:

| Area | Missing | Partial | What it means |
| --- | --- | --- | --- |
| Interiors | 89 | 4 | Nothing yet: no rooms, interior walls, furniture, upper floors, indoor stairs or their rails |
| Building parts and rails | 25 | 3 | You can't pick one deck or stair, add a wing, or switch a rail on or off per edge |
| Path pieces, route checks and paint | 28 | 1 | No walk, ramp, stair or landing pieces, no accessible-route check, no Paint mode |
| Joins, stair detail, bathrooms | 37 | 7 | Rails don't open where stairs, paths and doors meet them; stairs are solid blocks |
| Site, objects and tools | 85 | 22 | No library or place tool, measure, snap, setbacks, code check, lot coverage or plan sheet |
| Schemes D–I | 17 | 25 | Curved footprints, shell, dome and sod roofs, berms and pools mostly draw as boxes |

Until a feature is ported, the **Old planner** button still opens the old file in a frame.

## Order

Phase 5 is too big for one branch, so it is split into six parts. Each part gets its own branch, ends in something you can use, and has its own done-when check. What you asked for comes first (rails, interiors), along with the pieces the other parts build on.

| Part | Builds | Done when |
| --- | --- | --- |
| **5A · Building parts and rails** | Pick one part (deck, porch, stair, ramp, wing) in 3D; drag its edges, move it and turn it; **+** chips on free edges to add a deck, porch, stair or ramp; ramp wings drawn; a Railings panel with auto / on / off per edge and rail chips in 3D; rail styles (wood, steel, cable, glass, none); rails decided per edge from the drop, as in the old planner; rails open where a stair, path or bridge lands and at doors; porch posts kept out of doorways; standalone decks railed; real stairs (nosed treads, stringers, posts under long runs, handrail detail) | Every Scheme C part can be picked, resized, added and removed with undo and locks; every rail can be switched per edge; C and C2–C4 rail exactly where the old planner does, openings included |
| **5B · Interiors** | An interior editor for each cabin: floors (main and upper); draw, split, merge and reshape rooms; room types and colours; interior doors, windows and cased openings; a furniture catalogue with move, turn, resize and mirror; partitions, furniture and **indoor stairs with handrails and guards** in 3D; the upper-floor slab with its stair hole; floor stats; the program checklist; bathroom checks (ICC A117.1); the floor plans that ship with the scheme data | You can open any Scheme C cabin, see its floor plan from the data, change a room, add a door and a bed, go upstairs, and see all of it in 3D with the roof off |
| **5C · Paths and connections** | Path pieces (walk, ramp, stair, landing, boardwalk) with surfaces and automatic rails; end-to-end snapping; end levels that follow what each end touches; the Connect tool (pick two ends, straight or L-shaped stair); the levels and junctions report with Fix; the accessible-route check per piece and per building (ADA 402–405) with one-click fixes; auto route | You can connect the parking pad to every cabin with path pieces that snap and meet flush, and the route check says which ones pass and why |
| **5D · Shapes, roofs, finishes and earthworks** | Curved footprints (ellipse, kidney, teardrop, blob, ribbon), drawn and editable; walls cut real holes for openings; shell, dome, vault and sod roofs; roof materials (glass, copper, metal, sod); wall materials; Paint mode and the Exterior panel; berms, fill benches and retaining walls; the meadow, pond, pool, boulders, shed, cars and standalone decks drawn as themselves | Schemes D–I look the way they do in the old planner from matching views, and you can repaint any wall, roof or rail |
| **5E · Site rules and tools** | The object library and place tool, with a ghost preview; duplicate; snap (1 ft, 5°); measure; roofs off; setback sliders and ground tints; the code check panel (SJCC 18.50.540, IRC guards); lot coverage and the program budget (1,600 sq ft cap); clearances and dimension labels; the cursor elevation readout; compass; legend; help; display toggles; PNG snapshot; the old keys (V, M, I, W, P, C, 1–3, Q/E/R, F) | Every tool and readout on the old planner's toolbar has a working match, with undo and locks |
| **5F · Archive** | The Old designs archive with scheme cards; Schemes A, B and D–I load and draw faithfully | Each old scheme opens from the archive and matches the old planner side by side |

Plan, elevation and floor-plan **sheets** (SVG/PDF) stay in Phase 6, where PLAN.md puts exports.

### How this fits with Phase 4

Phase 4 (task tabs, Beginner mode, tour, Present mode) is still a draft and hasn't started. 5E's tools (place, duplicate, snap, measure, help) are the same as Phase 4's Track 2. Two ways to go:

1. **Recommended:** do 5A–5D now, while the design itself is what's missing. Then do Phase 4 with 5E folded into its Track 2, then 5F. That breaks PLAN.md's one-phase-after-another order, so the change gets recorded in PLAN.md.
2. Keep the order: all of Phase 4 first, then all of Phase 5.

## 5A in detail (approved)

Branch: `phase-5a-parts-rails`, from `paths-rails`.

1. **Store.** Each wing gets per-edge rails (`auto`, `on` or `off`) and a rail style. New actions: pick a part, resize one edge, move or turn a wing, add or remove a wing, and set a rail. Every action is one undo step and is refused on a locked building.
2. **Pick a part.** Click a building once to select it; click again to pick the part under the pointer. The part gets an outline and a short HUD, and the inspector shows that part's fields (size, height, rail, style).
3. **Edit a part.** Edge handles drag one side in 1 in steps, a grip moves a wing along its host, and a knob turns it. Arrow keys nudge the picked part.
4. **Add a part.** **+** chips on free edges open a small menu: Deck, Porch, Stair, Ramp. The new part is placed the way the old `attach-add` block places it. Ramp wings are drawn for the first time.
5. **Rails.** Rails are decided **per edge**, as in the old `guardRing`: on when the drop at that edge passes 30 in, or when forced. Each edge can be set to auto, on or off from a rail chip in 3D or from the Railings panel. Styles are wood, steel, cable, glass or none. Rails open where a stair, path piece or bridge lands and in front of doors, and porch posts move out of doorways (old `rail-clear` and `join-rails`). Standalone decks get guards too.
6. **Stairs.** Nosed treads, closed risers, housed stringers, posts under long runs, a concrete foot plate, and handrails that start back from a door at the top (old `stair-geom`).
7. **Checks.** Unit tests for the per-edge rule, the rail openings and each new action. E2e: pick and resize a Scheme C deck, add a stair, switch a rail off and undo it, and compare rail edges with the old planner's for C and C2–C4.

Any deliberate change from the old planner goes into PLAN.md as it comes up.

## 5D in detail (draft, waiting for an OK)

Branch: `phase-5d-shapes`, from `phase-5a-parts-rails`. 5B and 5C are not built yet, so this runs ahead of the agreed order (see "Before 5D" below). Schemes D–I already load from the scheme picker's **Old designs** group, so they can be checked against the old planner the whole way through; their interiors stay hidden until 5B.

Geometry stays in one place: every outline comes from `localFootprint` / `siteFootprint` and every roof from `src/buildings/`, so the scene, the rails, the openings, the earthworks and the drawing sheets (being built on `drawing-sheets`) all read the same curves. Nothing is drawn from a scene-only copy.

1. **Curved outlines.** A new `src/buildings/organic.ts` ports the old outline maths: centripetal Catmull-Rom (`crSpline`), arc-length resampling, the ellipse, the kidney's bite (`bend`, 0–1, default 0.35), the teardrop's point (`point`, 0–1, default 0.5), the blob through its control points (or the old default blob), and ribbons (a centreline with left and right edges). Outlines come back at about 1.5 ft chords (32 to 96 points), wound the same way as every other footprint, starting at the back centre. `localFootprint` returns them, so walls, slabs, posts, rails and the opening layout all follow the curve at once. Masses gain `bend`, `point`, `curl`, `roofMat`, `walls` and `color`.
2. **Editing a shape.** The inspector and part inspector get a Shape list (rect, hex, oct, tri, trap, para, half, poly, ellipse, kidney, teardrop, blob) and the one extra field the old planner shows for it (taper, skew, bend or point). A new width or depth scales a blob's points (5A's `orgScale` rule); blob and ribbon points get the corner cubes that poly buildings already have. A ribbon's length is its centreline, as in the old `orgFit`. One undo step each, refused on a lock.
3. **Walls with real holes.** Walls are built with their openings cut through the wall thickness, with jambs, head and sill faces, instead of framed glass laid on the face (the Phase 3 choice). Curved walls are one smooth-shaded band round the perimeter (old `curvedWallMesh`); an along-cut is measured along the real curve and split over the facets it crosses (old `edgeCuts`). The 3C casings and fit rules stay as they are, and the Openings panel treats a curved wall as one unrolled wall, as the old Walls editor does.
4. **Sculpted roofs.** A new `src/buildings/sculptRoof.ts` ports `roofSurface`: a square grid clipped to the roof outline; dome and sod heights from the membrane solve (a pressurised skin, so a circle gets a spherical cap and a kidney a smooth bean); vault and shell from the outline's chord through each point, with shell `curl` and the ridge sweep; saddle as a hyperbolic paraboloid. Each roof is a slab with soffit and fascia; glass infill closes the gap above the walls under vault, shell and saddle, cladding under dome and sod; open porches get slim struts. Linework follows the old `roofLineSets` (ribs, contours, seams, mullions), and sod roofs get the seeded grass tufts. Gambrel gets its own two-pitch roof instead of a gable, and C4's shell tip gets its column (`roofTipPost`). Roof heights use the old `sculptRiseFt`.
5. **Roof and wall materials.** `roofMat` glass, copper, metal or sod works on every roof type, sculpted or classic: glass is clear with mullions, copper has seams and a patina, metal has standing seams, sod is turf. Wall kinds glass (curtain wall with a mullion grid), cedar, board, timber and stone get their own surfaces at true scale, and a wing's own colour is used. All four display styles keep working (white model and sketch stay white, glass stays see-through).
6. **Exterior panel and Paint mode.** The old `ext` model: a building's `ext.parts` (wall, roof, trim, deck, post, door, glass, foundation, rail), `ext.masses["n"]` per part and `ext.walls["n:edge"]` per wall, read most specific first, then the scheme's own fields, then the defaults (old `extResolve`). Every drawn piece is tagged with its part, mass and wall, so **Paint mode** (P) can show what is under the pointer and repaint it with the current brush (wall kind and colour, roof material and colour, rail style and colour), scoped to that wall, that part or the whole building. The **Exterior panel** shows the brush, the presets, the list of overrides with reset, and works on the selected building without Paint mode. 5A's rail style (`ext.parts.rail.style`) is the same data. Every paint is one undo step and is refused on a lock.
7. **Earthworks.** `src/site/earthworks.ts` grows from sunk floors to the old `earthRebuild` passes: fill benches (`support: 'earth'`), sunken courts, berms against the chosen walls (`earth: {berm, sides, slope, crest}`, sides by name, edge number, uphill or downhill) with a rounded crest, never filling inside a building, and ponds (flat water at the lowest rim point, a soft bowl, a wet margin). Retaining walls are drawn along deep cuts in stone or concrete. The ground is tinted for berms, courts, banks, mud and wet margins as in the old planner.
8. **Site objects as themselves.** Meadows (grass and flowers over a blob), ponds (water at their level), pools (coping, walls, water, infinity edges, fixed `elev`), boulders (seeded rock), the shed and shop as small buildings, cars on parking pads, ribbon paths that follow their points, curved strip decks and boardwalk wings, mast and stilt supports, and truss and cable bridges.
9. **Checks.** Unit tests for the outline maths (ellipse area, kidney bite, teardrop point, blob through its points, ribbon width, winding and start point), along-cuts on curves, the roof surfaces (cap height on a circle, symmetry, vault crown, shell curl, saddle corners), the `ext` resolution order, and the earthworks (berm crest, slope run, pond level, nothing filled inside a footprint). E2e: change a cabin to a kidney and its bend; paint a wall, a roof and a rail, undo each and see a lock refuse it; load each of D–I and take the saved views; then compare those against the old planner's from the same views, side by side.

Commits go in that order, each one leaving the app runnable. The app is checked in the browser after each step, and every deliberate change from the old planner goes into PLAN.md as it comes up.

**Done when:** Schemes D–I look the way they do in the old planner from matching views (outside, roofs on), and any wall, roof or rail can be repainted, with undo and locks.

### Before 5D

Checked Nov 2 2026 on `phase-5a-parts-rails`:

- **5A** looks finished: 40 commits since `paths-rails`; typecheck and all 458 unit tests pass. The e2e run is recorded below.
- **5B (interiors)** has not started: no rooms, interior walls, furniture or indoor stairs in the app.
- **5C (paths and connections)** has not started: no path pieces, Connect tool or route check.

5D does not need 5B or 5C to reach its done-when, which looks at the outside of D–I. Two things wait for them: D–I's hand-drawn floor plans stay hidden until 5B, and D–I's walks are drawn as ribbons, not as path pieces, until 5C.

## Appendix: full gap list (audit of Oct 29 2026)

Status: **m** missing, **p** partial. Size: S < half a day, M about a day, L 2–4 days, XL a week or more. Line numbers are in `legacy/islandale-planner.html`. Some features appear in more than one group because the old file builds them in several places.

### Toolbar, panels and controls

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | S | Display-mode keys 1 / 2 / 3 | 320-322, 331 | No number-key shortcuts for styles. |
| m | S | Display options: Occlusion / Shadows / Edges toggles | 286-299, 324-327 | Occlusion, shadows and edges cannot be switched on or off separately; they come only from the chosen style. |
| m | S | Save a snapshot (PNG) | 330 | No image export button. |
| p | S | Select and move by dragging (Select tool, V) | 335, 417 | Moving goes through a gizmo handle, not by dragging the object itself; no V key. |
| p | S | Rotate tool, ring, Q/E 5-degree steps and R for 90 degrees | 336, 418 | No Q/E/R keys, no 5° angle snap, and the rotation is a number field rather than a slider. |
| m | M | Measure tool (M) | 23, 99, 337, 426 | No measure tool or measure label. |
| p | S | Camera views Orbit / Plan / Water | 339-341 | Buttons for the orbit view, a straight-down plan view and a view from Mud Bay. |
| m | S | Snap toggle (1 ft positions, 5 degree angles) | 344 | No snapping and no toggle. |
| m | L | Draw site plan sheet | 120-124, 346, 380-393, 424 | No plan or elevation sheets at all (Phase 6 in PLAN). |
| m | XL | Interior editor (I) | 125-140, 257-272, 347, 379, 422 | No interior editor, no room or furniture drawing, no fixture checks. |
| p | M | Walls editor: drawing openings on the wall (W) | 126-130, 348, 352-361, 363-375 | The elevation cannot be drawn on or dragged, there is no Add Cut-out button (only a kind change), no W key, the 3D camera does not turn to face the wall, and there is no opening stats block. |
| m | S | Wall opening presets | 362 | No preset set of openings per wall. |
| p | M | Openings cut real holes in 3D walls | 375 | Walls are not cut (a deliberate Phase 3 choice), so a cut-out cannot show through. |
| m | S | Roofs off | 349, 422 | No roof hide toggle. |
| m | S | Help / Controls dialog | 250-255, 350, 412-443 | No help or controls reference. |
| m | S | Ground colour key (legend) | 104-110, 394-403 | No legend. |
| m | S | Cursor elevation / slope readout | 90-93, 404-407 | No pointer elevation or slope readout. |
| m | S | Mode chip (placing / measuring / painting / connecting / part) | 170, 183, 224, 405 | No mode indicator (no modes to show yet). |
| m | S | North arrow | 103, 408 | No north arrow. |
| m | S | WebGL fallback message | 141, 410 | No message when WebGL is not available. |
| m | S | Loading splash | 303-306, 411 | No loading screen. |
| m | S | Site header stats | 447-457 | No lot facts or address on screen. |
| m | L | Library: place new objects | 22, 43-51, 459-465, 416 | Nothing new can be added to the plan; only scheme objects can be edited. |
| m | S | Duplicate object | 468 | Objects cannot be duplicated. |
| p | S | Floor above grade (lift) | 477-479, 420 | Lift from the schemes is drawn, but it cannot be changed. |
| p | M | Supports panel | 481-490, 421 | Not editable. Piers, pilings, stilts and mast all draw as the same posts, and bracing is never drawn. |
| m | S | Pad shape editor | 492-500 | No way to change a pad's shape, taper or car count. |
| p | M | Curved footprints (ellipse, kidney, teardrop, blob, ribbon) drawn | 495, 538 | Every curved pad and cabin is drawn as its bounding box. |
| m | S | Cars drawn on parking pads | 497, 499 | No cars drawn. |
| m | L | Path piece panel (walk, ramp, stair, landing, boardwalk) | 502-530, 428 | No path piece objects, editor, slope readouts or snapping of pieces end to end. |
| m | M | Shape presets | 532-535, 423 | No building shape presets. |
| p | M | Roof and footprint editor | 536-545 | Nothing on the roof can be edited. Gambrel, vault and saddle draw as gable; copper and metal finishes are not distinct. |
| p | L | Wings editor | 76-79, 547-549 | Wings, porches, decks and stairs are drawn, but none can be added, removed or edited. |
| m | L | Select a part and part handles | 172-188, 431-432 | No part selection or part handles. |
| m | M | Levels and junctions panel | 244-248, 551-553, 437-438 | No level check or fixes. |
| m | L | Add to this part (+ chips and panel) | 206-219, 555-562, 434 | No way to attach new parts. |
| p | M | Railings panel (per-edge auto / on / off) | 190-200, 564-588, 433 | There is no rail editor, no per-edge override and no missing-guard warning. |
| m | S | Rail chips in 3D | 185-187, 201-204 | No on-model rail controls. |
| m | M | Rail styles (wood, steel, cable, glass, none) | 578-584, 603 | Every rail draws as wood. |
| m | L | Exterior panel and Paint mode (P) | 157-170, 590-612, 427 | No per-element paint or material editing. |
| m | L | Describe it (reshape with Claude) | 615-626, 423 | Not ported; PLAN puts the AI helpers last in line. |
| m | S | Selection stats | 627-634 | No elevation, clearance or area readouts. |
| m | S | Program budget | 642-649 | No area budget. |
| m | L | Auto route | 150-155, 653-665, 429 | No route builder. |
| m | L | Connect tool (C) | 221-237, 435-436 | No connect tool. |
| m | L | Code check (SJCC 18.50.540, IRC guards, accessible route) | 667-671, 430, 437 | No code checks. |
| m | S | Site notes and assumptions | 672-673 | Text not carried over. |
| m | S | On the site list and lot coverage | 62-67, 677-686 | No object list to select from, and no coverage figures. |
| p | M | Setback sliders and drawing | 688-699 | Only a fixed 35 ft line from the water is drawn. There is no top-of-bank offset, no side or rear setback and no sliders. |
| m | S | Shade tree protection zones | 697 | No zones drawn. |
| m | S | Vertical exaggeration | 705-706 | No terrain exaggeration. |
| m | S | Lot line toggle | 711 | The lot line cannot be hidden. |
| m | S | Clear site | 728 | No blank-site option. |
| p | S | Copy layout as text / Paste layout | 731-737 | Files only, no clipboard or paste box, and an old-planner layout text cannot be imported. |
| m | S | Sources | 741-744 | Text not shown. |
| m | M | Dimension, clearance and stake labels | 98-102, 239-242 | No dimension, clearance or stake chips. |
| m | S | Tool shortcuts V, M, I, W, P, C | 335-348, 427, 435 | No tool keys (most of the tools are missing too). |
| p | S | Phone layout and light/dark themes | 6-15, 142-147, 302, 309-310 | Dark theme only, and no narrow-screen layout. |

### Core site and objects

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| p | S | Ground colouring inside vs outside the lot | 848-861 | No lot/outside-lot tint, so the lot does not read on the ground. |
| p | M | Shore buffer and side setback tinted on the ground | 848-861, 993 | Only a fixed 35 ft buffer line. No tinted bands, no side setback, no top-of-bank offset on the east shore. |
| m | M | Setback sliders (shore buffer, side setback, top of bank, TPZ) | 786-788, 2012-2013, 1868-1870 | No setback settings in the store or UI, and none saved with the plan. |
| m | S | Vertical exaggeration slider | 845, 2015 | No exaggeration control. |
| p | S | Lot line show/hide toggle | 885, 2019 | The lot line cannot be hidden. |
| m | S | Shoreline length stat | 790-791 | No site stats readout. |
| m | S | Compass that turns with the camera | 2106 | No north indicator in 3D. |
| m | S | Cursor readout: elevation, slope, in or out of the lot | 2065-2067 | No ground readout. |
| m | L | Earth berms against chosen walls | 901-930, 968-970 | No berms, no crest or slope. |
| m | M | Fill bench (earth support) and sunken courtyard | 914-915, 951-953, 963-967 | No fill, no courts. |
| m | M | Retaining walls along cuts | 1004-1034 | Cut banks have no walls. |
| m | S | Earthwork ground colours | 990-1003 | Cuts are not tinted. |
| m | S | Boulder (granite erratic) | 1062-1073, 1097-1099 | A boulder would draw as a box. |
| m | M | Native meadow | 1056-1061, 1074-1078 | A meadow would draw as a flat prism. |
| m | M | Rain-garden pond | 931-932, 973-978, 1079-1083 | No pond geometry and no water level. |
| m | L | Object library and place tool | 1109-1128, 1853-1860, 1882-1884, 2048, 2081 | Nothing new can be added to the plan. |
| m | S | Shop and shed drawn as buildings | 1112, 1116, 1133 | Shop and shed would draw as boxes. |
| m | S | Free-standing deck with posts and guard | 1236-1243, 1826 | No posts and no guard on a stand-alone deck; deck wings on cabins are drawn. |
| m | S | Parked cars on a pad | 1827, 1925 | No cars. |
| p | S | Classic roofs (gable, hip, shed, flat, gambrel, butterfly, pyramid) | 1132-1159, 1492-1502 | Gambrel draws as a gable. |
| p | L | Sculpted roofs (dome, vault, shell, saddle, sod) | 1603-1777 | No vault, saddle, curl, outline-following membrane, infill, linework or sod tufts. |
| p | M | Roof materials (glass, copper, metal, sod) | 1615-1618, 1721-1724, 1733-1741 | No glass or copper roofs, and no seam or mullion lines. |
| m | S | Roofs on/off | 1302, 2373 | No roof toggle. |
| m | L | Organic footprints (ellipse, kidney, teardrop, blob) and ribbon paths | 1334-1403, 1460-1469, 1477-1480 | Curved shapes draw as their bounding box. |
| p | S | Cabin wings drawn (porches, decks, stairs, upper-level wings) | 1245-1297, 1481-1485 | Each wing draws by kind: open porch on posts, deck, stair flight or walled mass, and can sit on an upper floor. |
| m | S | Ramp wings | 1263-1267 | Ramps are not drawn. |
| p | S | Walls with openings, straight and curved | 1281-1283, 1404-1459 | Hollow walls with door, window, slider and cutout holes, including holes along curved walls. |
| m | M | Rail styles and per-edge rail switches | 1201-1206, 1239, 1251-1252, 1260-1271 | No rail style, no per-edge switches, no editor. |
| p | M | Foundations and supports drawn | 1160-1200, 1471-1476 | No piers, pilings, mast or stilts as distinct types, no bracing, no slab apron. |
| m | S | Supports editor | 1928-1933 | Supports can't be edited. |
| m | L | Interior walls drawn in 3D | 1819 | No interiors drawn (the room editor sits in another slice). |
| p | S | Rotate tool | 1876-1879, 2044-2045, 2051-2054, 2062 | No 5 degree snap and no separate Rotate mode. |
| m | S | Snap toggle (1 ft and 5 degrees) | 1880, 1884 | No snapping. |
| m | M | Measure tool | 2049, 2105, 1878 | No measure tool. |
| p | S | Keyboard shortcuts | 2075-2087 | No Q/E/R rotation and no V/M/I keys. |
| m | S | Floor lift and elevation readout | 1890-1891, 2004-2008 | Floor height can't be changed or read. |
| m | M | Clearances to shore, lot line and nearest object | 1892-1900, 2089-2104 | No setback or clearance checks at all. |
| m | S | Edge dimension labels on the selection | 2101 | No dimension labels. |
| m | S | Footprint area per object | 1491, 1901 | No area readout. |
| m | S | Lot coverage total and percentage | 1994-1995 | No coverage check. |
| m | S | Object list | 1990-1993 | No list of everything placed. |
| m | S | Duplicate object | 2010 | Objects can't be duplicated. |
| m | M | Building shape editor | 1904-1936 | Roofs and plan shapes can't be edited. |
| m | L | Wings editor | 1912-1920, 1937 | Wings come only from scheme data. |
| m | S | Pad shape editor | 1907, 1923-1925 | Pad shapes can't be edited. |
| m | M | Building presets | 1938-1955 | No presets. |
| m | M | Reshape with Claude | 1957-1989 | No AI reshape. |
| p | S | Copy layout as text and paste layout | 2114-2116 | File only, no clipboard or paste box. Old-planner layout text can't be pasted into the new app. |
| m | S | Clear all objects | 2113 | No empty-plan start. |
| m | S | Help panel | 1881 | No help (Phase 4 plans a tour). |
| m | XL | 2D site plan sheet (SVG) | 2118-2352 | No plan drawing at all. |
| m | S | Plan sheet schedule table | 2353-2358 | No schedule table. |
| m | M | Plan sheet viewer and export | 2362-2370 | No sheet viewer, no SVG or PNG export. |

### Interiors: rooms and floor plan

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | S | Room types and colours | 2974-2976, 2982-2984 | No room type list, colours or labels. |
| m | M | Multiple floors per building (main / upper) | 3075-3098, 3267-3279 | No floor list, floor switcher, add/rename floor, or per-floor envelope rule. |
| m | L | Building envelope for interiors (incl. curved footprints) | 3196-3311 | No interior envelope: no tiles, loops, openTiles or access list, no chord simplification of curved walls, no landing flats. |
| m | L | Rooms clip to the envelope and to each other | 3313-3331, 2702-2753 (intersectRegion, subtractRegion, unionPieces, splitByLine) | No polygon boolean ops (convex diff, edge-cancellation union, region intersect/subtract, split by line) and no fitRoom. |
| m | L | 2D floor plan view (pan, zoom, grid) | 3591-3632, 3659-3671 | No floor plan view/editor surface, no grid, no fit/pan/zoom. The top bar has no Interior tab yet (PLAN.md:113 lists one). |
| m | M | Building masses on the floor plan (decks, deck steps, stair/ramp symbols, upper-floor ghost) | 3673-3711 | No 2D symbols, since there is no plan view. |
| m | S | Room fills coloured by type | 3713-3727 | Rooms are not drawn anywhere, in 2D or 3D. |
| m | M | Interior partition walls drawn | 3333-3366, 3729-3745 | No partitionSegments and no interior walls in plan or 3D. |
| m | S | Exterior wall band on the plan (poché) | 3633-3638, 3746-3751, 2790-2809 | No 2D wall band. |
| p | S | Exterior wall cuts (Walls tool) shown on the plan | 3754-3783 | Cuts are not drawn in any floor plan. |
| m | L | Interior doors, windows, sliders and cased openings (model) | 2985-2986, 3057-3065, 3155-3182, 3370-3403 | No room-anchored openings, no swing/flip, no overlap nudge, no exterior/neighbour classification. |
| m | M | Opening symbols on the plan (door swing arcs etc.) | 3785-3818 | No 2D opening symbols. |
| m | M | Openings follow rooms when rooms are edited | 3430-3454 | No re-anchoring. |
| m | M | Furniture drawn on the plan | 3820-3834 | No furniture rendering. Symbols and catalogue live in int2/furniture.js (next slice). |
| m | S | Room labels with name, size and area | 3368-3369, 3405-3428, 3473-3478, 3836-3847, 2825-2840 | No room labels, net internal size (offset by wall thickness) or label placement. |
| m | M | Room selection and edit handles | 3873-3897 | No room vertex or edge handles and no furniture rotate/resize handles. |
| m | XL | Room drawing and editing (draw polygon/rect, drag vertex, split) | 2842-2888, 2926-2935, 2744-2753, 3469-3472, 3899-3932 | No room drawing tool, snapping, preview or auto-naming (the tool code is in the editor slice; these are its geometry and preview parts). |
| m | S | Floor area stats (envelope, rooms, unassigned, circulation %) | 3460-3468 | No floor stats. |
| m | M | Program checklist per cabin | 3481-3552 | No program definitions, matching or checklist UI. |
| m | M | Walk check overlay (reachability and routes) | 3849-3871 | No overlay. The route computation lives outside this slice. |
| m | S | Front marker on the plan | 3934-3940 | No orientation marker on a floor plan. |
| m | L | Printable floor plan sheet (dims, tags, title block, schedules) | 3584-3589, 3618-3626, 3652-3657, 3942-4011 | No printable plan sheet or schedules. |

### Interiors: editor and furniture

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | L | Interior editor (2D floor-plan overlay for a building) | 4744-4767, 4769-4790, 5641-5648 | No interior mode, no plan canvas, no Interior button, no store slice or actions for floors/rooms/furniture. |
| m | M | Plan view pan, zoom and fit | 4655-4669, 4733-4742, 5102-5121, 5131, 5194-5199, 5376-5384, 5458-5461, 5511-5513 | Needs a 2D plan viewport with pan, zoom and fit, including touch pinch. |
| m | L | Draw rooms (rectangle or any polygon) | 4671-4685, 4906-4948, 5172-5178, 5212-5218, 5312-5315, 5340-5344, 5445-5450 | No room drawing, snapping to the envelope or other rooms, or fit and trim against the building envelope (M.fitRoom). |
| m | S | Smart room naming from the cabin program | 4906-4913, 4851, 5621-5625 | The whole feature is missing. |
| m | M | Split a room with a line | 4950-4978, 5179, 5221-5231, 5345-5347 | The whole feature is missing. |
| m | M | Merge two rooms | 5017-5036, 5181-5184, 5561, 5618 | The whole feature is missing. |
| m | M | Reshape a room by dragging its corners | 4982-4989, 5142, 5232-5238, 5349-5352 | No room vertex editing. |
| m | M | Move interior walls (drag a shared wall) | 4991-5000, 5143-5152, 5239-5255, 5353 | No interior wall editing of any kind. |
| m | S | Add or remove a room corner by double-click | 5055-5087, 5140 | The whole feature is missing. |
| m | M | Move a room (drag or arrow nudge) | 5002-5015, 5160-5166, 5256-5263, 5354, 5405-5421, 5451-5455 | No moving of rooms inside a building. |
| m | S | Delete a room or the selection | 5038-5053, 5448, 5562 | No room-level delete. |
| m | S | Room inspector (name, type, area, dimensions) | 4812-4818, 5546-5560 | No room inspector and no room dimensions or area readout. |
| m | S | Rooms list with colour swatches | 4831-4834, 5616-5620 | The whole feature is missing. |
| m | M | Floor area statistics | 4831, 4842-4848 | The whole feature is missing. |
| m | M | Cabin program checklist | 4794-4797, 4836-4840, 5517, 5621-5625 | No program definitions, selector or checklist. |
| m | M | Place interior doors, windows, sliders and cased openings on room walls | 4592-4594, 4855-4884, 5180, 5318-5319, 5358-5371 | No openings between rooms or on room edges. |
| m | M | Edit interior openings (drag, kind, width, hinge, swing, delete) | 4819-4821, 5153, 5265-5280, 5410-5414, 5564-5571 | The whole feature is missing. Door swing arcs are not drawn anywhere. |
| m | L | Auto doors and windows for a floor | 5532-5538 | The button and the algorithm are both missing. |
| m | XL | Auto-fill floor layout | 5518-5530 | The whole feature is missing. |
| m | L | Describe-it AI room layout ('Lay out rooms with Claude') | 5635-5640 | The whole feature is missing. |
| m | S | Furniture catalogue | 4028-4057, 5626-5633 | No catalogue data or library UI. |
| m | M | Architectural furniture plan symbols | 4059-4095, 4129-4233 | The whole feature is missing. |
| m | M | Stair plan symbols (UP/DN, risers, spiral) | 4096-4127, 4216-4219 | No interior stairs, spiral stairs or plan stair symbols. |
| m | M | Furniture as 3D boxes in the building | 4235-4238, 4764 | Interior furniture and partitions are not drawn in 3D. |
| m | L | Interior walls and rooms shown in 3D | 4764 | Rooms stored in params.floors are never drawn. |
| m | M | Place furniture from the library | 4599, 4623, 4885-4889, 5180, 5320-5321, 5358-5364, 5424, 5626-5633 | The whole feature is missing. |
| m | S | Furniture wall snapping | 4246-4278, 4890-4898 | The whole feature is missing. |
| m | S | Move furniture (drag and arrow nudge) | 5154-5159, 5281-5286, 5407-5409, 5451-5455 | The whole feature is missing. |
| m | S | Rotate furniture | 5141, 5287-5294, 5422-5426, 5456, 5577-5578 | The whole feature is missing. |
| m | S | Resize furniture | 4824-4829, 5141, 5295-5304, 5574-5576 | The whole feature is missing. |
| m | S | Mirror furniture | 5427-5430, 5457, 5579 | The whole feature is missing. |
| m | S | Duplicate and delete furniture | 5051, 5580-5584 | The whole feature is missing. |
| m | L | Auto-furnish a room | 4280-4578, 5469-5482, 5540 | The whole rule engine and the button are missing. |
| m | S | Furnish all rooms on a floor | 5469-5482, 5539 | The whole feature is missing. |
| m | M | Floors (switch, rename, add upper floor, remove it) | 4802-4807, 5586-5613 | The whole feature is missing. |
| m | L | Walk check (circulation / accessibility route) | 4609-4618, 4785-4787, 5531 | The whole feature is missing. |
| m | S | Clear floor | 5541-5544 | The whole feature is missing. |
| m | S | Interior undo/redo | 4692-4704, 4715-4721, 5387-5398, 5441-5442, 5509-5510 | There are no interior actions yet to undo. |
| m | S | Interior keyboard shortcuts | 4593, 5399-5404, 5432-5466 | None of the interior shortcuts exist. |
| m | S | Snap toggle and tool hints | 4595-4602, 4680-4685, 4850-4852, 5514 | The whole feature is missing. |

### Interiors: floors, auto-fill, walk check, 3D

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | XL | Interior editor (open a cabin's floor plan) | 7311-7607 (ui.js markup, CSS, mount); wired from 5505-5645 (outside slice) | No interior editor, no Interior tab, no 2D plan view of a cabin at all. |
| m | M | Floors: tabs, add upper floor, remove floor | 7319, 7354-7356 (int-floors, int-addfloor, int-delfloor); 6855-6862 planBuilding adds 'Upper floor' when o.h >= 15 | No multi-storey model, no floor switching, no add or remove floor. |
| m | M | Plan canvas navigation: zoom, fit, pan, snap | 7321, 7345, 7359-7363, 7501-7506 | No 2D plan canvas, so no zoom, fit, pan or 6-inch snap for floor plans. |
| m | L | Draw room tool | 7339 (TOOLS 'room', B); tool code is in the editor before 5658 | You cannot create rooms. |
| m | M | Split room tool | 7340 (TOOLS 'split', S) | Not present. |
| m | M | Room inspector: name, type, area, size, merge, delete | 7327-7328, 7409-7422; type list filled in mount 7588-7603 | No room selection or room fields. |
| m | S | Rooms list | 7334, 7453-7456 | No rooms list. |
| m | L | Door, window, slider and cased-opening tools on room walls | 7341-7344 (tools D, W, L, O) | No interior doors or cased openings, and no openings tied to rooms. The exterior Openings panel uses a separate data set. |
| p | M | Floor-plan opening inspector: kind, width, flip hinge, swing | 7330, 7423-7434 | Doors have no hinge side or swing direction, and there are no floor-plan or interior openings to edit. |
| m | L | Furniture catalogue and placement | 7333, 7449-7452 (int-furnlib chips); the catalogue (INT.furniture) is outside the slice; wired at 5625-5633 | No furniture types and no placement. |
| m | M | Furniture inspector: size, rotation, mirror, duplicate, delete | 7332, 7435-7448 | Not present. |
| m | S | Cabin program picker | 7378-7386; programs in 6332-6609 and 6433-6454 | No program data or picker. |
| m | S | Program checklist | 7325, 7396-7399 | Not present. |
| m | S | Floor stats: rooms, envelope, rooms area, unassigned, circulation | 7326, 7400-7408 | Not present. |
| m | XL | Auto-fill rooms (circulation-first planner) | 6202-6865 (frameOf 6245-6271, allocate 6292-6328, genGathering 6351-6391, genFamily 6393-6430, hallSearch 6463-6558, genElders 6560-6584, genTwin 6588-6600, genUpperGeneric 6601-6609, planFloor 6749-6805, commitFloor 6820-6851); button 7388 | No automatic room layout. |
| m | L | Auto-fill doors, sliders and windows to porches and the view | 6612-6746 (makeOpenings: front door 6641-6653, interior links 6654-6698, porch and deck sliders 6699-6723, view windows 6724-6743) | No generated openings from rooms. |
| m | M | Auto-fill moves the stair or ramp to the front door, and straightens curved walls | 6750-6755, 6771-6803 | Not present. |
| m | M | Auto-fill furnishes, then retries until every room is reachable and has a bed | 6807-6851 (furnishFloor, commitFloor attempt loop) | Not present. |
| m | L | Doors & windows button (re-generate openings for drawn rooms) | 5914-6082 (autoOpenings and openingsCore: hub 6005-6008, open-plan pairs 6010-6016, connectivity doors that avoid walking through service rooms 6018-6039, entry door 6041-6048, windows and sliders by room type 6050-6071); button 7389; wired at 5533-5538 | Not present. |
| m | L | Furnish all / Furnish room | 7390, 7418 (buttons); 6807-6817 furnishFloor; the furniture rules (INT.furniture.autoFurnish) are outside the slice | Not present. |
| m | S | Clear floor | 7394; wired at 5540-5543 | Not present. |
| m | L | Walk check (can you walk to every room?) | 6867-7054 (obstacles 6876-6907, 3 in grid for a 2 ft body 6909-6928, BFS 6932-6947, start at front door or top of stairs 6957-6970, reach-in closets 6989-7004, compute and messages 7006-7051); checkbox and message 7392-7393, CSS 7520-7523 | Not present. Note: this is a reachability check on the plan, not a first-person walk-through; this slice has no first-person mode. |
| m | L | Lay out rooms with Claude (Describe it) | 6084-6199 (INT_RULES prompt 6085-6096, buildPrompt 6101-6113, applyAI 6115-6150, intReshape and stopReshape 6159-6195); panel 7457-7466; wired at 5636-5640 | No in-app Claude layout. It needs the sampling capability on the hosted artifact, and the room model. |
| m | L | Interior partitions drawn in 3D, with door and window gaps | 7056-7183 (wallHeight 7099-7101, pullBack 7104-7118, attachOpenings 7121-7138, segmentPieces with headers at 6'-9" and 7' and 3 ft sills 7142-7157, addWalls 7169-7183); hooked in at 1819 | No interior walls in 3D, although the scheme rooms exist in data/plans/islandale.plan.json params.floors. |
| m | M | Upper-floor slab with stair holes | 7185-7213 | Not present. |
| m | L | Interior stairs in 3D, with handrails and guard rails | 7215-7262 (stairMesh: straight stair with 12 or more treads, stringers and handrails both sides 7220-7230; upper-floor guard rail round the opening, balusters every 0.6 ft 7231-7235; spiral stair with a steel column, 11 wedge treads, a landing wedge and a helical handrail 7238-7253; spiraldn guard round the hole 7254-7260) | No indoor stairs or indoor railings. This is the 'railings insides' the user mentions. |
| m | L | Furniture drawn in 3D | 7264-7284 | Not present. |
| p | S | Floor plans from the schemes are carried in the data | 7609-7683 (FL() helper 7612, schemes C, A and B with floors: rooms [name,type,x,z,w,d] and openings [room,side,pos,width,kind]) | The data survives the load and save round trip, but nothing in the app reads, draws or edits it. |
| p | S | Scheme sitework: driveway, parking, walks, patio, lane, kept madrones | 7613-7631 (WALK helper and SITEWORK), 7632-7651 (scheme C objects) | Pads for the driveway, parking for 3 cars, the gravel walks, the path to the beach, the firepit patio and the lane, plus the madrone trees to keep, placed on the site for each scheme. |
| m | S | Interior keyboard shortcuts | 7338-7345 (V, B, S, D, W, L, O, H/Space), 7361-7367 (-, +, 0, Ctrl/Cmd+Z, Shift+Z, Esc), 7443-7444 (R, M) | Not present. |

### Schemes D–I and the archive

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| p | S | Scheme cards with tag line and description | 8478 | Tag and blurb are never shown, so there is no way to read what a scheme is before loading it. Loading does not frame the camera on the new buildings or select the gathering cabin, and no toast appears. |
| p | S | C4 Shell prow: roof over the deck, vaulted ceiling, tip dip | 7688, 8345 | The single column under the shell roof's tip is not drawn, so the C4 tip floats. There is no roofTipPost param. |
| p | L | Organic curved footprints (blob, kidney, teardrop, ellipse) | 7700-7703 (cr Catmull-Rom), 7771-7829, 7899-7916, 7979-8016, 8046-8150, 8271-8300 | Every curved cabin, pod, porch and deck in D-I draws as a box. The nautilus, kelp pods, river stone, kidney cabins, Orca Glass teardrop and Moon House ellipse are not recognisable. A port needs centripetal Catmull-Rom for blob, the kidney bend, the teardrop point and true ellipses, with walls, roofs and posts on those outlines. |
| p | M | Curved strip decks and boardwalk wings | 7705-7708 (strip), 7779, 7838, 8131, 8145-8146 | The strip decks draw as rectangles spanning the strip's bounding box, not as a curving walk, so their rails also run on the box. |
| p | M | Openings along curved walls (along:true perimeter cuts) | 7713-7714 (CUT), 7785-7786, 7845, 7915, 8107 | Along-cuts land on the bounding box perimeter, so the scheme D/G window positions do not match the legacy curve. Legacy frames on curved walls are also not done (PLAN.md line 276). |
| p | M | Curving ribbon paths, walks and rills | 7710-7712 (RIB), 7852-7855, 7864, 7943-7957, 7980-7981, 8029-8031, 8159-8163, 8243-8250, 8304-8307 | Every ribbon path in D-I (4 in D, 7 in E, 3 in F, 3 in G, 4 in H, 4 in I) draws as a straight draped rectangle across the route's bounding length instead of following its points. |
| p | M | Shell roofs (curling shell over teardrop and ellipse cabins) | 7774 (roof:'shell', curl), 7790, 7984, 8016, 8075, 8276 | Shell is drawn as a plain dome: curl is ignored, there is no ridge 'z' sweep, and it does not follow a curved footprint. The legacy shell is a sculpted surface (sculptRiseFt). |
| p | S | Dome roofs (copper pod domes, cave hearth, star dome) | 7776, 7826-7829, 7817-7818, 7875, 7983, 8288 | The domes are drawn, but on box footprints for blob pods. The legacy dome is a sculpted surface that fits the outline. |
| p | M | Sod roofs that continue the meadow | 7832, 7840, 7864-7930, 8186-8240, 8293 | The sod roof is a flat slab. The legacy sod roof is a sculpted surface solved over the outline (legacy lines ~1660-1708, SCULPT_ROOFS) that rises gently with pitch 1-2, and that rise is ignored. |
| p | S | Copper and glass roof materials | 7774, 7776, 7983, 8016, 8288 | Copper uses the seam texture in the copper colour, with no metal or patina look. Glass domes (F/I star dome) are drawn opaque. |
| m | L | Earth-sheltered berms (cabins dug into the hill) | 7840, 7865, 7901, 7912, 7920, 7929, 8187, 8199, 8209 (earth:{berm,sides,slope}) | No berm mounds are drawn. E and H, whose whole idea is cabins under the meadow, show as freestanding boxes with sod lids. The sides 'back'/'uphill'/edge list and the berm slope are ignored. |
| m | M | Wall materials: glass curtain wall, cedar, board, timber, stone | 8456-8473 (WALL_KINDS, wallTex, specWallMat, specWallDecor) | The walls param is ignored, so glass pavilions and halls (E hall, F/I Orca Glass, the vestibules) draw as solid sided boxes and stone or cedar walls look like the default siding. There is no mullion grid. |
| m | S | Per-wing colour | 7990 (star dome color:GLASS), 8466 (m.color||o.color) | Wing colour is ignored. |
| p | M | Mast support (one concrete core with radiating steel struts) | 8441-8450 | Mast buildings draw on a grid of ordinary posts. The single core, cap, collar, struts and mastAt are missing. |
| p | M | Stilts support (splayed raking columns) | 8451-8453 | No raking or splayed columns, no white stilt finish and no footing pads. Stilts look like ordinary posts. |
| m | M | Truss bridge style | 8406-8409 | Truss bridges draw as glass ribbons. |
| m | M | Cable sky-bridge style | 8410-8415 | Cable bridges draw as ribbons, without mast or cables. The cable style also uses only end columns. |
| m | M | Pools with coping, water and infinity edges | 8419-8432, 8379-8380 (poolPlanPoly, poolInfEdges) | The D tide pool, F horizon pool and F ocean pool draw as solid coloured slabs with no water, coping, infinity edge or fixed elev. They are also boxes when kidney or ellipse. |
| p | S | Ponds and meadows as organic areas | 7859-7861, 7958-7963, 8164-8165, 8252-8254 | Ponds and meadows draw as coloured rectangular prisms, not as water or grass, and not in their blob shape. |
| p | S | Boulders (river stones, boulder gates, seats) | 7862-7866, 7941-7942, 7967, 8166-8167, 8242, 8249 | Boulders are grey boxes. The seeded rock shape is missing. |
| p | S | Saunas and boathouse (tide-pool sauna, beach sauna in the bank, shell boathouse) | 7816-7820, 7931-7936, 8015-8017 | They show as boxes with posts and a dome or flat roof. The teardrop or ellipse shape, raking stilts, berm and shell roof are missing, as are the sauna's hand-drawn rooms (cedar benches, changing). |
| p | S | Madrone ring deck | 7879-7881, 7957 | They draw as plain prisms, with no board texture, posts or rails like a deck. |
| m | XL | Hand-drawn floor plans that ship with schemes (rooms, interior doors, furniture) | 7715-7720 (plan), 7741-7769, 7791-7814, 7822, 7911, 7926, 7935, 8077-8150, 8196, 8206 | No interiors are drawn or editable, so the scheme plans are invisible. |
| m | L | Auto-plan interiors when a scheme loads | 8478 (INT.plan.planBuilding for houses without keepPlan) | No interior planning. |
| p | L | Scheme D Nautilus & Kelp | 7691-7856 | Every building and the arrival court draw as boxes. Shell, sod and berm are approximated or missing, the creek walks are straight, the pool and pond are slabs, stilts are posts, and the interiors are hidden. The ribbon bridge and the trees draw correctly. |
| p | M | Scheme E Under the Meadow | 7857-7970 | Without berms and with sod drawn as flat lids, the scheme's main idea (buildings under the meadow) does not show. The blob hall and kidney hollow are boxes, the glass and stone walls are plain siding, and the rills and paths are straight. |
| p | M | Scheme F Sky Datum | 7971-8034 | The cable and truss bridges draw as ribbons. The mast and stilts are posts, the glass pavilion is opaque siding, the teardrop and kidney shapes are boxes, the pools are slabs, and the glass star dome is opaque. |
| p | M | Scheme G Tide Shell | 8035-8175 | All three cabins and their strip boardwalks are boxes, the shell roofs are domes, the walks are straight and the interiors are hidden. |
| p | S | Scheme H Sod & Contour | 8176-8259 | No berms (back sides buried), the sod roofs are flat, the stone and cedar walls use default siding, the contour walk and beach path are straight, the boulders are boxes and the interiors are hidden. |
| p | S | Scheme I Little Sky Datum | 8260-8312 | The ellipses are boxes, the cable bridge is a ribbon, the mast is posts, the glass walls and dome are opaque and the paths are straight. |
| m | L | Code check panel (setback, lot width, height, guards, handrails, tree zone) | 8318-8336 | The whole panel is missing. |
| m | M | Program panel (enclosed and covered sq ft against the 1,600 cap) | 8313-8316, 8337-8340 | No area totals or cap warnings. |
| m | S | Rules-off dream scheme mode | 8342, 8474-8477 | The flag is not kept on the loaded plan and nothing shows it. |
| p | S | Bridge auto-routed between two named buildings | 8347-8357 (specCopy, bridgeAuto) | There is no auto route between buildings and no way to add a new bridge (no object library). |
| p | M | Walls editor: elevation drawing of one wall | 8530-8556 | There is no ground line, foundation, roof silhouette, grid, opening labels or dimensions. |
| m | M | Walls editor: draw, move and resize openings on the elevation | 8566-8577 | There is no direct manipulation on the elevation. |
| m | S | Walls editor: opening presets | 8584-8591 | All presets are missing. |
| m | S | Walls editor: camera aims at the wall being edited | 8525-8529 | Choosing a wall does not move the camera to it. |
| m | S | Walls editor: wall stats (size, glass area) | 8565 | No stats. |
| p | S | Walls editor: W shortcut and Delete key | 8592, 8602-8603 | There is no W shortcut. The Delete key does not target the focused opening. |
| m | M | Exterior elevations sheet | 8593-8601 | No elevation sheet export. |
| m | S | Starter layout for an empty plan | 8604-8608 | There is no new or empty plan and no starter. |

### Path pieces, route checks and paint

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | M | Path piece types (walk, ramp, stair, landing, boardwalk) | 8714-8760, 8956-8957 | No notion of a path-piece kind on pads, no end A/B model, no per-kind defaults. |
| m | L | Ramp, stair, landing and boardwalk 3D geometry | 8833-8929 | No mesh builders for any non-walk piece kind; would reuse stairs.ts / rails.ts pieces where possible. |
| p | S | Path surface material (gravel, concrete, pavers, boardwalk, grass) | 8722-8724, 8842-8846, 9028 | No surface choice; every pad is gravel-textured with a free colour. |
| m | M | Automatic handrails and guards on path pieces | 8807-8822, 8867-8873, 8887, 8898, 8905, 8913, 9029 | No rail rules or rail meshes for path pieces, no rail on/off/auto setting on pads. |
| m | S | Stair risers and treads from the rise | 8800-8805 | Stair-piece maths and its OK/not-OK result. |
| m | M | Path piece library and placing new pieces | 8959-8973 | No way to add any new object yet, let alone typed path pieces. |
| m | M | Path piece inspector (kind, surface, rail, length, width, lift) | 8975-9038 | Whole sub-panel; length edit that anchors end A. |
| m | S | Path piece readouts (slope, rise, ratio, risers, end levels, rails) | 8992-9001 | All readouts. |
| m | L | End-to-end snapping of path pieces | 9040-9066, 9076-9144 | Snap solver, target collection (piece ends, doors, wing feet, driveway edges), drag/arrow-key hooks, HUD chip and ring. |
| m | M | End levels follow what each end touches | 9126-9130, 8762-8775 | End-elevation model and its refresh after moves. |
| m | S | Snap on placement and length edits | 9146-9160 | Placement snap and anchored length change. |
| m | S | Continue a path from an end | 9162-9182, 9035-9036 | Whole feature. |
| m | L | Accessible-route checks per piece (ADA 402-405) | 9460-9673 | The whole check engine. |
| m | M | Route verdict for each building | 9675-9755 | Route search and verdict text. |
| m | S | Code check rows for the route and path pieces | 9780-9800 | No code check panel exists yet; these two rows would go into it. |
| m | S | Failing-piece chips in the 3D view | 9802-9835 | Issue and slope chips. |
| m | S | Check verdict in the piece panel | 9002-9013 | Verdict display. |
| m | M | Fix piece (one-click fixes) | 10092-10175, 10267-10279, 9037 | Fix planner and the button. |
| m | M | Auto route panel | 10184-10266 | Panel, from/to lists and the call into the planner. |
| m | XL | Auto-route planner | 9838-10090 | Whole planner; port of a pure module with its own tests. |
| m | L | Per-element exterior finishes (data and rendering) | 8611-8687 | Override model, resolution order, per-part/per-mass/per-wall look and part tags on meshes. |
| m | M | Rail styles (wood, steel, cable, glass, none) | 8655-8661, 8688-8708 | Style variants in buildRail and a style setting read from the exterior overrides. |
| m | M | Paint mode tool | 10418-10421, 10535-10574 | Mode, pointer picking by part, hover chip, highlight and shortcut. |
| m | M | Exterior editor panel | 10396-10416, 10437-10533 | Whole panel. |
| m | S | Exterior presets | 10370-10386, 10508-10509, 10533 | Preset list and buttons. |
| m | S | Exterior overrides list and reset | 10336-10369, 10510-10519, 10534 | List, focus, remove and reset. |
| m | M | Path pieces on the 2D plan sheet | 10580-10713 | No plan sheet exists yet; the path symbols are part of it. |
| m | S | Route line in the plan sheet schedule | 10715-10759 | Schedule row. |

### Building parts, rails and connections

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| m | M | Pick one part of a building in 3D | 11002-11248 (hitPart 11193-11196, click handling 11199-11210, setSel/markRows 11150-11157, window.wingSelect 11246) | No part (mass) selection in the store, no click-again or Alt-click to pick a part, no Wings list to highlight, and nothing follows the part through undo. |
| m | S | Selected-part outline and editing HUD | 11044-11048 (partName/hudText), 11088, 11114-11121 (setOutline), 11152 | No per-part outline and no HUD text for the active part. |
| p | M | Drag an edge to resize one side of a part | 10876-10897 (resizeWingEdge), 11010-11043 (edgeDelta, resizeRect, applyMainResize, snapFt, cursorFor), 11106-11110, 11168-11190 | No per-edge handles, no one-sided resize, no wing resize, no 1 ft snap or Shift-free, and main-mass resize moves the wings with it. |
| m | M | Move a wing with a grip handle | 10867-10874 (wingLocal/setWingWorld), 11107, 11172, 11183-11185 | No way to reposition a wing in 3D or in the inspector. |
| m | S | Turn a wing with a rotate knob | 11027-11028 (knobAngle), 11107, 11186 | No wing rotation. |
| m | S | Keyboard edits on the selected part | 11212-11229 | No part-level shortcuts, no rotate keys even for whole objects, and no deleting a single wing. |
| m | S | Per-edge rail overrides honoured when drawing | 10971-10988, 11283-11293 (materialize/writeEdge/writeAll), 11303 (SPEC_KEYS 'rails') | Mass has no rails field, so GuardRail ignores per-edge on/off saved by the old planner. |
| m | M | Railings panel | 11339-11421 (target, commit, setEdge, setAll, PANEL_HTML, refreshPanel) | No UI to change rails at all, and no store action to write them, undoable and respecting locks. |
| m | S | Rail chips on edges in 3D | 11423-11482 (RAIL_PX, chipOffset, makeChip, frame) | No in-scene rail toggles. |
| m | M | Rail style choice | 11360-11363 (setStyle), 11374, 11417 | There is only one rail style: no selector, and no steel, cable or glass geometry. |
| m | S | Guard rails on standalone decks | 10971-10988 (deck branch), 11494-11499 | Standalone decks have no rails, so the overrides cannot apply. |
| m | S | Code check 'Guards' row | 11484-11516 (guardsRow, refreshCode wrap), 11294-11297 (guardText) | No code-check panel exists, so there is no guards row. |
| m | M | '+' chips on free edges of a building | 11571-11597 (chipEdgesOfMass, attachAddChipEdges, attachAddChipOffset), 11703-11748 (chips/frame), 10847-10865 (edgeFree) | No edge model with outward normals or free/blocked test, and no chips. |
| m | L | Add deck, porch, stair or ramp off an edge | 10916-10957 (attachSpec), 11631-11656 (attachAddPlan), 11671-11689 (attachAddApply), 11754-11766 (popover) | No way to add any wing to a building. |
| m | M | Ramp wings drawn | 10935-10941 (ramp spec); drawing is in the base file | Ramp wings are parsed (masses.ts:51) but never drawn. |
| p | S | Add a door from the edge popover | 11599-11625 (nextCutId, doorCut), 11639-11642, 11679-11682 | There is no 3D route from an edge's '+' chip. The panel route works, and the fit rules cover the clash handling. |
| m | S | 'Add to this part' panel | 11775-11812 | No panel route to add attachments. |
| m | L | Connect tool: pick two ends | 11991-12060 (massEdges, edgeCands, wingTops, collectTargets, targetAt), 12034-12042 (rings/lines), 12062-12065 (HUD), 12106-12163 (mode, button, C key, pointer, Esc) | No tool-mode system, no snap targets, no Connect tool. |
| m | XL | Connect options and building the route | 11833-11980 (seg, checkChain, straightChain, connectPlan), 12067-12104 (popover, replan, build) | No route planner, no ADA chain check, and no path-piece kinds (walk/boardwalk/ramp/landing/stair with end heights) to build into. It also relies on the walk auto-router (walkAutoRoute), which lives outside this slice. |
| m | S | Selected path piece labels | 12166-12208, 12245-12271 | No length, slope or riser chip and no issue label on path pieces. |
| m | M | Level report per building | 12373-12417 (levelReportFor), 12570-12577 | No level or threshold checking. |
| m | M | Levels & junctions panel | 12815-12858 (panelModel, rowHTML, panelHTML), 12895-12927 | No panel. |
| m | M | Fix and Level everything | 12774-12813 (applyFixes, fixesOf, levelEverything) | No fix actions; path pieces have no end heights to set. |
| m | S | Code check 'Level floors & thresholds' row | 12731-12740 (buildingLine), 12929-12946 | No code-check panel and no levels row. |
| m | S | Toast when a placed path piece doesn't meet flush | 12860-12889, 12948-12956 | No placement check. |
| m | M | Deck edges as snap targets for paths | 12579-12607 (deckEdgeTargets) | No path-end snapping at all. |

### Joins, stair detail, bathrooms and display

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| p | S | Stair handrails stop at a stair or porch edge where a stair lands (rail openings) | 13143-13253, 13891-13905, 13969-13971, 14019-14036 | The opening is approximated by 2 ft pieces near any other mass, so gaps are coarser and wider than the stair top and not fitted to its exact span on angled or curved edges. |
| m | M | Rails open where a path, walk piece or bridge lands on a deck/porch edge | 13143-13253, 14037-14043, 14165-14179 | No rail-opening logic for anything outside the building itself (paths, pads, the boardwalk, other buildings). |
| p | S | Rails keep clear of doors | 14044-14050, 14122-14147, 14188-14198 | Doors are not considered; a rail edge that crosses in front of a door further than 1.5 ft from the wall, or a door on another building, keeps its rail. |
| p | S | No guard along an enclosed wall (any building) | 14201-14236 | Walls of other buildings are ignored. |
| m | S | Porch posts left out of doorways | 14065-14073, 14267-14276 | Posts are not checked against door positions. |
| p | M | Stair wing built geometry: nosed treads, closed risers, housed stringers | 13714-13748 | Stairs are solid stepped blocks; no separate treads, nosing, risers or stringers. |
| m | S | Support posts under long stair runs | 13744-13747 | Not drawn (moot until stairs stop being solid blocks). |
| m | M | Stair top fitted to an angled or curved host edge | 13625-13660, 13794-13805, 13843-13857, 13873-13878 | Stairs start on a straight line regardless of the host edge shape. |
| m | S | Concrete foot plate at the stair foot | 13773-13774, 13706 | No landing slab at the foot. |
| p | M | Stair handrail detail and rail styles (posts every 1.2 m, wood balusters, steel, cable, glass) | 13749-13751, 13778-13791 | No intermediate posts or infill, and no steel, cable or glass styles. |
| m | S | Stair handrails start back from a door at the stair top | 13858-13870, 13883-13886, 13929-13932, 14054-14064, 14248-14266 | No door check at the stair top. |
| m | M | Ramp wings | 13752-13772 | Ramp wings are parsed but not drawn at all. |
| m | M | Stair and ramp walk pieces drawn as real stairs | 13907-13939 | Walk-kit pieces do not exist in the new app. |
| m | L | Connect tool: Stair option (straight or L-stair with landing) | 13293-13395, 13409-13414 | No Connect tool and no stair layout generator. |
| m | S | Start a stair from a deck (+ popover) with a HUD hint | 13430-13440 | Not present. |
| m | S | Paths snap to deck edges | 13442-13458 | No path tool, so no snapping. |
| m | S | Stair foot rises onto a path or landing | 13397-13403, 13426-13428, 13460-13482 | Stairs always end on the ground. |
| m | S | Door threshold plates | 13066-13080, 13097-13110 | Not drawn. |
| m | S | Filler strips between abutting decks | 13082-13095, 13108 | Not drawn. |
| m | S | Walk-piece tabs where a path meets a building or deck | 13048-13064 | Not present. |
| m | M | '6 in step' chips at uneven junctions | 13485-13514, 13545-13568 | No junction level check or warning chips. |
| m | S | Code check row: Rail clearance | 14278-14320, 14334-14352 | No code-check panel at all. |
| m | S | Railings panel: 'opening at Stair 2' per edge | 14354-14387 | No Railings panel. |
| m | S | Zoom with + and - keys | 14390-14403 | No zoom keys (wheel zoom works through OrbitControls, src/scene/Scene.tsx:42). |
| m | S | Focus selected (F key and toolbar +, -, Focus buttons) | 14396-14405 | No user-facing focus-on-selection or zoom buttons. |
| m | S | Help dialog: closes on Esc or backdrop click, shown on first run | 14407-14414, 14920 | No help dialog or first-run help. |
| m | S | Stale saved-scheme banner | 14922-14935 | No outdated-scheme notice; probably not needed since the new app loads schemes from data/islandale/schemes.json. |
| m | M | Per-item furniture width, depth and height | 14486-14510, 14559-14565, 14595, 14659-14663, 14715-14724, 14769-14773, 14835, 14848-14857 | No interior editor or furniture at all. |
| m | S | Shower, tub and vanity size presets | 14440-14462, 14566-14581, 14836, 14858-14865 | Not present. |
| m | S | Shower options: curb, drain, glass door, bench | 14431-14434, 14470-14484, 14774-14781, 14838-14842, 14866-14871 | Not present. |
| m | M | Bathroom accessibility checks (ICC A117.1) | 14512-14546, 14665-14674, 14783, 14872-14873 | No accessibility checks. |
| m | S | Accessible-room shower defaults | 14466, 14481-14495, 14521-14522, 14676-14703 | Not present. |
| m | S | Shower plan symbol | 14597-14646, 14705-14713 | No floor plan view. |
| m | M | Showers and furniture in 3D | 14715-14764 | Interiors are not drawn in 3D. |
| m | S | Reset to standard and keep the back against the wall | 14496-14502, 14582-14594, 14784, 14821-14831, 14837 | Not present. |
| m | S | Display toggles: ambient occlusion, shadows, edges | 15094-15098 | AO, shadows and edges cannot be switched off. |
| p | S | Edge lines in every display mode | 14998-15000 | No edges in Realistic or White model. |
| m | S | Quality governor for ambient occlusion | 15038-15044, 15065, 15071 | AO always on. |
| p | S | Animated water ripples | 14974-14976, 15061 | Water reflects but does not ripple. |
| m | S | Label de-clutter | 15077-15090 | Labels can overlap. |
| m | S | Loading splash | 15069 | Not present. |
| m | S | PNG snapshot of the view | 15109 | No image export. |
| m | S | Keys 1, 2, 3 switch display mode | 15110-15113 | Not present. |
| m | S | Legend show/hide toggle | 15054, 15114-15115 | No legend. |

### Found by the checker

| | Size | Feature | Legacy lines | What the new app lacks |
| --- | --- | --- | --- | --- |
| p | S | Plan view locked to straight-down, drag pans | 2030-2036, 805-820 (controls.rotateLocked, pan mode when rotateLocked), help row 425 | The top view can be orbited out of by accident, and a left-drag rotates instead of panning. |
| m | S | Drainfield reserve and garden beds | 1117-1118 (LIB septic, garden), 1461, 1848, 1890, 2004 (always on grade, lift disabled), 2337 (septic drawn dashed green on the plan sheet) | No way to add them, no distinct look, and no keep-clear meaning for the drainfield. |
| m | S | Placement ghost (preview, R to turn, Shift to place several) | 2048, 2066 (ghost follows the cursor), 2080 (R turns the ghost 90 degrees), help row 416 | The whole placement interaction. The library entries name placement but not the ghost, the R turn or multi-place. |
