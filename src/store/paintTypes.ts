import type { ObjectId } from './types'

/** How far an exterior change reaches (legacy ex-scope): the picked element, its mass, or the whole building. */
export type PaintScope = 'element' | 'mass' | 'house'

/** The element the Exterior panel works on: a part of one mass, and for walls one edge (legacy st.focus). */
export interface PaintFocus {
  readonly objectId: ObjectId
  /** wall, roof, trim, deck, post, door, glass, foundation or rail. */
  readonly part: string
  readonly mass: number
  /** The wall edge, for walls; null for the whole part. */
  readonly edge: number | null
}
