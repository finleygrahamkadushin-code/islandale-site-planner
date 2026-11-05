import * as G from '../geom'
import type { Pt } from '../geom'
import type { Furniture, FurnitureBase } from '../types'
import { WALL } from '../types'

/**
 * The furniture catalogue and its plan symbols, ported from the old
 * planner's int2/furniture.js. Symbols are SVG fragments in the item's own
 * frame (feet, u across, v deep, its back at v = -d/2), built only from
 * numbers and fixed labels, never from anything typed.
 */

export interface FurnitureType {
  readonly label: string
  readonly w: number
  readonly d: number
  /** Height for the 3D box, feet. */
  readonly h: number
  readonly color: string
  /** true: width and depth; 'w': width only; false: fixed size. */
  readonly resizable: boolean | 'w'
  /** Snaps its back to the nearest wall when placed or moved. */
  readonly wallSnap: boolean
  readonly group: 'Sleep' | 'Living' | 'Kitchen' | 'Bath' | 'Storage' | 'Other'
}

const T = (label: string, w: number, d: number, h: number, color: string, resizable: boolean | 'w', wallSnap: boolean, group: FurnitureType['group']): FurnitureType => ({
  label, w, d, h, color, resizable, wallSnap, group,
})
const BED = '#d9d2c3'
const FIX = '#f4f4f4'
const WOOD = '#a9865f'
const CAB = '#cfc8bb'

export const FURNITURE: Readonly<Record<string, FurnitureType>> = {
  queen: T('Queen bed', 5, 6.67, 2, BED, false, true, 'Sleep'),
  twin: T('Twin bed', 3.25, 6.25, 2, BED, false, true, 'Sleep'),
  bunk: T('Bunk bed', 3.25, 6.5, 5.5, BED, false, true, 'Sleep'),
  sofa: T('Sofa, 3-seat', 7, 3, 2.75, '#8f8272', true, true, 'Living'),
  armchair: T('Armchair', 2.75, 2.75, 2.75, '#9a8b78', false, false, 'Living'),
  coffee: T('Coffee table', 4, 2, 1.4, WOOD, true, false, 'Living'),
  dining8: T('Dining table for 8', 7, 8, 2.5, WOOD, false, false, 'Kitchen'),
  counter: T('Counter (sink + range)', 10, 2, 3, CAB, 'w', true, 'Kitchen'),
  island: T('Island', 6, 3, 3, CAB, true, false, 'Kitchen'),
  fridge: T('Fridge', 3, 2.5, 6, FIX, false, true, 'Kitchen'),
  toilet: T('Toilet', 1.67, 2.33, 2.5, FIX, false, true, 'Bath'),
  vanity: T('Vanity', 2.5, 1.75, 3, '#b9a283', 'w', true, 'Bath'),
  shower: T('Curbless shower 60×60', 5, 5, 0.1, FIX, false, true, 'Bath'),
  tub: T('Tub', 5, 2.5, 1.8, FIX, false, true, 'Bath'),
  wardrobe: T('Wardrobe', 4, 2, 7, '#9c7b58', 'w', true, 'Storage'),
  dresser: T('Dresser', 3.5, 1.67, 2.75, '#a98a66', 'w', true, 'Storage'),
  desk: T('Desk', 4, 2, 2.5, WOOD, true, true, 'Other'),
  washer: T('Washer/dryer, stacked', 2.5, 2.5, 6, FIX, false, true, 'Storage'),
  stair: T('Stair run', 3.5, 10, 9, '#b8a78e', true, false, 'Other'),
  spiral: T('Spiral stair 5 ft', 5, 5, 9, '#b8a78e', false, false, 'Other'),
  stairdn: T('Stair top · DN (upper floor)', 3.5, 10, 3, '#b8a78e', true, false, 'Other'),
  spiraldn: T('Spiral stair top · DN (upper floor)', 5, 5, 3, '#b8a78e', false, false, 'Other'),
  stove: T('Wood stove + hearth', 3, 3, 3, '#5a554f', false, true, 'Living'),
}

/** Library order. */
export const FURNITURE_ORDER = [
  'queen', 'twin', 'bunk', 'sofa', 'armchair', 'coffee', 'stove', 'dining8', 'counter', 'island', 'fridge',
  'toilet', 'vanity', 'shower', 'tub', 'wardrobe', 'dresser', 'washer', 'desk', 'stair', 'spiral', 'stairdn', 'spiraldn',
] as const

export const isStairType = (t: string): boolean => t === 'stair' || t === 'spiral' || t === 'stairdn' || t === 'spiraldn'

// ---------- SVG fragments (local frame: u → x, v → y, back at v = -d/2)

const n = (v: number | string) => +(+v).toFixed(3)
const WF = ' fill="#fff"'
const DASH = ' stroke-dasharray="0.35 0.25"'
const rect = (x: number, y: number, w: number, h: number, o = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}"${o}/>`
const line = (x1: number, y1: number, x2: number, y2: number, o = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"${o}/>`
const circ = (cx: number, cy: number, r: number, o = '') => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(0, r))}"${o}/>`
const ell = (cx: number, cy: number, rx: number, ry: number, o = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(Math.max(0, rx))}" ry="${n(Math.max(0, ry))}"${o}/>`
const path = (d: string, o = '') => `<path d="${d.replace(/-?\d*\.?\d+(e-?\d+)?/g, (m) => String(n(m)))}"${o}/>`
const rx = (r: number) => ` rx="${n(r)}"`
const text = (x: number, y: number, s: string, size: number) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-family="Helvetica,Arial,sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="#555" style="stroke:none">${s}</text>`
const label = (x: number, y: number, s: string, size: number) => rect(x - s.length * size * 0.36 - 0.08, y - size * 0.6, s.length * size * 0.72 + 0.16, size * 1.2, WF) + text(x, y, s, size)

function bed(w: number, d: number, pillows: number, fold: boolean): string {
  const x0 = -w / 2
  const y0 = -d / 2
  const pad = Math.min(0.25, w * 0.06)
  const ph = Math.min(1.25, d * 0.19)
  const gap = 0.25
  let s = rect(x0, y0, w, d, rx(0.12))
  const pw = pillows === 2 ? (w - 2 * pad - gap) / 2 : w - 2 * pad
  for (let i = 0; i < pillows; i++) s += rect(x0 + pad + i * (pw + gap), y0 + pad, pw, ph, rx(Math.min(0.3, ph / 3)))
  const v0 = y0 + pad + ph + 0.4
  if (fold) {
    // sheet turned down across the bed with the corner folded back
    const k = Math.min(1.3, w * 0.28, (d / 2 - v0) * 0.9)
    s += path(`M${x0} ${v0}H${w / 2 - k}L${w / 2} ${v0 + k}`)
    s += path(`M${w / 2 - k} ${v0}V${v0 + k}H${w / 2}Z`, WF)
  } else s += line(x0, v0, w / 2, v0)
  return s
}

function seat(w: number, d: number, back: number, arm: number, cushions: number): string {
  const x0 = -w / 2
  const y0 = -d / 2
  let s = rect(x0, y0, w, d, rx(0.25))
  s += rect(x0, y0, w, back, rx(0.2))
  s += rect(x0, y0, arm, d, rx(0.2)) + rect(w / 2 - arm, y0, arm, d, rx(0.2))
  const sx = x0 + arm
  const cw = (w - 2 * arm) / cushions
  for (let i = 0; i < cushions; i++) s += rect(sx + i * cw + 0.06, y0 + back + 0.06, cw - 0.12, d - back - 0.16, rx(0.15) + WF)
  return s
}

/** Risers in a 9 ft floor-to-floor straight stair (7.75 in or less each). */
export const STAIR_RISERS = Math.max(12, Math.ceil(108 / 7.75))

function stairSym(w: number, d: number, dn: boolean): string {
  const x0 = -w / 2
  const y0 = -d / 2
  const N = STAIR_RISERS
  const t = d / (N - 1)
  let s = rect(x0, y0, w, d, dn ? '' : WF)
  for (let k = 1; k < N - 1; k++) {
    const v = d / 2 - k * t
    s += line(x0, v, w / 2, v, dn && k < N / 2 ? DASH : '')
  }
  if (dn) s += line(x0, d / 2, w / 2, d / 2) + path(`M${x0 + 0.12} ${y0}V${d / 2 - 0.12}H${w / 2 - 0.12}V${y0}`, ' fill="none" stroke-width="0.12"')
  const vs = dn ? y0 + 0.5 : d / 2 - Math.min(1.0, d * 0.15)
  const ve = dn ? d / 2 - 0.6 : y0 + 0.25
  const ah = Math.min(0.5, w * 0.15)
  const sg = dn ? -1 : 1
  s += line(0, vs, 0, ve) + circ(0, vs, 0.1, WF) + path(`M${-ah} ${ve + sg * ah * 1.4}L0 ${ve}L${ah} ${ve + sg * ah * 1.4}`)
  s += label(0, dn ? y0 + 1.1 : d / 2 - 0.42, dn ? 'DN' : 'UP', Math.min(0.55, w * 0.18))
  if (!dn) s += label(0, 0, `${N}R`, Math.min(0.42, w * 0.13))
  return s
}

function spiralSym(w: number, d: number, dn: boolean): string {
  const r = Math.min(w, d) / 2 - 0.05
  const rp = 0.3
  const D = Math.PI / 180
  const P = (a: number): Pt => [r * Math.cos(a), r * Math.sin(a)]
  let s = circ(0, 0, r, dn ? '' : WF)
  if (dn) {
    // landing wedge (the floor) and the rail on its open edge
    const a = P(0)
    const b = P(330 * D)
    s += path(`M0 0L${n(b[0])} ${n(b[1])}A${n(r)} ${n(r)} 0 0 1 ${n(a[0])} ${n(a[1])}Z`, ' fill="#ece6da"')
    s += path(`M${n(a[0] * 0.98)} ${n(a[1] * 0.98)}A${n(r * 0.98)} ${n(r * 0.98)} 0 1 1 ${n(b[0] * 0.98)} ${n(b[1] * 0.98)}`, ' fill="none" stroke-width="0.12"') + line(0, 0, a[0], a[1], ' stroke-width="0.12"')
  }
  for (let k = 0; k < 12; k++) {
    const [x, y] = P(k * 30 * D)
    s += line(n(rp * Math.cos(k * 30 * D)), n(rp * Math.sin(k * 30 * D)), x, y, dn && k > 0 && k < 11 ? DASH : '')
  }
  s += circ(0, 0, rp, WF)
  if (!dn)
    for (let k = 1; k <= 11; k++) {
      const a = (k - 0.5) * 30 * D
      s += text(n(r * 0.78 * Math.cos(a)), n(r * 0.78 * Math.sin(a)), String(k), Math.min(0.32, r * 0.12))
    }
  const ra = r * 0.55
  const a0 = (dn ? 345 : 15) * D
  const a1 = (dn ? 60 : 300) * D
  const p0: Pt = [ra * Math.cos(a0), ra * Math.sin(a0)]
  const p1: Pt = [ra * Math.cos(a1), ra * Math.sin(a1)]
  s += circ(n(p0[0]), n(p0[1]), 0.1, WF) + path(`M${n(p0[0])} ${n(p0[1])}A${n(ra)} ${n(ra)} 0 1 ${dn ? 0 : 1} ${n(p1[0])} ${n(p1[1])}`, ' fill="none"')
  const tg: Pt = dn ? [Math.sin(a1), -Math.cos(a1)] : [-Math.sin(a1), Math.cos(a1)]
  const ah = 0.32
  const b: Pt = [p1[0] - tg[0] * ah, p1[1] - tg[1] * ah]
  s += path(`M${n(b[0] - tg[1] * ah * 0.6)} ${n(b[1] + tg[0] * ah * 0.6)}L${n(p1[0])} ${n(p1[1])}L${n(b[0] + tg[1] * ah * 0.6)} ${n(b[1] - tg[0] * ah * 0.6)}`)
  const lp: Pt = dn ? [r * 0.45 * Math.cos(200 * D), r * 0.45 * Math.sin(200 * D)] : [0, -r * 0.18]
  s += label(n(lp[0]), n(lp[1]), dn ? 'DN' : 'UP 12R', Math.min(0.4, r * 0.15))
  return s
}

const SYM: Readonly<Record<string, (w: number, d: number) => string>> = {
  queen: (w, d) => bed(w, d, 2, true),
  twin: (w, d) => bed(w, d, 1, true),
  bunk(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    const v0 = y0 + 0.25 + Math.min(1.25, d * 0.19) + 0.4
    let s = bed(w, d, 1, false)
    s += line(x0, v0, w / 2, d / 2, DASH) + line(w / 2, v0, x0, d / 2, DASH)
    const lx = w / 2 - 0.55
    const lt = v0 + 0.5
    const lb = Math.min(d / 2 - 0.3, lt + 2.4)
    s += rect(lx, lt, 0.45, lb - lt, WF)
    for (let v = lt + 0.4; v < lb - 0.1; v += 0.4) s += line(lx, v, lx + 0.45, v)
    return s
  },
  sofa: (w, d) => seat(w, d, Math.min(0.6, d * 0.25), Math.min(0.6, w * 0.12), w >= 4.5 ? 3 : w >= 3.5 ? 2 : 1),
  armchair: (w, d) => seat(w, d, Math.min(0.55, d * 0.22), Math.min(0.5, w * 0.2), 1),
  coffee: (w, d) => rect(-w / 2, -d / 2, w, d, rx(0.15)) + rect(-w / 2 + 0.2, -d / 2 + 0.2, w - 0.4, d - 0.4, rx(0.08)),
  dining8(w, d) {
    const tw = Math.min(3.5, w * 0.5)
    const c = 1.5
    const tuck = 0.35
    const step = d / 4
    let s = ''
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const cx = side * (tw / 2 + c / 2 - tuck)
        const cy = -d / 2 + step * (i + 0.5)
        s += rect(cx - c / 2, cy - c / 2, c, c, rx(0.2) + WF)
        const bx = side * (tw / 2 + c - tuck - 0.22)
        s += line(bx, cy - c / 2 + 0.12, bx, cy + c / 2 - 0.12)
      }
    return s + rect(-tw / 2, -d / 2, tw, d, rx(0.08) + WF) + rect(-tw / 2 + 0.25, -d / 2 + 0.25, tw - 0.5, d - 0.5, DASH)
  },
  counter(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    let s = rect(x0, y0, w, d)
    // a shallow run is shelving or a pantry
    if (d < 1.9) return s + line(x0 + 0.15, 0, w / 2 - 0.15, 0, DASH)
    const sink = (cx: number) => {
      const sw = Math.min(2.6, w * 0.4)
      const bw = (sw - 0.15) / 2
      const bh = d - 0.65
      const by = y0 + 0.4
      let t = rect(cx - sw / 2 - 0.1, y0 + 0.25, sw + 0.2, d - 0.45, rx(0.12))
      for (const k of [0, 1]) {
        const bx = cx - sw / 2 + k * (bw + 0.15)
        t += rect(bx, by, bw, bh, rx(0.2)) + circ(bx + bw / 2, by + bh / 2, 0.09)
      }
      return t + circ(cx, y0 + 0.15, 0.07)
    }
    if (w >= 5.5) {
      s += sink(-w / 6)
      const rxc = w / 4
      const rs = 2.5
      const rd = Math.min(d, 2.5)
      s += rect(rxc - rs / 2, y0, rs, rd)
      for (const [du, dv, r] of [[-0.6, -0.45, 0.34], [0.6, -0.45, 0.26], [-0.6, 0.45, 0.26], [0.6, 0.45, 0.34]])
        s += circ(rxc + du, y0 + rd / 2 + (dv * rd) / 2.2, r) + circ(rxc + du, y0 + rd / 2 + (dv * rd) / 2.2, r * 0.45)
    } else if (w >= 3) s += sink(0)
    return s
  },
  island: (w, d) => rect(-w / 2, -d / 2, w, d, rx(0.1)) + line(-w / 2 + 0.1, d / 2 - Math.min(1, d * 0.33), w / 2 - 0.1, d / 2 - Math.min(1, d * 0.33), DASH),
  fridge(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    return rect(x0, y0, w, d) + line(x0, y0, w / 2, d / 2 - 0.2) + line(w / 2, y0, x0, d / 2 - 0.2) + line(x0, d / 2 - 0.2, w / 2, d / 2 - 0.2) + label(0, -0.1, 'REF', Math.min(0.55, w * 0.2))
  },
  toilet(w, d) {
    const y0 = -d / 2
    const th = Math.min(0.75, d * 0.32)
    const tw = w * 0.96
    const bry = (d - th) / 2 + 0.04
    const brx = w * 0.37
    return rect(-tw / 2, y0, tw, th, rx(0.1)) + ell(0, y0 + th + bry - 0.06, brx, bry, WF) + ell(0, y0 + th + bry + 0.02, brx * 0.68, bry * 0.7)
  },
  vanity(w, d) {
    const y0 = -d / 2
    const bx = Math.min(0.75, w * 0.32)
    const by = Math.min(0.55, d * 0.32)
    return rect(-w / 2, y0, w, d) + ell(0, 0.08, bx, by) + ell(0, 0.1, bx * 0.75, by * 0.7) + circ(0, y0 + 0.22, 0.08)
  },
  shower(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    return rect(x0, y0, w, d) + rect(x0 + 0.12, y0 + 0.12, w - 0.24, d - 0.24, DASH) + line(x0, y0, w / 2, d / 2) + line(w / 2, y0, x0, d / 2) + circ(0, 0, 0.24, WF) + circ(0, 0, 0.1) + circ(0, y0 + 0.3, 0.16)
  },
  tub(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    const i = Math.min(0.25, d * 0.12)
    const r = Math.min(0.9, (d - 2 * i) / 2)
    return rect(x0, y0, w, d, rx(0.08)) + rect(x0 + i, y0 + i, w - 2 * i, d - 2 * i, rx(r)) + circ(x0 + i + 0.45, 0, 0.12)
  },
  wardrobe(w, d) {
    const x0 = -w / 2
    let s = rect(x0, -d / 2, w, d) + line(x0 + 0.15, 0, w / 2 - 0.15, 0, DASH)
    const hh = Math.min(0.75, d * 0.36)
    for (let u = x0 + 0.35; u < w / 2 - 0.2; u += 0.4) s += line(u - 0.12, -hh, u + 0.12, hh)
    return s
  },
  desk(w, d) {
    const c = Math.min(1.5, w * 0.4)
    return rect(-c / 2, d / 2 - 0.55, c, c, rx(0.25)) + line(-c / 2 + 0.15, d / 2 - 0.55 + c - 0.2, c / 2 - 0.15, d / 2 - 0.55 + c - 0.2) + rect(-w / 2, -d / 2, w, d, WF)
  },
  washer(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    const r = Math.min(w, d) * 0.34
    return rect(x0, y0, w, d) + line(x0, y0 + 0.35, w / 2, y0 + 0.35) + circ(0, 0.15, r) + text(0, 0.15, 'W/D', Math.min(0.45, r * 0.8))
  },
  dresser(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    let s = rect(x0, y0, w, d, WF)
    for (let k = 1; k < 3; k++) s += line(x0 + (w * k) / 3, y0, x0 + (w * k) / 3, d / 2)
    return s + line(x0, d / 2 - 0.25, w / 2, d / 2 - 0.25)
  },
  stair: (w, d) => stairSym(w, d, false),
  stairdn: (w, d) => stairSym(w, d, true),
  spiral: (w, d) => spiralSym(w, d, false),
  spiraldn: (w, d) => spiralSym(w, d, true),
  stove(w, d) {
    const x0 = -w / 2
    const y0 = -d / 2
    const sw = Math.min(w, d) * 0.62
    const sy = y0 + Math.min(0.35, d * 0.12)
    return (
      rect(x0, y0, w, d) +
      rect(x0 + 0.12, y0 + 0.12, w - 0.24, d - 0.24, DASH) +
      rect(-sw / 2, sy, sw, sw, rx(0.08) + WF) +
      line(-sw / 2 + 0.15, sy + sw - 0.18, sw / 2 - 0.15, sy + sw - 0.18) +
      circ(0, sy + sw * 0.32, Math.min(0.28, sw * 0.18))
    )
  },
}

/** The plan symbol of a piece, or a crossed box for an unknown type. */
export function symbol(type: string, w: number, d: number): string {
  const t = FURNITURE[type]
  const W = w > 0 ? w : (t?.w ?? 2)
  const D = d > 0 ? d : (t?.d ?? 2)
  const f = SYM[type]
  if (f) return f(W, D)
  return rect(-W / 2, -D / 2, W, D) + line(-W / 2, -D / 2, W / 2, D / 2) + line(W / 2, -D / 2, -W / 2, D / 2)
}

const normRot = (r: number): number => {
  let v = (((r || 0) % 360) + 360) % 360
  v = +v.toFixed(6)
  return v >= 360 ? 0 : v
}

/** A new piece of `type` centred at x, z at its catalogue size. */
export function makeFurniture(type: string, x: number, z: number, rot = 0): FurnitureBase {
  const t = FURNITURE[type]
  return { type, x: x || 0, z: z || 0, rot: normRot(rot), w: t?.w ?? 2, d: t?.d ?? 2, mirror: false }
}

/** A piece's corners (−,−), (+,−), (+,+), (−,+) in building feet. */
export function furnitureCorners(item: Pick<Furniture, 'x' | 'z' | 'rot' | 'w' | 'd'>): Pt[] {
  const r = ((item.rot || 0) * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const w = item.w / 2
  const d = item.d / 2
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]): Pt => [item.x + u * c - v * s, item.z + u * s + v * c])
}

/** The rotation that turns a piece's front (+v) toward the inward normal of a wall. */
const rotFacing = (nin: Pt) => normRot((Math.atan2(-nin[0], nin[1]) * 180) / Math.PI)

export interface WallEdge {
  readonly a: Pt
  readonly dir: Pt
  readonly nin: Pt
  readonly len: number
  readonly exterior: boolean
}

export interface SnapRoom {
  readonly pts: readonly Pt[]
  readonly edges: readonly WallEdge[]
}

/** Back a piece onto the nearest wall within `tol` feet of where its back would be, facing into the room (old snapToWall). */
export function snapToWall(item: Pick<Furniture, 'x' | 'z' | 'rot' | 'w' | 'd'>, rooms: readonly SnapRoom[], tol = 2): { x: number; z: number; rot: number } {
  const own = { x: item.x, z: item.z, rot: item.rot }
  const inside = rooms.filter((I) => G.pointInPoly(I.pts, item.x, item.z))
  const hd = item.d / 2
  const hw = item.w / 2
  let best: { e: WallEdge; off: number } | null = null
  for (const I of inside.length ? inside : rooms)
    for (const e of I.edges) {
      if (!(e.len > 1e-6)) continue
      const t = Math.max(0, Math.min(e.len, (item.x - e.a[0]) * e.dir[0] + (item.z - e.a[1]) * e.dir[1]))
      const q: Pt = [e.a[0] + e.dir[0] * t, e.a[1] + e.dir[1] * t]
      const off = Math.abs(Math.hypot(item.x - q[0], item.z - q[1]) - hd)
      if (off <= tol && (!best || off < best.off)) best = { e, off }
    }
  if (!best) return own
  const e = best.e
  let s = (item.x - e.a[0]) * e.dir[0] + (item.z - e.a[1]) * e.dir[1]
  s = e.len < 2 * hw ? e.len / 2 : Math.max(hw, Math.min(e.len - hw, s))
  const k = hd + (e.exterior ? WALL.ext : WALL.int / 2)
  return { x: e.a[0] + e.dir[0] * s + e.nin[0] * k, z: e.a[1] + e.dir[1] * s + e.nin[1] * k, rot: rotFacing(e.nin) }
}
