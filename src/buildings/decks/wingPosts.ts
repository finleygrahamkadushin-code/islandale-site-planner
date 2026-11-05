import type { LocalPoint } from '../footprint'
import { pointInPolygon } from '../foundation/foundation'
import { curvePosts, edgePosts, offsetOutline, perimeterSamples } from '../outline'

/**
 * The posts under a cabin's deck and porch wings (legacy deck posts and
 * porchPostKeep), where they stand and how far down they reach, shared by
 * the 3D wings and the drawing sheets. Plans in feet, mass-local; heights
 * in metres from the mass floor, y up.
 */

/** Deck and porch floors are 0.3 m deep, top at the mass floor (legacy shapeGeom(P, 0.3)). */
export const DECK_M = 0.3
/** A deck wing's rim beam is this deep under the floor, metres. */
export const DECK_BEAM_M = 0.28
export const DECK_POST_M = 0.2
export const PORCH_POST_M = 0.25
const DECK_POST_SPACING_FT = 6
const DECK_POST_INSET_FT = 1
/** The rim beam runs this share of the posts' inset in from the deck's edge. */
const DECK_RIM_INSET = 0.6
const PORCH_POST_INSET_FT = 0.8
const PORCH_POST_GAP_FT = 12
/** Outlines with more vertices than this are curves: posts go in a ring and grid, not at the corners. */
const CURVED_VERTICES = 24
/** Posts round a curved porch stand about this far apart (legacy perimSamples(inner, 2.4 m)). */
const CURVED_PORCH_POST_GAP_FT = 2.4 / 0.3048
/** A post shorter than this is left out, metres (Posts' len < EMBED + 0.05). */
const MIN_POST_M = 0.05

/** Legacy deck posts: at the inset corners, or a ring and grid under curved decks. */
export function deckPostPoints(poly: readonly LocalPoint[]): LocalPoint[] {
  if (poly.length > CURVED_VERTICES) return curvePosts(poly, DECK_POST_SPACING_FT, DECK_POST_INSET_FT)
  return edgePosts(offsetOutline(poly, -DECK_POST_INSET_FT), DECK_POST_SPACING_FT * 1.5)
}

/** The line a deck wing's rim beam follows, just inside its edge, feet. */
export const deckRimOutline = (poly: readonly LocalPoint[]): LocalPoint[] => offsetOutline(poly, -DECK_POST_INSET_FT * DECK_RIM_INSET)

/** Porch posts: just inside each corner and along long edges, or evenly round just inside a curved edge. */
export function porchPostPoints(poly: readonly LocalPoint[]): LocalPoint[] {
  const inner = offsetOutline(poly, -PORCH_POST_INSET_FT)
  if (poly.length > CURVED_VERTICES) return perimeterSamples(inner, CURVED_PORCH_POST_GAP_FT)
  return edgePosts(inner, PORCH_POST_GAP_FT)
}

/** Where a porch post must not stand, mass-local feet: inside the walls, or in front of another mass's door. */
export interface PorchKeep {
  readonly insideWalls: (p: LocalPoint) => boolean
  readonly inDoorway?: (p: LocalPoint) => boolean
}

/** The porch posts that stand (legacy porchPostKeep): none inside the walls or in front of another mass's door. */
export const keptPorchPosts = (poly: readonly LocalPoint[], keep: PorchKeep): LocalPoint[] => porchPostPoints(poly).filter((p) => !keep.insideWalls(p) && !keep.inDoorway?.(p))

/** A post from `top` down to the ground, buried SUPPORT_EMBED_M: plan point in feet, y0 (its foot) and y1 (its top) in metres from the mass floor. */
export interface StandingPost {
  readonly at: LocalPoint
  readonly y0: number
  readonly y1: number
}

/** Posts from `top` (metres from the mass floor) down to the ground under each point; points closer than a post to the ground get none. */
export function standingPosts(points: readonly LocalPoint[], top: number, groundY: (x: number, z: number) => number, embedM: number): StandingPost[] {
  return points.flatMap((at): StandingPost[] => {
    const g = groundY(at[0], at[1])
    return top - g < MIN_POST_M ? [] : [{ at, y0: g - embedM, y1: top }]
  })
}

/** Whether a point (building-local feet) is inside any of the given outlines. */
export const insideAny = (polys: readonly (readonly LocalPoint[])[], [x, z]: LocalPoint): boolean => polys.some((poly) => pointInPolygon(poly, x, z))
