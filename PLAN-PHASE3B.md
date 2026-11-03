# Phase 3B plan: design fidelity

Status: **built, waiting for Finley's look (Oct 27 2026).** Goes between Phase 3 and Phase 4. Side-by-side screenshots against the old planner sent after steps 7 and 9; deviations at the end.

Branch: `phase-3b-fidelity` (to branch from `phase-3-graphics`).

## Why this phase

Phase 3 improved the light and materials, but the model underneath them is stripped down. A side-by-side with the old planner (Scheme C, Oct 27 2026) shows what the new app does not draw yet:

- **The cabins' wings.** Each cabin in the old file is a main mass plus wings (`masses(o) = [main, ...wings]`). Scheme C has 12 wings: 7 porches, 3 stairs and 2 decks, including the gathering prow's octagonal porch, its wrap-around deck and the curved sitting steps that run round the madrone. The new app keeps them in `params.wings` but draws none of them.
- **The Elders' walk.** In the old file it is a railed boardwalk that sweeps in an S-curve (a Catmull-Rom spline through its route points). The new app draws it as straight slabs.
- **Railings.** There are none anywhere.
- **Roofs.** They follow the footprint's bounding box, so curved and angled plans get square eaves. The old file fits roofs to the outline, and the prow roof sweeps round the curved west wall.
- **Trees.** Each is one green ball. The old file draws madrones with a leaning red trunk, limbs and a lumpy crown, plus fir, cedar and alder by species.
- **Site linework.** The old view reads as a site plan because of its contour lines, lot-line stakes and shoreline buffer.

The planner should look like the design before Phase 4 builds tools on top of it.

**Done when:** Scheme C and its variants C2–C4, from the Overview, From the water and Golden hour views, show everything the old planner shows for the same scheme: every wing, the curved steps, the boardwalk's curve and rails, fitted roofs, species trees and contours. Both Realistic and White model must pass. Checked against screenshots of the old file taken from matching camera positions.

## What you will be able to see at the end

- Every porch, deck, stair and ramp from the old schemes, attached to its cabin at the right level, with posts or skirts down to the ground.
- Covered porches with their own roofs (shed, pyramid, hip) and open sides on posts.
- Decks with board texture, and the gathering prow's deck with sitting steps that follow its curved edge round the madrone and down to the firepit.
- Stairs with real risers and treads sized to the drop, plus stringers and handrails.
- Guard rails (top rail, bottom rail and balusters) on any deck edge more than 30 in above grade. Edges with steps or doors stay open, as in the old file.
- The Elders' walk as a smooth curved boardwalk on posts, with rails on both sides, rising at its 1:21 slope.
- Roofs whose eaves follow the wall outline at the set overhang, including the prow's curved sweep.
- Madrones that look like madrones, and fir, cedar and alder where the schemes plant them.
- 2 ft contour lines on the terrain, darker every 10 ft, toggled from Layers.
- The gathering prow set 4 ft into the slope, as the scheme says (`earth.sink`), with the ground cut back around it.

Everything stays a plan object drawn from the store. Phase 2 selection, moving, locks, labels and autosave keep working, and moving a cabin moves its wings with it.

## Not in Phase 3B

- **Editing wings** (adding, resizing and moving porches and decks from the inspector). Phase 3B draws them from the data; editing them is Phase 5. The inspector shows a read-only list of a cabin's wings.
- **Rail and stair styles** (glass, steel, cable). Phase 3B draws wood only.
- **The archived schemes' earth objects:** meadows, ponds, boulders and pools (A, B, D–I). They come with Phase 5. Scheme C does not use them.
- **Interiors and the walls editor** (Phase 5).
- **Real cut-through openings** (stays in Phase 4, Track 3).

## Steps

1. **Wings as masses.** A pure function `buildingMasses(params)` returns the main mass plus each wing, with offset (`dx`, `dz`), rotation, size, shape, `kind` (wall, porch, deck, stair, ramp), `open`, level (`lvl`) and roof. `BuildingMesh` draws each mass with the Phase 3 walls, roof and foundation builders. Closed wings get walls. Open wings (porch, deck) get a floor slab and corner posts instead. Porches keep their roof.
2. **Porches.** Floor at the cabin floor level. Posts at the corners and every 8 ft along open edges, carrying the porch roof. Porch roofs use the existing roof builder (shed, pyramid, hip), set at the wing's own height.
3. **Decks.** Board-textured slab with fascia, foundation posts down to grade (the Phase 3 `postPositions`, extended to curved outlines like the old `curvePosts`: a ring just inside the edge plus an interior grid), and beams under it.
4. **Stairs and ramps.** Port the old `stairMath`: the riser count comes from the drop to grade at the stair's foot (risers of 7 in or less, treads 11 in), with even risers. Draw treads, risers, stringers and handrails at 34 in on both sides. Ramps are a sloped slab with rails.
5. **Curved sitting steps.** Port `deckStepsMesh`. A deck edge with `steps: {e0, e1, tread}` gets treads that follow the deck edge between those vertices, each one an offset of the outline by one more tread, stepping down to the ground and parting round tree wells.
6. **Railings.** A `guardRing` builder: top rail at 36 in, bottom rail, and balusters about every 4 in, wrapping any open edge whose drop is over 30 in. Skip edges that carry steps, stairs or a door. The same builder serves decks, porches, stairs and the boardwalk.
7. **Curved boardwalk.** Port `crSpline` (centripetal Catmull-Rom) and draw the bridge as a ribbon along the smoothed route: deck boards, a fascia, posts every 8 ft down to the ground, and rails on both sides. Heights follow the route's elevations, so the 1:21 slope is real.
8. **Fitted roofs.** Port the old `polyRoofGeometry` and `prowRoofGeometry`: grow the wall outline by the overhang with a miter offset (`polyOffset`), then raise the roof from that outline (hip and pyramid to a peak or ridge, prow to its tip). Keep the Phase 3 box roofs as the fallback for rectangles, where they are already right.
9. **Species trees.** Madrone (leaning red trunk, two limbs, seven jittered crown lobes), fir and cedar (stacked cones), and alder (round clustered crown), each seeded by position so it always looks the same. White model and Sketch keep the same shapes in white.
10. **Contours and site marks.** Contour lines at 2 ft (marching squares over the terrain grid), with every 10 ft darker and labelled. Lot-corner stakes and the shoreline buffer line. Turned on from the Layers panel, where they are already listed as "later".
11. **Set into the slope.** For buildings with `earth.sink`, lower the floor by that much and cut the terrain mesh back around the footprint with a short sloped bank. This is drawing only; it changes no plan data.
12. **Check and commit.** Screenshot Scheme C and C2 from matching camera positions in both apps, send the pairs, run the tests, commit.

## Design decisions (say if you disagree)

- **Port the old behaviour, not the old code.** The old file layers its builders on top of each other with later patches (rail styles, stair geometry and tags override earlier versions). Phase 3B reads the final behaviour of each, writes it as small pure TypeScript functions with tests, and checks it against old-file screenshots.
- **Wings stay inside their cabin's params.** They are not separate plan objects. Moving, locking or hiding a cabin moves, locks or hides its wings, as in the old file.
- **Stair and rail sizes from the old file:** guards on edges more than 30 in up (`GUARD_FT = 2.5`, the residential code trigger), 36 in guard height, 34 in handrails, 7 in maximum risers, 11 in treads.
- **Contours off by default** in Realistic, on by default in White model and Sketch, so presentation renders stay clean.
- **Performance:** wing, rail and step geometry is rebuilt only when the cabin's params or its ground drop change, not while it is dragged. Balusters and posts are instanced.

## Tests to write first

- `buildingMasses`: Scheme C's gathering prow returns 5 masses (main + 4 wings), with kinds porch, stair, deck and porch, at the right offsets in local feet.
- Stairs: a 3 ft drop gives 6 risers of 6 in and 5 treads of 11 in, and no riser is ever over 7 in.
- Rails: a deck 4 ft up gets rails on every open edge. A deck 1 ft up gets none. The edges named in `steps` stay open.
- Curved steps: `e0: 3, e1: 14` makes treads only along edges 3 to 14, each tread offset one more `tread` width from the deck edge.
- Catmull-Rom: the smoothed boardwalk passes through every route point, and its length is within 2% of the old file's figure.
- Fitted roofs: every eave point lies on the outline grown by the overhang (within 1 cm), and no roof face lies outside it.
- Contours: lines at every 2 ft step between the lowest and highest ground, closed or ending at the grid edge.
- Playwright: Scheme C renders with no console errors, and the scene has the expected number of wing meshes; locking a cabin also blocks moving its wings.

## Effect on the other phase plans

- **Phase 4** loses three Track 3 items that land here instead: fitted roofs, better trees and contour lines. Phase 4 keeps real openings, beach and foam, sky and contact shadows, sketch lines, faster first frame and the WebGPU check.
- **Phase 5** still owns editing wings, decks, stairs and rails, plus rail styles. Phase 3B only draws them.

## Open questions for Finley

1. Should contour labels show every 10 ft, or is the darker line enough?
2. Is matching the old planner the goal, or should Phase 3B go further where the old one was rough, for example by giving the madrones real leaf texture?

## Changes I want (Finley fills in)

-

## Brief for Claude Code

```
Read PLAN.md and PLAN-PHASE3B.md. Start Phase 3B on branch phase-3b-fidelity,
from phase-3-graphics. Follow the steps in order, tests first for each.
Show me Scheme C next to the old planner after steps 3, 7, 9 and 11.
Commit after each step that leaves the app runnable. Stop and ask before
changing any of the design decisions.
```

## Deviations noted while building

- **Floor height** now takes the highest ground under the box round all of a cabin's masses, wings included, as the legacy bbox() did. Phase 2 and 3 used the main walls only, so some cabins sit a little higher than before, matching the old planner.
- **Sitting steps** use the legacy 7¾ in step riser (STEP_RISE_M); wing stairs use the 7 in / 11 in walk-model rule. Both as in the old file.
- **Boardwalk length:** the scheme stores `d: 81` ft, but the old planner recomputes it from the curve to 77 ft; the port measures the same 77.42 ft.
- **Sunk floors** cut the ground flat 3 ft round the walls and bank it at 2:1, as planned. The old planner instead holds the cut with stone retaining walls and adds a 10 ft court on the downhill side; those come with the Phase 5 site and earthworks tools.
- **Contours** have darker index lines every 10 ft but no number labels yet (open question 1).
- **Trees** are seeded from the object id, not the position, so a tree keeps its shape while it is dragged.
- **Rails** are judged in 2 ft pieces: a piece is left out where another mass (walls, porch, stair head) is within 1.5 ft, which stands in for the old file's rail-clearance rules.
- `window.islandale.look(position, target, fov)` and `scripts/compare-shots.mjs` were added for side-by-side checks against the old planner.
- **End-to-end tests** now take longer: the full model's first frame in headless Chromium can take 10 s or more, so the suite is run one test at a time.
