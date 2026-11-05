import type { LocalPoint } from '../../../buildings/footprint'
import { formatArch, formatInches, formatLevel } from '../format'
import type { SheetTable } from './table'
import type { SheetBuilding, SheetSupport } from '../types'

/**
 * The Supports table: what each part stands on, as the plan draws it (its
 * kind, section, how many, how far apart and how far down to the ground),
 * every height above the main floor.
 */

const NONE = '—'
const IN_PER_FT = 12
const range = (vs: readonly number[], show: (v: number) => string) => {
  if (!vs.length) return NONE
  const lo = show(Math.min(...vs))
  const hi = show(Math.max(...vs))
  return lo === hi ? lo : `${lo} to ${hi}`
}

/** Centre to centre to each post's nearest neighbour, feet. */
export function postSpacings(at: readonly LocalPoint[]): number[] {
  if (at.length < 2) return []
  return at.map((p, i) => Math.min(...at.flatMap((q, j) => (i === j ? [] : [Math.hypot(q[0] - p[0], q[1] - p[1])]))))
}

const KIND: Readonly<Record<SheetSupport['kind'], string>> = {
  posts: 'posts on beams',
  piers: 'concrete piers on beams',
  pilings: 'pilings on beams',
  mast: 'mast',
  stilts: 'stilts',
  skirt: 'concrete skirt',
  slab: 'slab on grade',
  earth: 'earth bench',
  'deck posts': 'deck posts and rim beam',
  'porch posts': 'porch posts',
}

function sizeOf(s: SheetSupport): string {
  if (s.section) return `${formatInches(s.section.sizeFt * IN_PER_FT)} ${s.section.round ? 'round' : 'square'}`
  if (s.mast) return `core ${formatArch(s.mast.footDiameterFt)} dia., head ${formatArch(s.mast.headDiameterFt)}`
  if (s.footingDiameterFt !== null) return `footings ${formatArch(s.footingDiameterFt)} dia.`
  return NONE
}

function countOf(s: SheetSupport): string {
  if (s.mast) return `1 core, ${s.struts.length} struts`
  if (s.struts.length) return String(s.struts.length)
  return s.posts.length ? String(s.posts.length) : NONE
}

/** Top of each post, pile or stilt down to the ground (or the floor it stands on); a skirt's depth from the floor to its bottom. */
function heightOf(s: SheetSupport): string {
  if (s.posts.length) return range(s.posts.map((p) => p.topFt - p.footFt), formatArch)
  if (s.struts.length && !s.mast) return range(s.struts.map((t) => t.aFt - t.bFt), formatArch)
  if (s.mast) return formatArch(-s.mast.bottomFt)
  return NONE
}

function beamsOf(s: SheetSupport): string {
  if (!s.beam || !s.beams.length) return NONE
  const size = s.beam.widthFt === null ? `${formatInches(s.beam.depthFt * IN_PER_FT)} deep` : `${formatInches(s.beam.widthFt * IN_PER_FT)} × ${formatInches(s.beam.depthFt * IN_PER_FT)}`
  return s.kind === 'deck posts' ? `rim, ${size}` : `${s.beams.length}, ${size}`
}

function notesOf(s: SheetSupport, embed: string): string {
  const notes: string[] = []
  if (s.posts.some((p) => p.onGround) || (s.struts.length && !s.mast)) notes.push(`${embed} into the ground`)
  if (s.kind === 'porch posts') {
    notes.push('carry the porch roof beam')
    const onFloor = s.posts.filter((p) => !p.onGround).length
    if (onFloor) notes.push(onFloor === s.posts.length ? 'stand on the floor' : `${onFloor} stand on the floor`)
  }
  if (s.bracedBays) notes.push(`X-braced, ${s.bracedBays} bays`)
  if (s.mast) notes.push(`collar ${formatLevel(s.mast.collarFt)}, core bottom ${formatLevel(s.mast.bottomFt)}`)
  if (s.skirt) notes.push(`bottom ${formatLevel(s.skirt.bottomFt)}${s.skirt.apron ? ', apron round the slab' : ''}`)
  if ((s.kind === 'skirt' || s.kind === 'slab') && !s.skirt) notes.push('none: the floor is at or below the ground')
  if (s.plate) notes.push('plate under the floor')
  return notes.length ? notes.join('; ') : NONE
}

/** What each part stands on; printed when the building has supports. */
export function supportsTable(b: SheetBuilding): SheetTable[] {
  if (!b.supports.length) return []
  return [
    {
      title: 'Supports',
      note: 'As the 3D model builds them, drawn under the floor on the plan: posts and piles at their size, beams dashed, a mast core and its struts, stilts to their footings. Spacing: centre to centre to the nearest neighbour. Height: from the top of each post (under the beam or floor it carries) down to the ground at it; a mast core is given from the floor to its bottom.',
      columns: ['Part', 'Supports', 'Size', 'Count', 'Spacing', 'Height to ground', 'Beams', 'Notes'],
      rows: b.supports.map((s) => [
        s.part,
        KIND[s.kind],
        sizeOf(s),
        countOf(s),
        range(postSpacings(s.posts.map((p) => p.at)), formatArch),
        heightOf(s),
        beamsOf(s),
        notesOf(s, formatInches(s.embedFt * IN_PER_FT)),
      ]),
    },
  ]
}
