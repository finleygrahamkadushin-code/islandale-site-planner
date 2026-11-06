import { EXT_PARTS, extResolve, type ExtHost, type ExtTagPart } from '../../buildings/paint/exterior'
import type { PlanObject } from '../../store/types'

/**
 * The glTF extras of one exported mesh: what the Blender importer and
 * styles.json key on (part, oid, objName, t, mi, ei, wallKind, roofMat,
 * railStyle, interior, decor). Building paint comes from extResolve, the
 * lookup Paint mode uses, so the file says what the app draws. Pure.
 */
export interface MeshExtras {
  readonly part: string
  /** 'planner': the scene tagged the piece; 'inferred': taken from the object's type. */
  readonly partSrc: 'planner' | 'inferred'
  readonly oid: string
  readonly objName: string
  readonly t: string
  readonly k: number
  readonly mi?: number
  readonly ei?: number
  readonly wallKind?: string
  readonly roofMat?: string
  readonly railStyle?: string
  /** Resolved colour, sRGB hex, as the app shows it. */
  readonly color?: string
  readonly interior?: true
  readonly decor?: true
}

/** What the scene says about one drawn piece (its userData, and its mass from the nearest group above it). */
export interface PieceInfo {
  readonly part?: string
  readonly interiorPart?: string
  readonly mi?: number
  /** The outline edge, for a wall split per edge (0 for a curved mass's one wall). */
  readonly ei?: number
  /** Cladding over a whole mass (gables, domes): not held to the wall height check. */
  readonly massWide?: boolean
  /** The colour the scene draws it in, sRGB hex. */
  readonly drawnHex?: string
}

const PAINT_HOSTS: Readonly<Record<string, ExtHost>> = { house: 'building', deck: 'deck' }
const EXT_TAG_PARTS: readonly string[] = [...EXT_PARTS, 'stair', 'ramp']
const isExtTagPart = (p: string): p is ExtTagPart => EXT_TAG_PARTS.includes(p)

export function meshExtras(o: PlanObject, piece: PieceInfo, k: number): MeshExtras {
  const base = { oid: o.id, objName: o.name, t: o.type, k, ...(piece.mi !== undefined ? { mi: piece.mi } : {}), ...(piece.ei !== undefined ? { ei: piece.ei } : {}) }
  const colour = piece.drawnHex ? { color: piece.drawnHex } : {}
  if (piece.interiorPart) {
    return { ...base, ...colour, part: piece.interiorPart === 'wall' ? 'partition' : piece.interiorPart, partSrc: 'planner', interior: true }
  }
  if (!piece.part) return { ...base, ...colour, part: o.type, partSrc: 'inferred' }
  const decor = piece.massWide ? { decor: true as const } : {}
  const host = PAINT_HOSTS[o.type]
  const paintPart = piece.part === 'gable' ? 'wall' : piece.part
  if (!host || !isExtTagPart(paintPart)) return { ...base, ...colour, ...decor, part: piece.part, partSrc: 'planner' }
  const r = extResolve(o.params as Record<string, unknown>, piece.mi ?? 0, paintPart, piece.ei ?? null, host)
  const paint =
    piece.part === 'wall' || piece.part === 'gable' ? { wallKind: r.kind || 'painted' } : piece.part === 'roof' ? { roofMat: r.mat || 'plain' } : piece.part === 'rail' ? { railStyle: r.style || 'wood' } : {}
  return { ...base, ...decor, ...paint, part: piece.part, partSrc: 'planner', color: r.color }
}
