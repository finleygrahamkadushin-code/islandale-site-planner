/**
 * Every word on the site plan's drawing, placed in order of importance so
 * nothing overprints: building names and floor levels, the clearance
 * dimensions, the shoreline, bank, buffer and setback lines, the lot line
 * lengths, the names of pads and ponds, then the contour figures wherever
 * they still fit. Sheet feet, on the turned model. Pure.
 */
import { formatArch } from '../format'
import { ftIn } from '../../../site/rules/clearances'
import { M_PER_FT } from '../../../site/units'
import type { Extent } from '../Page'
import { uprightAngle, type Pt } from '../svgDims'
import { insidePoly } from './siteGeom'
import { distToLine } from './siteHatch'
import { LabelPlacer, labelBox, labelsAlong, labelWidth, type PlacedLabel } from './siteLabels'
import type { SitePens } from './siteLayout'
import type { SiteSheetModel } from './siteModel'

export interface ClearanceDim {
  readonly id: string
  readonly kind: 'shore' | 'lot'
  readonly from: Pt
  readonly to: Pt
  readonly label: PlacedLabel | null
  readonly warn: boolean
}

export interface SiteAnnotations {
  readonly buildings: readonly { readonly id: string; readonly names: readonly PlacedLabel[]; readonly level: PlacedLabel | null }[]
  readonly clearances: readonly ClearanceDim[]
  /** Labels along the shore, bank, buffer, setback and tree-zone lines, and the lot line lengths. */
  readonly lines: readonly PlacedLabel[]
  /** Names of pads, ponds, pools, meadows and trees, where they fit. */
  readonly things: readonly PlacedLabel[]
  readonly contours: readonly PlacedLabel[]
}

/** Contour figures are tried this far apart along an index line, printed inches. */
const CONTOUR_EVERY_IN = 3.2
const LINE_EVERY_IN = 4.5

const upper = (s: string) => s.toUpperCase()
const angleOf = (a: Pt, b: Pt) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** A building's floor level as the elevations write it: FF 23'-4" NAVD88. */
export const floorText = (navdFt: number) => `FF ${formatArch(navdFt)} NAVD88`

/** The obstacles labels keep off: roofs, building parts, bridge decks, pads and paths, ponds and pools. */
export function obstaclesOf(m: SiteSheetModel): (readonly Pt[])[] {
  return [
    ...m.buildings.flatMap((b) => [...b.roofs.map((r) => r.eave), ...b.parts.map((p) => p.outline)]),
    ...m.bridges.map((b) => [...b.left, ...[...b.right].reverse()]),
    ...m.paths.map((p) => [...p.outline]),
    ...m.things.filter((t) => t.kind !== 'meadow').map((t) => t.outline),
    ...m.trees.map((t) => {
      const r = t.radiusFt * 0.12
      return [
        [t.at[0] - r, t.at[1] - r],
        [t.at[0] + r, t.at[1] - r],
        [t.at[0] + r, t.at[1] + r],
        [t.at[0] - r, t.at[1] + r],
      ] as Pt[]
    }),
  ]
}

/** The long axis of a polygon, degrees upright, from its widest pair of points. */
function longAxisDeg(poly: readonly Pt[]): number {
  let best = 0
  let deg = 0
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const d = Math.hypot(poly[j][0] - poly[i][0], poly[j][1] - poly[i][1])
      if (d > best) {
        best = d
        deg = angleOf(poly[i], poly[j])
      }
    }
  }
  return uprightAngle(deg)
}

/** How far a line through `p` along unit `u` runs inside a polygon, both ways from p. */
function spanThrough(poly: readonly Pt[], p: Pt, u: Pt): number {
  const hits: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const den = u[0] * ey - u[1] * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den
    const k = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den
    if (k >= 0 && k <= 1) hits.push(t)
  }
  const fwd = Math.min(...hits.filter((t) => t > 0), Infinity)
  const back = Math.max(...hits.filter((t) => t < 0), -Infinity)
  return Number.isFinite(fwd) && Number.isFinite(back) ? fwd - back : 0
}

/** Words split into two lines as even as can be. */
function splitBalanced(words: readonly string[]): string[] {
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

/** Whether a segment crosses a polygon's edge or runs inside it. */
function crossesPoly(a: Pt, b: Pt, poly: readonly Pt[]): boolean {
  if (insidePoly(poly, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return true
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true
  }
  return false
}

/** Upright angles worth trying for words inside a shape: level, its long axis and across it, and along each of its longer edges. */
function candidateAngles(poly: readonly Pt[]): number[] {
  const long = longAxisDeg(poly)
  const edges = poly
    .map((p, i) => [p, poly[(i + 1) % poly.length]] as const)
    .filter(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 3)
    .map(([p, q]) => uprightAngle(angleOf(p, q)))
  const all = [0, long, uprightAngle(long + 90), ...edges]
  return all.filter((a, i) => all.findIndex((b) => Math.abs(uprightAngle(a - b)) < 2) === i)
}

/** Prefer level words: a turned label must be this much larger, per degree, to win. */
const LEVEL_BIAS = 0.0025

/** One line of words inside a shape: the angle and size that fit it best (largest, level when close), or null below `min`. */
function bestInside(poly: readonly Pt[], at: Pt, text: string, max: number, min: number, bold = false): PlacedLabel | null {
  let best: PlacedLabel | null = null
  let bestScore = -Infinity
  for (const deg of candidateAngles(poly)) {
    const a = (deg * Math.PI) / 180
    const room = spanThrough(poly, at, [Math.cos(a), Math.sin(a)]) * 0.86
    const height = spanThrough(poly, at, [Math.sin(a), -Math.cos(a)]) * 0.8
    const size = Math.min(max, room / labelWidth(text, 1, bold), height / 1.3)
    const score = size * (1 - LEVEL_BIAS * Math.abs(deg))
    if (size >= min && score > bestScore) {
      bestScore = score
      best = { text, at, angleDeg: deg, size, bold }
    }
  }
  return best
}

/**
 * A building's name (one line, or two when that reads larger) and its floor
 * level under it, inside its walls: every candidate angle tried, the name
 * sized to the walls' span along it and the block to their depth across it,
 * the largest kept (level when it's close). The level is the last label.
 */
function nameSet(outline: readonly Pt[], at: Pt, name: string, level: string, pens: SitePens): { labels: PlacedLabel[] } | null {
  let best: { labels: PlacedLabel[]; score: number } | null = null
  const words = name.split(' ')
  const layouts = words.length > 1 ? [[name], splitBalanced(words)] : [[name]]
  for (const deg of candidateAngles(outline)) {
    const a = (deg * Math.PI) / 180
    const u: Pt = [Math.cos(a), Math.sin(a)]
    const n: Pt = [Math.sin(a), -Math.cos(a)]
    const room = spanThrough(outline, at, u) * 0.84
    const depth = spanThrough(outline, at, n) * 0.84
    for (const lines of layouts) {
      let size = Math.min(pens.name, ...lines.map((l) => room / labelWidth(l, 1, true)))
      let levelSize = Math.min(pens.small, room / labelWidth(level, 1))
      const lead = 1.1
      const tall = lines.length * size * lead + levelSize * 1.15
      if (tall > depth) {
        const k = depth / tall
        size *= k
        levelSize *= k
      }
      if (size < pens.small * 0.7) continue
      // two lines must read clearly larger to beat one
      const score = size * (1 - LEVEL_BIAS * Math.abs(deg)) * (lines.length > 1 ? 0.88 : 1)
      if (best && score <= best.score) continue
      const step = size * lead
      const total = lines.length * step + levelSize * 1.15
      const top = -total / 2 + step / 2
      const pos = (k: number): Pt => [at[0] - n[0] * (top + k), at[1] - n[1] * (top + k)]
      const labels: PlacedLabel[] = [
        ...lines.map((text, i): PlacedLabel => ({ text, at: pos(i * step), angleDeg: deg, size, bold: true })),
        { text: level, at: pos(lines.length * step - step / 2 + levelSize * 0.7), angleDeg: deg, size: levelSize },
      ]
      best = { labels, score }
    }
  }
  return best && { labels: best.labels }
}

const centroidOf = (poly: readonly Pt[]): Pt => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]

export function siteAnnotate(m: SiteSheetModel, pens: SitePens, extent: Extent, scale: number): SiteAnnotations {
  const placer = new LabelPlacer(obstaclesOf(m), pens.small * 0.25)
  const inset = pens.small
  const keepIn = ([x, y]: Pt) => x > extent.x + inset && x < extent.x + extent.w - inset && y > extent.y + inset && y < extent.y + extent.h - inset
  const inch = 1 / scale

  // building names and floor levels: inside the walls, along their long side, sized (or wrapped) to fit; forced, since they are what the sheet is about
  const buildings = m.buildings.map((b) => {
    const walls = b.parts.find((p) => p.kind === 'wall')
    if (!walls) {
      // a standalone deck: its name alone, only when it fits at a legible size (a cluster of small decks would crowd itself)
      const deck = b.parts[0]
      const one = deck ? bestInside(deck.outline, b.label, upper(b.name), pens.small, pens.small * 0.75, true) : null
      if (!one || !placer.fits(one, deck.outline)) return { id: b.id, names: [], level: null }
      placer.take(one)
      return { id: b.id, names: [one], level: null }
    }
    const main = walls
    const set = nameSet(main.outline, b.label, upper(b.name), floorText(b.floorNavdFt), pens)
    const labels = set?.labels ?? [{ text: upper(b.name), at: b.label, angleDeg: 0, size: pens.small, bold: true }]
    for (const l of labels) placer.take(l)
    return { id: b.id, names: labels.slice(0, -1).length ? labels.slice(0, -1) : labels, level: set ? labels[labels.length - 1] : null }
  })

  // the clearance dimensions, each with its figure along it
  const clearances: ClearanceDim[] = m.clearances.flatMap((c) => {
    const dims: ClearanceDim[] = []
    const others = m.buildings.filter((o) => o.id !== c.id).flatMap((o) => [...o.roofs.map((r) => r.eave), ...o.parts.map((p) => p.outline)])
    const one = (kind: 'shore' | 'lot', from: Pt, to: Pt, text: string, warn: boolean) => {
      // a dimension run across another building can't be read: its figure stays in the notes' Clearances
      if (others.some((poly) => crossesPoly(from, to, poly))) return
      const angleDeg = uprightAngle(angleOf(from, to))
      const a = (angleDeg * Math.PI) / 180
      const n: Pt = [Math.sin(a), -Math.cos(a)]
      const off = pens.label * 0.75
      const cands: PlacedLabel[] = [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((t) => {
        const at: Pt = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
        return [1, -1].map((k): PlacedLabel => ({ text, at: [at[0] + n[0] * off * k, at[1] + n[1] * off * k], angleDeg, size: pens.label }))
      })
      // a short dimension's figure can also sit just beyond either end, in line with it
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
      const u: Pt = [(to[0] - from[0]) / len, (to[1] - from[1]) / len]
      const reach = labelWidth(text, pens.label) / 2 + pens.label * 0.8
      const ends: PlacedLabel[] = [
        { text, at: [to[0] + u[0] * reach, to[1] + u[1] * reach], angleDeg, size: pens.label },
        { text, at: [from[0] - u[0] * reach, from[1] - u[1] * reach], angleDeg, size: pens.label },
      ]
      // or square across it, beside its middle, in the small size
      const mid0 = mid(from, to)
      const across = uprightAngle(angleDeg + 90)
      const side = labelWidth(text, pens.small) / 2 + pens.small * 0.6
      const ac = (across * Math.PI) / 180
      const beside: PlacedLabel[] = [1, -1].map((k) => ({ text, at: [mid0[0] + Math.cos(ac) * side * k, mid0[1] + Math.sin(ac) * side * k], angleDeg: across, size: pens.small }))
      const label = placer.place([...cands, ...ends, ...beside].filter((l) => labelBox(l, 0).every(keepIn)))
      // a dimension with nowhere to put its figure is left off; the figure is in the notes
      if (label) dims.push({ id: c.id, kind, from, to, label, warn })
    }
    // in the inspector's own words and rounding (ftIn), so the drawing and the notes read the same figure
    const ft = (v: number) => ftIn(v * M_PER_FT)
    if (c.shore) one('shore', c.shore.from, c.shore.to, c.shore.banked && m.setbacks.bankFt > 0 ? `${ft(c.shore.dFt)} TO SHORE · ${ft(c.shore.pastFt)} PAST BANK` : `${ft(c.shore.dFt)} TO SHORE`, c.shore.inside)
    // a building across the lot line has no distance to it: the inspector says so in words, and so do the notes
    if (c.lot && !c.lot.crosses) one('lot', c.lot.from, c.lot.to, `${ft(c.lot.dFt)} TO LOT LINE`, c.lot.inside)
    return dims
  })

  const lines: PlacedLabel[] = []
  const along = (ls: readonly (readonly Pt[])[], text: string, offset: number, every: number, max?: number) =>
    ls.forEach((l) => lines.push(...labelsAlong(l, text, placer, { size: pens.label, every, offset, keepIn, max })))
  const s = m.setbacks
  along([m.shoreline], 'LOT LINE AT WATER', -pens.label * 0.9, LINE_EVERY_IN * inch, 3)
  along(m.topOfBank, 'TOP OF BANK', -pens.label * 0.95, LINE_EVERY_IN * 1.3 * inch, 2)
  along(m.buffer, `SHORELINE BUFFER · ${s.shoreFt} FT`, pens.label * 0.9, LINE_EVERY_IN * 1.3 * inch, 2)
  along(m.sideLine, `${s.sideFt} FT SIDE SETBACK`, -pens.label * 0.9, LINE_EVERY_IN * inch, 2)
  for (const z of m.treeZones) along(z.lines, `TREE ZONE ${z.ft === m.treeZones[0]?.ft ? 1 : 2} · ${z.ft} FT`, pens.label * 0.8, LINE_EVERY_IN * 1.6 * inch, 1)

  // each side and rear lot line's length, outside the lot
  for (const l of m.lotLines) {
    if (l.lengthFt < 12) continue
    const text = formatArch(l.lengthFt)
    const angleDeg = uprightAngle(angleOf(l.a, l.b))
    const at = mid(l.a, l.b)
    const a = (angleDeg * Math.PI) / 180
    const n: Pt = [Math.sin(a), -Math.cos(a)]
    const off = pens.label * 0.95
    const outward = insidePoly(m.ring, [at[0] + n[0] * off, at[1] + n[1] * off]) ? -1 : 1
    const placed = placer.place([{ text, at: [at[0] + n[0] * off * outward, at[1] + n[1] * off * outward], angleDeg, size: pens.label }])
    if (placed) lines.push(placed)
  }

  // names of pads, ponds and pools inside them when they fit; trees beside their trunks
  const things: PlacedLabel[] = []
  for (const t of m.things) {
    if (t.kind === 'boulder' || t.kind === 'other' || t.outline.length < 3) continue
    const text = upper(t.name)
    // inside its own shape, at the angle that gives the largest legible size, clear of the other words
    const inside = bestInside(t.outline, centroidOf(t.outline), text, pens.small, pens.small * 0.8)
    if (inside && labelBox(inside, 0).every((p) => insidePoly(t.outline, p)) && placer.fits(inside, t.outline)) {
      placer.take(inside)
      things.push(inside)
      continue
    }
    // just outside the shape instead, level, on whichever side is clear
    const box = t.outline.reduce((acc, [x, y]) => ({ minx: Math.min(acc.minx, x), maxx: Math.max(acc.maxx, x), miny: Math.min(acc.miny, y), maxy: Math.max(acc.maxy, y) }), { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity })
    const c0 = centroidOf(t.outline)
    const w = labelWidth(text, pens.small) / 2
    const g = pens.small * 0.9
    const outside: PlacedLabel[] = [
      { text, at: [c0[0], box.maxy + g], angleDeg: 0, size: pens.small },
      { text, at: [c0[0], box.miny - g], angleDeg: 0, size: pens.small },
      { text, at: [box.maxx + g + w, c0[1]], angleDeg: 0, size: pens.small },
      { text, at: [box.minx - g - w, c0[1]], angleDeg: 0, size: pens.small },
    ]
    const placed = placer.place(outside.filter((l) => labelBox(l, 0).every(keepIn)))
    if (placed) things.push(placed)
  }
  for (const t of m.trees) {
    const text = upper(t.name)
    const r = t.radiusFt * 0.3
    const cands: PlacedLabel[] = [0, 180, 90, -90].map((deg) => {
      const a = (deg * Math.PI) / 180
      const w = labelWidth(text, pens.small) / 2
      return { text, at: [t.at[0] + Math.cos(a) * (r + w), t.at[1] + Math.sin(a) * (r + pens.small)], angleDeg: 0, size: pens.small }
    })
    const placed = placer.place(cands.filter((c) => labelBox(c, 0).every(keepIn)))
    if (placed) things.push(placed)
  }

  // contour figures on the index lines, then on a few minor lines where the index lines are far apart
  const contours: PlacedLabel[] = []
  for (const c of m.contours.filter((k) => k.index)) {
    for (const l of c.lines) contours.push(...labelsAlong(l, `${Math.round(c.ft)}`, placer, { size: pens.contour, every: CONTOUR_EVERY_IN * inch, keepIn, maxSag: 0.3 }))
  }
  return { buildings, clearances, lines, things, contours }
}

/** How far the shore is from a point, for pointing bank ticks downhill. */
export const shoreDistance = (m: SiteSheetModel) => (p: Pt) => distToLine(p, m.shoreline)
