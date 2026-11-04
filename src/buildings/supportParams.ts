import { num, type LocalPoint } from './footprint'

/**
 * What a building or standalone deck says it stands on, read from its
 * params as the scene's cabins and decks read them (legacy supportsMesh's
 * o.support, o.postSpacing, o.postSize, o.bracing, o.mastAt), so the 3D
 * supports and the drawing sheets lay out the same posts.
 */

export interface SupportParams {
  readonly support: unknown
  readonly spacingFt: number
  /** Post size, inches; undefined for each support kind's own. */
  readonly postIn?: number
  /** Cross-brace a high post grid (legacy o.bracing), under every rectangular enclosed mass. */
  readonly bracing?: boolean
  /** Where a mast stands, feet, building-local (legacy o.mastAt); main mass only. */
  readonly mastAt?: LocalPoint
}

/**
 * A standalone deck's own supports (legacy: a t:'deck' object stands on
 * supportsMesh, its support, post spacing, post size and bracing, with
 * 'auto' read as posts), in place of a deck wing's rim and posts.
 */
export interface DeckSupports {
  readonly support: unknown
  readonly spacingFt: number
  readonly postIn?: number
  readonly bracing?: boolean
}

type Params = Readonly<Record<string, unknown>>

/** Legacy default post spacing, feet, under a cabin and a standalone deck alike. */
export const POST_SPACING_FT = 8

/** A stored mast position (legacy o.mastAt, feet, building-local) when it is a pair of numbers. */
export function mastPoint(v: unknown): LocalPoint | undefined {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? [v[0], v[1]] : undefined
}

/** A cabin's supports under its enclosed masses (legacy supportsMesh): a size of its own, else each kind's own (piers and pilings 10 in). */
export function buildingSupports(p: Params): SupportParams {
  return {
    support: p.support,
    spacingFt: num(p.postSpacing, POST_SPACING_FT),
    postIn: typeof p.postSize === 'number' ? p.postSize : undefined,
    bracing: p.bracing === true,
    mastAt: mastPoint(p.mastAt),
  }
}

/** A standalone deck's supports: 'auto' (or none) is posts, as the old planner drew decks. */
export function deckSupports(p: Params): DeckSupports {
  const support = typeof p.support === 'string' && p.support !== 'auto' ? p.support : 'posts'
  const postIn = typeof p.postSize === 'number' && Number.isFinite(p.postSize) ? p.postSize : undefined
  return { support, spacingFt: num(p.postSpacing, POST_SPACING_FT), postIn, bracing: p.bracing === true }
}
