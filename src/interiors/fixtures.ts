import { FURNITURE } from './furniture'
import type { FurnitureBase } from './types'

/**
 * Bathroom fixtures (old ext:fixtures): size presets for showers, tubs and
 * vanities, shower options, the accessible-room defaults, Reset to
 * standard, and the ICC A117.1 notes. Pure; every change returns a new
 * piece. Sizes in feet (presets in inches); w runs along the wall, d out
 * from it.
 */

export type Curb = 'curbed' | 'curbless'
export type Drain = 'centre' | 'linear'
export type ShowerDoor = 'none' | 'screen' | 'sliding'

export interface ShowerOptions {
  readonly curb: Curb
  readonly drain: Drain
  readonly door: ShowerDoor
  readonly bench: boolean
}

export const CURBS: readonly Curb[] = ['curbed', 'curbless']
export const DRAINS: readonly Drain[] = ['centre', 'linear']
export const SHOWER_DOORS: readonly ShowerDoor[] = ['none', 'screen', 'sliding']
/** Curb height and width, inches. */
const CURB_IN = 4
/** Floor fall to the drain, inches per foot. */
const SLOPE_IN_PER_FT = 0.25
/** Default shower glass height, feet. */
const GLASS_FT = 6.5
/** A roll-in shower's least clear size and a transfer shower's size, inches (ICC A117.1 §608.2). */
const ROLL_IN_IN = [60, 30] as const
const TRANSFER_IN = 36
/** An accessible lavatory's highest rim, inches (§606). */
const LAV_MAX_IN = 34

export interface Preset {
  readonly key: string
  readonly label: string
  /** Inches. */
  readonly w: number
  readonly d: number
  readonly h?: number
  readonly curb?: Curb
}

export const PRESETS: Readonly<Record<string, readonly Preset[]>> = {
  shower: [
    { key: '36x36', label: '36×36 in standard', w: 36, d: 36 },
    { key: '30x60', label: '30×60 in tub replacement', w: 60, d: 30 },
    { key: '36x48', label: '36×48 in', w: 48, d: 36 },
    { key: '42x60', label: '42×60 in', w: 60, d: 42 },
    { key: '60x60', label: '60×60 in roll-in (curbless)', w: 60, d: 60, curb: 'curbless' },
  ],
  tub: [
    { key: '60x30', label: '60×30 in alcove', w: 60, d: 30 },
    { key: '60x32', label: '60×32 in alcove', w: 60, d: 32 },
    { key: '66x32', label: '66×32 in', w: 66, d: 32 },
    { key: '72x36', label: '72×36 in soaker', w: 72, d: 36 },
  ],
  vanity: [
    { key: '24x21', label: '24×21 in', w: 24, d: 21 },
    { key: '30x21', label: '30×21 in', w: 30, d: 21 },
    { key: '36x21', label: '36×21 in', w: 36, d: 21 },
    { key: '48x21', label: '48×21 in', w: 48, d: 21 },
    { key: '60x22', label: '60×22 in double', w: 60, d: 22 },
    { key: '30x20-34h', label: '30×20 in roll-under, 34 in high', w: 30, d: 20, h: 34 },
  ],
}

const SHOWER_STD = { w: 3, d: 3, h: GLASS_FT }
const ROLLIN_STD = { w: 5, d: 5, h: GLASS_FT }
const ACCESS_RE = /access|elder|ada\b|roll[- ]?in|universal|barrier[- ]?free|wheelchair|grand/i

const r2 = (v: number) => Math.round(v * 100) / 100
const inch = (ft: number) => Math.round(ft * 12 * 10) / 10
const toFt = (i: number) => r2(i / 12)

type Piece = FurnitureBase

/** A shower's options; a shower saved before options existed was catalogued curbless, so it reads curbless. */
export function showerOpts(it: Piece): ShowerOptions {
  const fx = it.fx && typeof it.fx === 'object' ? (it.fx as Record<string, unknown>) : null
  if (!fx) return { curb: 'curbless', drain: 'centre', door: 'none', bench: false }
  return {
    curb: CURBS.includes(fx.curb as Curb) ? (fx.curb as Curb) : 'curbed',
    drain: DRAINS.includes(fx.drain as Drain) ? (fx.drain as Drain) : 'centre',
    door: SHOWER_DOORS.includes(fx.door as ShowerDoor) ? (fx.door as ShowerDoor) : 'none',
    bench: !!fx.bench,
  }
}

const showerDefaults = (accessible: boolean): ShowerOptions =>
  accessible ? { curb: 'curbless', drain: 'linear', door: 'none', bench: true } : { curb: 'curbed', drain: 'centre', door: 'screen', bench: false }

/** Is this an accessible room: any room in the elders' cabin, or one named for access? */
export const accessibleRoom = (roomName: string, cabinType: string, buildingName: string): boolean =>
  cabinType === 'elders' || ACCESS_RE.test(roomName) || /elder/i.test(buildingName)

/** A newly placed fixture's size and options: a roll-in shower in an accessible room, a 36×36 curbed one elsewhere. */
export function fixtureDefaults(type: string, accessible: boolean): Partial<Piece> {
  if (type !== 'shower') return {}
  const s = accessible ? ROLLIN_STD : SHOWER_STD
  return { w: s.w, d: s.d, h: s.h, fx: showerDefaults(accessible) }
}

/** Height, feet: the piece's own, else the catalogue's (a shower's glass). */
export function heightOf(it: Piece): number {
  if (typeof it.h === 'number' && it.h > 0) return it.h
  if (it.type === 'shower') return GLASS_FT
  return FURNITURE[it.type]?.h ?? 2.5
}

/** Back to the standard size (a shower by its curb), at the catalogue height. */
export function resetToStandard(it: Piece): Piece {
  const s = it.type === 'shower' ? (showerOpts(it).curb === 'curbless' ? ROLLIN_STD : SHOWER_STD) : FURNITURE[it.type] ?? { w: 2, d: 2 }
  const { h: _h, ...rest } = it
  return keepBack({ ...rest, w: s.w, d: s.d }, it.d)
}

/** Keep the back (−v) edge where it was when the depth changes: the centre moves along +v. */
export function keepBack(it: Piece, oldD: number): Piece {
  const dd = (it.d - oldD) / 2
  if (!Number.isFinite(dd) || Math.abs(dd) < 1e-9) return it
  const a = ((it.rot || 0) * Math.PI) / 180
  return { ...it, x: r2(it.x - Math.sin(a) * dd), z: r2(it.z + Math.cos(a) * dd) }
}

export const presetsFor = (type: string): readonly Preset[] => PRESETS[type] ?? []

export function presetOf(it: Piece): Preset | null {
  return presetsFor(it.type).find((p) => Math.abs(toFt(p.w) - it.w) < 0.02 && Math.abs(toFt(p.d) - it.d) < 0.02 && (p.h == null || Math.abs(toFt(p.h) - heightOf(it)) < 0.02)) ?? null
}

/** A preset's size (and, for the roll-in, curbless with a linear drain), keeping the back on its wall. */
export function applyPreset(it: Piece, key: string): Piece {
  const p = presetsFor(it.type).find((q) => q.key === key)
  if (!p) return it
  let next: Piece = { ...it, w: toFt(p.w), d: toFt(p.d), ...(p.h != null ? { h: toFt(p.h) } : {}) }
  if (it.type === 'shower') {
    const o = showerOpts(it)
    next = { ...next, fx: p.curb ? { ...o, curb: p.curb, drain: p.curb === 'curbless' ? 'linear' : o.drain } : o }
  }
  return keepBack(next, it.d)
}

export function withShowerOption(it: Piece, patch: Partial<ShowerOptions>): Piece {
  return { ...it, fx: { ...showerOpts(it), ...patch } }
}

/** Roll-in (§608.2.2): curbless and at least 60 × 30 in clear. Transfer (§608.2.1): 36 × 36 in. */
export function rollIn(it: Piece) {
  const o = showerOpts(it)
  const a = inch(Math.max(it.w, it.d))
  const b = inch(Math.min(it.w, it.d))
  const big = a >= ROLL_IN_IN[0] - 0.25 && b >= ROLL_IN_IN[1] - 0.25
  return { ok: o.curb === 'curbless' && big, transfer: Math.abs(a - TRANSFER_IN) <= 0.5 && Math.abs(b - TRANSFER_IN) <= 0.5, sizeOk: big, wIn: a, dIn: b }
}

export interface Note {
  /** true: meets it; false: fails it; null: worth knowing. */
  readonly ok: boolean | null
  readonly text: string
}

/** What the code says about a fixture, in an accessible room or not (old fixture notes). */
export function fixtureNotes(it: Piece, accessible: boolean, roomName = ''): Note[] {
  const out: Note[] = []
  if (it.type === 'shower') {
    const o = showerOpts(it)
    const q = rollIn(it)
    const sz = `${q.dIn}×${q.wIn} in`
    if (q.ok) out.push({ ok: true, text: `Qualifies as a roll-in shower: curbless with ${sz} clear (≥ 60×30 in, ICC A117.1 §608.2.2).` })
    else if (o.curb === 'curbless' && q.transfer) out.push({ ok: true, text: '36×36 in curbless: a transfer-type shower (ICC A117.1 §608.2.1), not a roll-in.' })
    else if (o.curb === 'curbless') out.push({ ok: null, text: `Curbless, but ${sz} is under the 60×30 in clear a roll-in needs (ICC A117.1 §608.2.2).` })
    if (accessible) {
      if (o.curb === 'curbed')
        out.push({ ok: false, text: `Curbed shower in an accessible / elders' room${roomName ? ` (${roomName})` : ''}: a ${CURB_IN} in curb stops a wheelchair or walker. Switch to curbless, 60×30 in clear or more (ICC A117.1 §608).` })
      else if (!q.sizeOk) out.push({ ok: false, text: 'Accessible room: make it at least 60×30 in (the 60×60 roll-in preset gives turning room).' })
    }
    if (o.curb === 'curbless') {
      const fall = r2(SLOPE_IN_PER_FT * (o.drain === 'linear' ? it.d : Math.max(it.w, it.d) / 2))
      out.push({ ok: null, text: `Floor slopes ${SLOPE_IN_PER_FT} in/ft to the ${o.drain === 'linear' ? 'linear drain at the back' : 'centre drain'}; total fall ≈ ${fall} in, so the subfloor is recessed.` })
    }
  } else if (it.type === 'tub' && accessible) {
    out.push({ ok: false, text: "A tub in an accessible / elders' room: a curbless roll-in shower is easier to use (ICC A117.1 §608)." })
  } else if (it.type === 'vanity' && accessible) {
    const h = inch(heightOf(it))
    out.push(
      h <= LAV_MAX_IN + 0.01
        ? { ok: true, text: `Vanity ${h} in high: within the 34 in max for a roll-under lavatory (ICC A117.1 §606).` }
        : { ok: false, text: `Vanity ${h} in high: an accessible lavatory is 34 in max with knee space under (ICC A117.1 §606).` },
    )
  }
  return out
}
