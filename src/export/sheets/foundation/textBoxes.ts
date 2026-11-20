/**
 * Turned rectangles on the sheet, drawing feet: the room a line of words, a
 * post or a mark takes, and whether two of them overlap. Pure.
 */
import { textWidthFt, type Pt } from '../svgDims'

export interface Box {
  readonly c: Pt
  /** Unit direction of the box's long side. */
  readonly along: Pt
  readonly halfAlong: number
  readonly halfAcross: number
}

const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1]
const across = (b: Box): Pt => [-b.along[1], b.along[0]]
/** How far a box reaches either side of its centre along a direction. */
const reach = (b: Box, axis: Pt) => Math.abs(dot(b.along, axis)) * b.halfAlong + Math.abs(dot(across(b), axis)) * b.halfAcross

/** Whether two boxes overlap (they do not when some side of either separates them). */
export function boxesOverlap(a: Box, b: Box): boolean {
  const between: Pt = [b.c[0] - a.c[0], b.c[1] - a.c[1]]
  return [a.along, across(a), b.along, across(b)].every((axis) => Math.abs(dot(between, axis)) < reach(a, axis) + reach(b, axis))
}

export function boxCorners(b: Box): Pt[] {
  const n = across(b)
  const corner = (i: number, j: number): Pt => [b.c[0] + b.along[0] * b.halfAlong * i + n[0] * b.halfAcross * j, b.c[1] + b.along[1] * b.halfAlong * i + n[1] * b.halfAcross * j]
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
}

/** The box a line of words takes, centred at `c` and turned `angleDeg`, with `padFt` of clear paper all round. */
export function wordsBox(c: Pt, angleDeg: number, words: string, sizeFt: number, padFt = 0): Box {
  const a = (angleDeg * Math.PI) / 180
  return { c, along: [Math.cos(a), Math.sin(a)], halfAlong: textWidthFt(words, sizeFt) / 2 + padFt, halfAcross: sizeFt / 2 + padFt }
}

/** A box grown by `padFt` all round. */
export const grown = (b: Box, padFt: number): Box => ({ ...b, halfAlong: b.halfAlong + padFt, halfAcross: b.halfAcross + padFt })
