# 6I · Section sheets

Track S, part 6I. One long section (A–A) and one cross section (B–B) per building, the cut chosen on the building's plan sheet. Each section shows the floor, the walls, the roof, the cut ground and the openings the cut passes through, with heights in NAVD88. Check-in A is waived (Finley, Nov 14); check-in B stops with PDFs.

## The cuts: where they start and how they move

- **Axes.** Both cuts run along the main part's own axes (the first part, `parts[0]`, turned by its `rotDeg` in the building frame). A–A runs along its longer side; B–B along its shorter side, square to A–A. A standalone deck is its own main part.
- **Default place.** Both pass through the centroid of the main part's outline. For the Gathering prow, A–A therefore runs down the middle of the prow to its tip and B–B crosses the room at its middle. B–B is nudged to the nearest opening on the main part when one is within a quarter of the part's length of the centre, so the cross section passes through a door or window by default. A–A stays on the centroid.
- **Looking direction.** The section is seen with `u` (its horizontal) running to the viewer's right: looking along `look = [dir.z, −dir.x]` (plan x right, z down the sheet). In the default building frame, A–A looks toward the back and B–B looks toward the right.
- **Moving a cut.** On each floor plan sheet in the modal, each cut is drawn with the usual section marks: a long-dash-dot line across the building with a bubble and a filled arrow at each end, the letter in the bubble, the arrow pointing the way the section looks. A bubble can be dragged. The drag moves the line square to itself, clamped to the building's outline. A bubble is also a focusable slider (`role="slider"`): the arrow keys move the cut 6″, or 1″ with Shift. **Reset cuts** in the toolbar puts every cut back to its default. The section sheets redraw as the cut moves.
- **Where a moved cut is kept: view state, not plan data.** It is local React state in `DrawingSheets.tsx`: `Record<buildingId, { A: offsetFt, B: offsetFt }>`, offset from the default along the cut's normal. Why:
  1. Every other sheet setting (paper, scale, layers, North up) is view state there. None of them is saved or undone, so the cuts behave like their neighbours.
  2. Plan data would need a new undoable, lock-aware store action and a new field saved in the plan file. That is an edit to `src/store/` outside this track's files, which the Phase 6 rules say to stop and ask about. Printing a section doesn't change the design, so it shouldn't add a step to undo.
  3. The cost: a moved cut goes back to its default when the modal closes. If Finley wants the cuts kept with the plan, a later step can add `params.sectionCuts` through an undoable action. The cut code takes the offsets as plain input, so nothing else would change.

## Computing a section from the model the other sheets read

All of the maths is pure, in `src/export/sheets/section/`, in building-frame feet with `y` above the main floor (NAVD88 alongside), like the elevations.

- **Input.** The `SheetBuilding` (parts, outlines, walls' inside faces, openings with sills and heads, roofs, supports, earthworks, levels) and a *section source* built beside it from the same objects and terrain by `sectionSource.ts`:
  - the masses (`buildingMasses` / `deckObjectMass`);
  - each part's roof and gable meshes from the very builder the scene uses (`buildRoof(massPoly(m), roofParamsOf(m, finish))`), turned into building-frame triangles in feet. A roof's `y` is measured from its part's wall top, so `y = levelFt + wallFt + mToFt(y_roof)`;
  - the finished ground with the earthworks applied (`planEarth(...).works.ground`, the ground `sheetBuildings` uses) and the surveyed ground (`elevationAt`), each a building-frame-point → feet-above-floor function.
- **The cut line** is `origin + u · dir`; a point's depth beyond it is `(p − origin) · look`.
- **Walls.** For each walled part: the intervals where the line is inside the outline, less the intervals inside the walls' inside face (`inner`), are the cut walls. This is a line crossing two polygons. It takes the curved wall as it comes, because the outline and inside face are the very chords the 3D shell builds. Each cut wall runs from the part floor to its wall top. Where the gable mesh stands over the cut, the wall runs on up to the gable's top at that point, so a long section through a gable roof shows the gable end. Where the cut falls inside an opening piece on that edge, the wall is left open from sill to head, and the jambs, head and sill are drawn.
- **Floors.** For each part with a floor (walls, decks, porches with a slab), the outline intervals give a floor band from `levelFt` down by `DECK_M` (0.3 m), the slab thickness the scene gives a deck.
- **Roofs.** Each roof mesh's triangles are cut by the vertical plane into (u, y) segments, chained into lines (`chainSegments`). A closed chain (a sculpted slab with its own thickness) is drawn as it is. An open chain (a classic roof, one surface) gets a roof band of `ROOF_FT` (10″) below it. The prow's curved, dipped facets and its tip come straight from the mesh, so they need no special case.
- **Seen beyond.** Beyond the cut (depth > 0), drawn in a thin line:
  - the openings in the walls whose inside faces look back at the viewer (sill to head across their width along `u`);
  - each roof's silhouette beyond: its triangles clipped to the far side of the plane, projected onto (u, y), as an upper and lower outline;
  - parts that aren't cut (porches, decks, stairs beyond): their floor edge and their wall or post top across the span they cover;
  - the supports' posts, from foot to floor; a post the cut passes through is drawn cut.
- **Ground.** The finished grade along the cut, every foot, over the building and 4′ beyond each end, as a heavy line with earth hatching below. The surveyed grade is dashed where the earthworks move it more than 1″, as on the elevations. A retaining wall the cut crosses is drawn cut.

## What is cut and what is seen

| Drawn | Line | Fill |
|---|---|---|
| Cut walls, cut floor bands, cut roof bands, cut retaining walls, cut posts | heavy (2 pt) | solid poche (dark grey) |
| Finished grade at the cut | heavy | 45° earth hatching below |
| Opening in a cut wall | medium jambs, head and sill; a glass line for windows | none |
| Openings, roofs, parts and posts beyond | thin (0.5 pt) | none |
| Surveyed grade | thin, dashed grey | none |

## Dimensions and level marks

- **Level marks** sit at the right of the section with a leader to each label, as on the elevations, using the elevations' `levelText`. Each label gives its height in feet and inches above the main floor and in NAVD88: `Main floor +0'-0" (NAVD88 21'-4 1/2")`. The marks are:
  - each cut part's floor;
  - each cut wall's plate (its wall top);
  - the highest point of the cut roof (named ridge, apex or crown when it matches one of the roof's named levels, otherwise "roof top at cut");
  - the eave where the roof's lowest cut point sits;
  - the grade at the outermost cut walls.
- **Vertical chain** on the left: grade, floor, plate and ridge, plus an overall height.
- **Horizontal chain** below: each cut wall's outside face to the next, and the overall width outside to outside.

## Scale and paper

The building sheets' rule: the sections open at the largest standard scale at which every shown section fits one page of the chosen paper (`largestScaleThatFits` over each section's extent). If a scale is picked by hand, it applies to the sections too, and a section too big for the page is tiled with crop marks like every other sheet. The title strip names the sheet "Section A–A (long)" or "Section B–B (cross)".

## Where it plugs in

- `section/sectionCuts.ts`: default cuts, offsets, clamping. `section/sectionGeom.ts`: line × polygon intervals, triangle × plane, clipping, envelopes. `section/sectionSource.ts`: masses, roof meshes and ground for one building. `section/sectionView.ts`: the section as data. `section/sectionLayout.ts`: dimensions, labels, extent. Each has tests beside it.
- `section/SectionSheet.tsx` draws one section on tiled pages. `section/SectionMarks.tsx` draws the cut marks on a plan, with the drag and the keys.
- `DrawingSheets.tsx`:
  - a **Sections** checkbox (on by default);
  - the cut offsets state and a **Reset cuts** button;
  - the section scale;
  - `<SectionSheets>` after each building's elevations;
  - the cuts passed to `PlanSheet`, which gets an optional `cuts` prop and draws `SectionMarks` when it is given.
- Tests: unit tests for a straight wall, the curved wall, a roof slope, an opening the cut passes through, and the ground on the slope with earthworks. A browser test opens the Gathering prow's sheets and finds both sections with their level marks (Scheme C only).

## Check-in B

The section sheets for every Scheme C building are printed to PDF headless (as for 6H) and saved outside the repo. I look at each page and list what's wrong.
