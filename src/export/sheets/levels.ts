import type { SheetPart } from './types'

/** A roof height this near the wall top is the wall top's line, feet (1 in). */
const SAME_FT = 1 / 12

export interface PartLevel {
  readonly label: string
  /** Feet above the main floor. */
  readonly yFt: number
}

/**
 * The levels the elevations and the Levels table mark for one part, feet
 * above the main floor: its floor when it is not the main floor, its wall
 * (or post) top unless a roof height names that line, and its roof's own
 * named heights (ridge, high eave, lip, tip eave …).
 */
export function partLevels(p: SheetPart): PartLevel[] {
  const out: PartLevel[] = []
  if (p.levelFt !== 0) out.push({ label: `${p.name} floor`, yFt: p.levelFt })
  const top = p.levelFt + p.wallFt
  const roof = p.roof?.levels ?? []
  if ((p.kind === 'wall' || p.roof) && !roof.some((l) => Math.abs(l.riseFt) < SAME_FT)) out.push({ label: `${p.name} ${p.kind === 'wall' ? 'wall top' : 'post top'}`, yFt: top })
  return [...out, ...roof.map((l) => ({ label: `${p.name} ${l.label}`, yFt: top + l.riseFt }))]
}
