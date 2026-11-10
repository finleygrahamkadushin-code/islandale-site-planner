# 6K · Interiors pass

Approved by Finley on Nov 9 2026 ("Go ahead"). It comes from the interiors research: the vault note `03 Resources/Islandale Interiors Research/Interiors Playbook.md`, with the code audit at `.scratch/research/interiors/code-audit.md`. It is an extra Phase 6 track in `src/`, separate from the Blender and Unreal track.

There are four parts. Each gets its own branch and is checked in the browser before the next one starts:

| Part | What | Done when |
|---|---|---|
| **K1 · Interior geometry** | Room floors; partitions clipped to the inside of the exterior walls; partitions on each floor joined into one shape; the upper slab built from the inner outline; the spiral landing drawn once; rooms in raised wings at the wing's level | Every Scheme C cabin seen with Roofs off has floors. No partition shows outside the siding, and wall tops don't flicker while orbiting. The unit tests prove there is no partition outside the walls on the curved schemes and no overlapping partition plan. |
| **K2 · Light and shadows** | Shadow bias and normal bias; a shadow box fitted to the camera when it is close; room-sized ambient occlusion; interior fill; camera near/far; MSAA | No light leaks at wall bases and furniture sits on the floor, from the saved views |
| **K3 · Materials and furniture** | Plaster on the inside face of exterior walls; floor finishes; a ceiling you can see from below; furniture built from 2–3 bevelled parts; door leaves, casings and glass; tints in White model and Sketch | Rooms read as finished, from the saved views |
| **K4 · Floor-plan drawing** | Sheet line weights and text sizes; stair symbols; editor colours, joined partitions, a crisp grid, labels that don't overlap, hover; wall thickness matching 3D | The sheets meet the conventions in the playbook; `e2e/sheets.spec.ts` passes |

**Defaults agreed:**
- Floors are wood in living rooms and bedrooms and tile in wet rooms. Textures come in K3.
- Furniture is built from simple parts, not downloaded models.
- The 43 floor-plan rules become a later phase of their own.

## K1 · Interior geometry (branch `claude/phase-6k1-interior-geometry`)

All of it is in `src/interiors/scene3d/`. The pure geometry goes in `interiorShell.ts` and is drawn by `InteriorMesh.tsx`.

- **Inner region:** each enclosed mass's wall ring (`wallPlan`, the same ring the shell is built on), inset by half of each wall's thickness. Glass curtain walls are inset by their full thickness, so a partition never shows inside the glass. Floors, partitions and the slab are clipped to this region, so their edges sit buried in the walls and never reach the siding.
- **Floors:** one finish slab per room, 0.06 ft thick, with earlier rooms winning where rooms overlap. On the main floor, any bare part of the inner region gets a plain floor too. Upper floors leave out the stair holes.
- **Partitions:**
  - Ends at the exterior wall run out past the inner face, then are clipped to it.
  - Ends at another partition run on by half the partition's thickness, so L corners close.
  - Each height band (full, door head, window head, sill) is merged into one shape and extruded once, with no overlapping faces.
  - Tops under a slab stop 0.01 ft short of it.
- **Levels:** anything inside a raised wing whose own level puts it on that floor sits at the wing's level, not at floor × 9 ft.
- **Spiral stairs:** the landing wedge is left out when the slab above already covers it.
