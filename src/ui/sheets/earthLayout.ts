/**
 * Where a floor plan's earthworks marks and their labels go: retaining
 * walls as a double line with their tag, length and top and bottom spot
 * heights, each berm's crest and the slope down to its toe, sunken courts,
 * and the limits of fill and cut. Pure, in building-frame feet.
 */
import { signedArea } from '../../buildings/footprint'
import { formatArch, formatLevel } from '../../export/sheets/format'
import type { SheetBuilding, SheetEarthworks } from '../../export/sheets/types'
import { outwardNormal, textWidthFt, uprightAngle, type Pt } from './svgDims'

/** A berm's label sits this share of the way down its slope from the crest. */
const BERM_LABEL_DOWN = 0.5
/** Down a berm whose toe was not found, its label stands this far past the crest, feet. */
const BERM_LABEL_FALLBACK_FT = 3

/** A wall's label goes along its straightest stretch of this many points either side. */
const TANGENT_SPAN = 3

/** A label written along a line: centred on `at`, turned to read upright, one or more lines. */
export interface EarthLabel {
  readonly at: Pt
  readonly angleDeg: number
  readonly lines: readonly string[]
  /** Text size: `text` for a tag and its length, `small` for spot heights. */
  readonly size: 'text' | 'small'
}

export interface EarthPlan {
  /** Each retaining wall as one closed band: its face, then its back reversed. */
  readonly walls: readonly (readonly Pt[])[]
  readonly labels: readonly EarthLabel[]
  /** Everything drawn and written, for the drawing's extent. */
  readonly points: readonly Pt[]
}

type Sizes = { readonly text: number; readonly small: number }

const angleOf = (a: Pt, b: Pt) => uprightAngle((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI)
const unit = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
}

/** The point halfway along a polyline, and the index of the segment it is on. */
function halfway(line: readonly Pt[]): { at: Pt; i: number } {
  const lens = line.slice(1).map((b, i) => Math.hypot(b[0] - line[i][0], b[1] - line[i][1]))
  let left = lens.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const t = lens[i] > 0 ? Math.min(1, left / lens[i]) : 0
      return { at: [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t], i }
    }
    left -= lens[i]
  }
  return { at: line[0], i: 0 }
}

/**
 * The middle of a wall's straightest stretch, where its label lies clear of
 * its corners: the point on it whose neighbours TANGENT_SPAN either side are
 * furthest apart, and those two ends, for the label's direction.
 */
function straightest(line: readonly Pt[]): { at: Pt; i: number; a: Pt; b: Pt } {
  const end = line.length - 1
  const span = (i: number) => [line[Math.max(0, i - TANGENT_SPAN)], line[Math.min(end, i + TANGENT_SPAN)]] as const
  let best = Math.min(end, Math.floor(line.length / 2))
  line.forEach((_, i) => {
    const [p, q] = span(i)
    const [bp, bq] = span(best)
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > Math.hypot(bq[0] - bp[0], bq[1] - bp[1]) + 1e-9) best = i
  })
  const [a, b] = span(best)
  return { at: line[best], i: best, a, b }
}

/** A label's four corners, roughly, for the extent. */
function labelCorners(l: EarthLabel, sizes: Sizes): Pt[] {
  const size = sizes[l.size]
  const w = Math.max(...l.lines.map((s) => textWidthFt(s, size))) / 2
  const h = (size * 1.2 * l.lines.length) / 2 + size * 0.5
  const a = (l.angleDeg * Math.PI) / 180
  const u: Pt = [Math.cos(a), Math.sin(a)]
  const v: Pt = [-u[1], u[0]]
  return [-1, 1].flatMap((su) => [-1, 1].map((sv): Pt => [l.at[0] + u[0] * w * su + v[0] * h * sv, l.at[1] + u[1] * w * su + v[1] * h * sv]))
}

function wallLabels(e: SheetEarthworks, sizes: Sizes): EarthLabel[] {
  return e.walls.flatMap((w) => {
    if (w.face.length < 2) return []
    const { at, i, a, b } = straightest(w.face)
    const out = unit(w.face[i], w.back[i])
    const off = w.thicknessFt + sizes.text * 2
    const spot = (k: number, top: number): EarthLabel => {
      // past the wall's end, off along it
      const along = unit(w.face[k === 0 ? 1 : k - 1], w.face[k])
      const text = `TW ${formatLevel(top)} BW ${formatLevel(w.bottomFt)}`
      const reach = textWidthFt(text, sizes.small) / 2 + sizes.small
      return {
        at: [w.face[k][0] + along[0] * reach + out[0] * w.thicknessFt * 0.5, w.face[k][1] + along[1] * reach + out[1] * w.thicknessFt * 0.5],
        angleDeg: angleOf(w.face[Math.max(0, k - 1)], w.face[Math.max(1, k)]),
        lines: [text],
        size: 'small',
      }
    }
    return [
      { at: [at[0] + out[0] * off, at[1] + out[1] * off], angleDeg: angleOf(a, b), lines: [`${w.tag} ${w.material} retaining wall ${formatArch(w.lengthFt)}`], size: 'text' },
      spot(0, w.topStartFt),
      spot(w.face.length - 1, w.topEndFt),
    ]
  })
}

function bermLabels(b: SheetBuilding, e: SheetEarthworks): EarthLabel[] {
  const area = signedArea(b.parts[0]?.outline ?? [])
  return e.berms.map((m) => {
    const { at, i } = halfway(m.line)
    const n = outwardNormal(area, m.line[i], m.line[i + 1])
    const toe = m.toeOutFt ? m.toeOutFt.min : m.crestWidthFt + BERM_LABEL_FALLBACK_FT / BERM_LABEL_DOWN
    const d = m.crestWidthFt + (toe - m.crestWidthFt) * BERM_LABEL_DOWN
    return {
      at: [at[0] + n[0] * d, at[1] + n[1] * d],
      angleDeg: angleOf(m.line[i], m.line[i + 1]),
      lines: [`BERM, crest ${formatLevel(m.crestFt)}`, `${+m.slope.toFixed(2)}:1 down to the toe`],
      size: 'text',
    }
  })
}

function courtLabels(e: SheetEarthworks): EarthLabel[] {
  return e.courts.map((c) => {
    const n = c.outline.length || 1
    const at: Pt = [c.outline.reduce((s, p) => s + p[0], 0) / n, c.outline.reduce((s, p) => s + p[1], 0) / n]
    return { at, angleDeg: angleOf(c.outline[0], c.outline[1]), lines: ['SUNKEN COURT', `floor ${formatLevel(c.floorFt)}`], size: 'small' }
  })
}

/** The earthworks marks of a building's plan, or null when it has none to draw. */
export function earthPlan(b: SheetBuilding, sizes: Sizes): EarthPlan | null {
  const e = b.earthworks
  if (!e || (!e.walls.length && !e.berms.length && !e.courts.length && !e.fillLimit.length && !e.cutLimit.length)) return null
  const labels = [...wallLabels(e, sizes), ...bermLabels(b, e), ...courtLabels(e)]
  const walls = e.walls.map((w) => [...w.face, ...[...w.back].reverse()])
  const points = [...walls.flat(), ...e.berms.flatMap((m) => m.crest), ...e.courts.flatMap((c) => c.outline), ...e.fillLimit.flat(), ...e.cutLimit.flat(), ...labels.flatMap((l) => labelCorners(l, sizes))]
  return { walls, labels, points }
}

/** The plan's notes on its earthworks, for the general notes under it; none when it has none. */
export function earthNotes(b: SheetBuilding): string[] {
  const e = b.earthworks
  if (!e) return []
  const navd = formatArch(b.levels.floorNavdFt)
  const lines = [`Earthworks: spot heights are above the main floor (NAVD88 ${navd}).`]
  if (e.walls.length) lines.push('RW: retaining wall, its face on the cut side; TW top of wall, BW bottom at the cut floor.')
  if (e.berms.length) lines.push("Berm: its crest's outer edge drawn solid.")
  if (e.fillLimit.length) lines.push('Dashed: the toe of the fill, where it meets the surveyed ground.')
  if (e.cutLimit.length) lines.push('Dash-dot: the top of the cut, where it leaves the surveyed ground.')
  return lines
}
