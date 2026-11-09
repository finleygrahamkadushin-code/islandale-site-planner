/**
 * The site plan drawn as SVG, in sheet feet, from the turned model and its
 * placed annotations. Black on white for photocopying, with a clear order
 * of value: the ground and its rules (water lines, hatched bands, contours)
 * recede in fine grey, the roofs read white with crisp eaves against their
 * shadows, and the property, shoreline and setback lines sit on top.
 */
import type { ReactNode } from 'react'
import { arrowHead, type Pt } from '../svgDims'
import type { Seg4 } from './siteGeom'
import { isClosed, linePath, polyPath, smoothPath } from './siteGeom'
import { LABEL_TRACKING_EM, type PlacedLabel } from './siteLabels'
import type { SitePens } from './siteLayout'
import type { SiteSheetModel } from './siteModel'
import type { SiteAnnotations } from './siteAnnotate'
import type { SitePartMark, SiteRoofMark } from './siteObjects'

/** The greys, darkest to lightest. */
export const INK = { line: '#111', mid: '#555', soft: '#7a7a7a', faint: '#9c9c9c', hatch: '#a9a9a9', hatchLight: '#c2c2c2', shadow: '#d5d5d5', deck: '#f1f1ef', stone: '#e6e5e1', wall: '#7d7d7d' } as const

export interface SiteTextures {
  readonly shoreHatch: readonly Seg4[]
  readonly sideHatch: readonly Seg4[]
  readonly water: readonly (readonly Pt[])[]
  readonly bankTicks: readonly Seg4[]
  /** Gravel stipple dots, sheet feet. */
  readonly gravel: readonly Pt[]
  /** Grass tufts on meadows and sod roofs: where each stands. */
  readonly tufts: readonly Pt[]
  readonly sodTufts: readonly Pt[]
  /** Water in ponds and pools: short rows of dashes. */
  readonly water2: readonly Seg4[]
  /** Roof finishes under the roof linework: a glass roof's grid, a metal roof's seams. */
  readonly roofHatch: readonly Seg4[]
}

/** A grass tuft: three short strokes fanning up from a point, `size` tall (the old site plan's tuft). */
const tuft = ([x, y]: Pt, size: number) =>
  `M${(x - size * 0.5).toFixed(2)} ${y.toFixed(2)}l${(size * 0.22).toFixed(2)} ${(-size * 0.75).toFixed(2)}M${x.toFixed(2)} ${(y + size * 0.05).toFixed(2)}v${(-size).toFixed(2)}M${(x + size * 0.5).toFixed(2)} ${y.toFixed(2)}l${(-size * 0.22).toFixed(2)} ${(-size * 0.75).toFixed(2)}`

const segsPath = (segs: readonly Seg4[]) => segs.map(([x1, y1, x2, y2]) => `M${x1.toFixed(3)} ${y1.toFixed(3)}L${x2.toFixed(3)} ${y2.toFixed(3)}`).join('')
const pts = (poly: readonly Pt[]) => poly.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')
const dash = (...ft: number[]) => ft.map((v) => v.toFixed(3)).join(' ')

/** Text with a white halo, so it reads over linework without a box. */
export function Label({ l, pens, weight = 400, fill = INK.line, italic }: { readonly l: PlacedLabel; readonly pens: SitePens; readonly weight?: number; readonly fill?: string; readonly italic?: boolean }) {
  return (
    <text
      x={l.at[0]}
      y={l.at[1]}
      transform={`rotate(${l.angleDeg.toFixed(2)} ${l.at[0].toFixed(3)} ${l.at[1].toFixed(3)})`}
      fontSize={l.size}
      fontWeight={weight}
      fontStyle={italic ? 'italic' : undefined}
      letterSpacing={`${LABEL_TRACKING_EM}em`}
      textAnchor="middle"
      dominantBaseline="central"
      fill={fill}
      stroke="#fff"
      strokeWidth={pens.halo}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {l.text}
    </text>
  )
}

function Ground({ m, t, pens }: { readonly m: SiteSheetModel; readonly t: SiteTextures; readonly pens: SitePens }) {
  return (
    <g aria-hidden="true" fill="none">
      <g stroke={INK.faint} strokeWidth={pens.hair}>
        {t.water.map((l, i) => (
          <path key={i} d={smoothPath(l)} strokeDasharray={i % 3 === 2 ? dash(pens.label * 1.4, pens.label * 0.9) : undefined} />
        ))}
      </g>
      {m.shadows.length > 0 && <path d={m.shadows.map(polyPath).join('')} fill={INK.shadow} stroke="none" />}
      <path d={segsPath(t.shoreHatch)} stroke={INK.hatch} strokeWidth={pens.hair} />
      <path d={segsPath(t.sideHatch)} stroke={INK.hatchLight} strokeWidth={pens.hair} />
      {m.contours.map((c) => (
        <path key={c.ft} d={c.lines.map(smoothPath).join('')} stroke={c.index ? INK.mid : INK.faint} strokeWidth={c.index ? pens.thin : pens.hair} strokeLinejoin="round" />
      ))}
    </g>
  )
}

/** A polygon shrunk toward its centre: a pond's inner water lines and a pool's coping. */
const shrink = (poly: readonly Pt[], k: number): Pt[] => {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k])
}

function Things({ m, t, pens }: { readonly m: SiteSheetModel; readonly t: SiteTextures; readonly pens: SitePens }) {
  return (
    <g>
      {m.things.map((o) => {
        if (o.kind === 'meadow')
          return <path key={o.id} d={smoothPath([...o.outline, o.outline[0]])} fill="none" stroke={INK.soft} strokeWidth={pens.thin} strokeLinecap="round" strokeDasharray={dash(0, pens.thin * 3.2)} />
        if (o.kind === 'pad' && o.stalls.length)
          return (
            <g key={o.id}>
              <polygon points={pts(o.outline)} fill="#fff" stroke={INK.line} strokeWidth={pens.thin} strokeLinejoin="round" />
              <path d={segsPath(o.stalls.map(([a, c]) => [...a, ...c] as Seg4))} stroke={INK.line} strokeWidth={pens.hair} />
            </g>
          )
        if (o.kind === 'pond')
          return (
            <g key={o.id}>
              <path d={smoothPath([...o.outline, o.outline[0]])} fill="#fff" stroke={INK.line} strokeWidth={pens.medium} />
              <path d={smoothPath([...shrink(o.outline, 0.8), shrink(o.outline, 0.8)[0]])} fill="none" stroke={INK.faint} strokeWidth={pens.hair} />
              <path d={smoothPath([...shrink(o.outline, 0.58), shrink(o.outline, 0.58)[0]])} fill="none" stroke={INK.faint} strokeWidth={pens.hair} strokeDasharray={dash(pens.label, pens.label * 0.6)} />
            </g>
          )
        if (o.kind === 'pool')
          return (
            <g key={o.id}>
              <polygon points={pts(o.outline)} fill="#fff" stroke={INK.line} strokeWidth={pens.bold} />
              <polygon points={pts(shrink(o.outline, 0.9))} fill="none" stroke={INK.line} strokeWidth={pens.hair} />
            </g>
          )
        if (o.kind === 'boulder') return <path key={o.id} d={smoothPath([...o.outline, o.outline[0]])} fill={INK.stone} stroke={INK.line} strokeWidth={pens.thin} />
        return <polygon key={o.id} points={pts(o.outline)} fill="#fff" stroke={INK.line} strokeWidth={pens.thin} strokeLinejoin="round" />
      })}
      <path d={segsPath(t.water2)} stroke={INK.faint} strokeWidth={pens.hair} strokeDasharray={dash(pens.label * 0.5, pens.label * 0.7)} />
      <path d={t.tufts.map((p) => tuft(p, pens.label * 0.42)).join('')} stroke={INK.soft} strokeWidth={pens.hair} strokeLinecap="round" fill="none" />
      <g fill={INK.soft} stroke="none">
        {t.gravel.map(([x, y], i) => (
          <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r={(pens.hair * 0.7).toFixed(3)} />
        ))}
      </g>
    </g>
  )
}

function Paths({ m, pens }: { readonly m: SiteSheetModel; readonly pens: SitePens }) {
  return (
    <g>
      {m.bridges.map((b) => (
        <g key={b.id}>
          <polygon points={pts([...b.left, ...[...b.right].reverse()])} fill="#fff" stroke="none" />
          <path d={segsPath(b.boards.map(([a, c]) => [...a, ...c] as Seg4))} stroke={INK.faint} strokeWidth={pens.hair} />
          <path d={linePath(b.left) + linePath(b.right)} fill="none" stroke={INK.line} strokeWidth={pens.medium} />
          {b.columns.map(([x, y], i) => (
            <rect key={i} x={x - pens.label * 0.18} y={y - pens.label * 0.18} width={pens.label * 0.36} height={pens.label * 0.36} fill={INK.line} />
          ))}
        </g>
      ))}
      {m.paths.map((p) => (
        <g key={p.id}>
          <polygon points={pts(p.outline)} fill="#fff" stroke={INK.line} strokeWidth={pens.thin} strokeLinejoin="round" />
          <path d={segsPath(p.treads.map(([a, c]) => [...a, ...c] as Seg4))} stroke={INK.line} strokeWidth={pens.hair} />
          {(p.kind === 'ramp' || p.kind === 'stair') && p.slope > 0 && p.centre.length >= 2 && <UpArrow p={p} pens={pens} />}
        </g>
      ))}
    </g>
  )
}

/** An up arrow along a ramp or stair, with its slope or riser count. */
function UpArrow({ p, pens }: { readonly p: SiteSheetModel['paths'][number]; readonly pens: SitePens }) {
  const a = p.upToB ? p.centre[0] : p.centre[p.centre.length - 1]
  const b = p.upToB ? p.centre[p.centre.length - 1] : p.centre[0]
  const from: Pt = [a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15]
  const to: Pt = [a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.85]
  return (
    <g stroke={INK.line} strokeWidth={pens.hair}>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
      <polygon points={pts(arrowHead(from, to, pens.small))} fill={INK.line} stroke="none" />
    </g>
  )
}

function Part({ p, pens, roofed }: { readonly p: SitePartMark; readonly pens: SitePens; readonly roofed: boolean }) {
  if (p.kind === 'wall') {
    // under a roof the walls are hidden lines; with no roof they are the building's dark mass
    return roofed ? null : <polygon points={pts(p.outline)} fill={INK.wall} stroke={INK.line} strokeWidth={pens.bold} strokeLinejoin="miter" />
  }
  return (
    <g>
      <polygon points={pts(p.outline)} fill={p.kind === 'deck' || p.kind === 'porch' ? INK.deck : '#fff'} stroke={INK.line} strokeWidth={pens.thin} strokeLinejoin="miter" />
      {p.nosings.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={INK.line} strokeWidth={pens.hair} />
      ))}
    </g>
  )
}

function RoofPlan({ r, pens }: { readonly r: SiteRoofMark; readonly pens: SitePens }) {
  return (
    <g fill="none" strokeLinecap="round">
      <polygon points={pts(r.eave)} fill="#fff" stroke={INK.line} strokeWidth={pens.heavy} strokeLinejoin="miter" />
      {r.lines.map((l, i) => {
        const crease = l.kind === 'ridge' || l.kind === 'hip' || l.kind === 'break' || l.kind === 'lip'
        const valley = l.kind === 'valley'
        return (
          <polyline
            key={i}
            points={pts(l.pts)}
            stroke={crease || valley ? INK.line : INK.soft}
            strokeWidth={crease ? pens.medium : valley ? pens.thin : pens.hair}
            strokeDasharray={valley ? dash(pens.label * 0.7, pens.label * 0.35) : crease ? undefined : dash(pens.hair * 1.5, pens.hair * 4)}
          />
        )
      })}
      {r.slope && (
        <g stroke={INK.line} strokeWidth={pens.hair}>
          <line x1={r.slope[0][0]} y1={r.slope[0][1]} x2={r.slope[1][0]} y2={r.slope[1][1]} />
          <polygon points={pts(arrowHead(r.slope[0], r.slope[1], pens.small))} fill={INK.line} stroke="none" />
        </g>
      )}
    </g>
  )
}

function Buildings({ m, pens }: { readonly m: SiteSheetModel; readonly pens: SitePens }) {
  return (
    <g>
      {m.buildings.map((b) => {
        const roofed = b.roofs.length > 0
        return (
          <g key={b.id} data-building={b.id}>
            {b.courts.map((c, i) => (
              <polygon key={i} points={pts(c)} fill="#fff" stroke={INK.line} strokeWidth={pens.thin} strokeDasharray={dash(pens.label * 0.6, pens.label * 0.4)} />
            ))}
            {b.walls.map((w, i) => (
              <polygon key={i} points={pts([...w.face, ...[...w.back].reverse()])} fill={INK.wall} stroke={INK.line} strokeWidth={pens.thin} />
            ))}
            {b.parts
              .filter((p) => p.kind !== 'wall')
              .map((p, i) => (
                <Part key={i} p={p} pens={pens} roofed={roofed} />
              ))}
            {b.parts
              .filter((p) => p.kind === 'wall')
              .map((p, i) => (
                <Part key={`w${i}`} p={p} pens={pens} roofed={roofed} />
              ))}
            {b.roofs.map((r, i) => (
              <RoofPlan key={i} r={r} pens={pens} />
            ))}
            {roofed &&
              b.parts
                .filter((p) => p.kind === 'wall')
                .map((p, i) => <polygon key={`h${i}`} points={pts(p.outline)} fill="none" stroke={INK.mid} strokeWidth={pens.hair} strokeDasharray={dash(pens.label * 0.5, pens.label * 0.3)} />)}
          </g>
        )
      })}
    </g>
  )
}

/** Roof finishes over the roof plans: a glass roof's grid and a metal roof's seams (already clipped to their eaves), and sod roofs' tufts. */
function RoofTextures({ t, pens }: { readonly t: SiteTextures; readonly pens: SitePens }) {
  return (
    <g aria-hidden="true">
      <path d={segsPath(t.roofHatch)} stroke={INK.faint} strokeWidth={pens.hair} />
      <path d={t.sodTufts.map((p) => tuft(p, pens.label * 0.36)).join('')} stroke={INK.soft} strokeWidth={pens.hair} strokeLinecap="round" fill="none" />
    </g>
  )
}

function Trees({ m, pens }: { readonly m: SiteSheetModel; readonly pens: SitePens }) {
  return (
    <g>
      {m.trees.map((t) => (
        <g key={t.id}>
          <path d={smoothPath([...t.canopy, t.canopy[0]])} fill="#fff" fillOpacity={0.35} stroke={INK.line} strokeWidth={pens.thin} />
          <circle cx={t.at[0]} cy={t.at[1]} r={t.radiusFt * 0.06} fill={INK.line} />
          <path d={`M${t.at[0] - t.radiusFt * 0.18} ${t.at[1]}h${t.radiusFt * 0.36}M${t.at[0]} ${t.at[1] - t.radiusFt * 0.18}v${t.radiusFt * 0.36}`} stroke={INK.line} strokeWidth={pens.hair} />
        </g>
      ))}
    </g>
  )
}

function SiteLines({ m, t, pens }: { readonly m: SiteSheetModel; readonly t: SiteTextures; readonly pens: SitePens }) {
  const lotLine = m.lotLines.map((l) => `M${l.a[0].toFixed(3)} ${l.a[1].toFixed(3)}L${l.b[0].toFixed(3)} ${l.b[1].toFixed(3)}`).join('')
  const smooth = (ls: readonly (readonly Pt[])[]) => ls.map((l) => (isClosed(l) || l.length > 3 ? smoothPath(l) : linePath(l))).join('')
  return (
    <g fill="none" strokeLinecap="butt" strokeLinejoin="round">
      {m.treeZones.map((z) => (
        <path key={z.ft} d={smooth(z.lines)} stroke={INK.soft} strokeWidth={pens.thin} strokeLinecap="round" strokeDasharray={dash(0, pens.thin * 2.6)} />
      ))}
      <path d={smooth(m.sideLine)} stroke={INK.mid} strokeWidth={pens.thin} strokeDasharray={dash(pens.label * 0.9, pens.label * 0.45)} />
      <path d={smooth(m.buffer)} stroke={INK.line} strokeWidth={pens.medium} strokeDasharray={dash(pens.label * 2.2, pens.label * 0.5)} />
      <path d={smooth(m.topOfBank)} stroke={INK.line} strokeWidth={pens.medium} />
      <path d={segsPath(t.bankTicks)} stroke={INK.line} strokeWidth={pens.hair} />
      <path d={linePath(m.shoreline)} stroke={INK.line} strokeWidth={pens.bold} />
      <path d={lotLine} stroke={INK.line} strokeWidth={pens.heavy} strokeDasharray={dash(pens.label * 2.6, pens.label * 0.45, pens.label * 0.35, pens.label * 0.45)} />
      {m.stakes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={pens.label * 0.32} fill="#fff" stroke={INK.line} strokeWidth={pens.thin} />
          <path d={`M${x - pens.label * 0.32} ${y}h${pens.label * 0.64}M${x} ${y - pens.label * 0.32}v${pens.label * 0.64}`} stroke={INK.line} strokeWidth={pens.hair} />
        </g>
      ))}
    </g>
  )
}

function Clearances({ a, pens }: { readonly a: SiteAnnotations; readonly pens: SitePens }) {
  return (
    <g>
      {a.clearances.map((c, i) => (
        <g key={i} data-clearance={c.kind}>
          <line x1={c.from[0]} y1={c.from[1]} x2={c.to[0]} y2={c.to[1]} stroke={INK.line} strokeWidth={pens.hair} />
          <polygon points={pts(arrowHead(c.from, c.to, pens.small * 0.9))} fill={INK.line} />
          <polygon points={pts(arrowHead(c.to, c.from, pens.small * 0.9))} fill={INK.line} />
          {c.label && <Label l={c.label} pens={pens} weight={c.warn ? 700 : 400} />}
        </g>
      ))}
    </g>
  )
}

function Words({ a, pens }: { readonly a: SiteAnnotations; readonly pens: SitePens }) {
  return (
    <g>
      {a.contours.map((l, i) => (
        <Label key={`c${i}`} l={l} pens={pens} fill={INK.mid} />
      ))}
      {a.things.map((l, i) => (
        <Label key={`t${i}`} l={l} pens={pens} fill={INK.mid} italic />
      ))}
      {a.lines.map((l, i) => (
        <Label key={`l${i}`} l={l} pens={pens} />
      ))}
      {a.buildings.map((b) => (
        <g key={b.id}>
          {b.names.map((l, i) => (
            <Label key={i} l={l} pens={pens} weight={700} />
          ))}
          {b.level && <Label l={b.level} pens={pens} />}
        </g>
      ))}
    </g>
  )
}

/** The whole drawing, back to front. */
export function SiteDrawing({ m, a, t, pens, clipId }: { readonly m: SiteSheetModel; readonly a: SiteAnnotations; readonly t: SiteTextures; readonly pens: SitePens; readonly clipId: string }): ReactNode {
  return (
    <g clipPath={`url(#${clipId})`}>
      <Ground m={m} t={t} pens={pens} />
      <Things m={m} t={t} pens={pens} />
      <Paths m={m} pens={pens} />
      <Buildings m={m} pens={pens} />
      <RoofTextures t={t} pens={pens} />
      <Trees m={m} pens={pens} />
      <SiteLines m={m} t={t} pens={pens} />
      <Clearances a={a} pens={pens} />
      <Words a={a} pens={pens} />
    </g>
  )
}
