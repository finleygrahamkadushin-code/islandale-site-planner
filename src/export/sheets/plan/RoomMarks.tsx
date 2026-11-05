import { symbol } from '../../../interiors/furniture/furniture'
import { wallThicknessFt } from '../../../buildings/walls/wallShell'
import type { SheetFloor, SheetInteriorOpening, SheetPartition } from '../types'
import type { Pen } from './planLayout'
import { pts } from './planMarks'
import { lineCentres, partitionBand, placeRoomLabel, roomLines, type Box } from './roomLayout'
import type { Pt } from '../svgDims'
import { DoorSwing } from './WallMarks'

/**
 * A floor's rooms on the plan, as the interior editor lays them out: the
 * partitions as double lines run into one another, their doors, windows,
 * sliders and cased openings, each room's name, size and area, and the
 * furniture.
 */

/** A slider's two panes sit this share of the partition either side of its middle, and each runs this share of the opening. */
const SLIDER_PANE_OFF = 0.2
const SLIDER_PANE_RUN = 0.55

const push = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/**
 * Every partition outlined, then every band filled again just inside its
 * faces, so where partitions run into one another (and into the walls'
 * inside face) the lines between them go, leaving one double line.
 */
export function Partitions({ partitions, pen }: { readonly partitions: readonly SheetPartition[]; readonly pen: Pen }) {
  // a band's own end line stays at a free end; it runs on over the wall's inside face where it meets it
  const end = (atWall: boolean) => (atWall ? pen.medium : -pen.thin / 2)
  return (
    <g aria-label="Partitions">
      {partitions.map((p, i) => (
        <polygon key={i} points={pts(partitionBand(p, 0, 0, 0))} fill="#fff" stroke="#000" strokeWidth={pen.thin} strokeLinejoin="miter" />
      ))}
      {partitions.map((p, i) => (
        <polygon key={`f${i}`} points={pts(partitionBand(p, end(p.aAtWall), end(p.bAtWall), pen.thin / 2))} fill="#fff" stroke="none" />
      ))}
    </g>
  )
}

/** An opening in a partition: the partition cleared, jambs across it, and its kind's mark (a door's leaf and swing as stored, a window's glass, a slider's panes, a cased opening's head dashed). */
function InteriorOpening({ opening: o, pen }: { readonly opening: SheetInteriorOpening; readonly pen: Pen }) {
  // one through a part's wall opens that wall's whole thickness, on either side of the room's edge
  const h = o.inPartWall ? wallThicknessFt(null) : o.thicknessFt / 2
  const n = o.swing
  const face = (p: Pt, k: number) => push(p, n, k)
  const line = (p: Pt, q: Pt, w: number, key: string, dash?: string) => <line key={key} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#000" strokeWidth={w} strokeDasharray={dash} />
  const clear = h + pen.thin
  const marks =
    o.kind === 'window'
      ? [line(face(o.a, h), face(o.b, h), pen.thin, 'o'), line(face(o.a, -h), face(o.b, -h), pen.thin, 'i'), line(o.a, o.b, pen.thin, 'g')]
      : o.kind === 'slider'
        ? [
            line(face(o.a, -h * SLIDER_PANE_OFF * 2), face(lerp(o.a, o.b, SLIDER_PANE_RUN), -h * SLIDER_PANE_OFF * 2), pen.thin, 's0'),
            line(face(lerp(o.a, o.b, 1 - SLIDER_PANE_RUN), h * SLIDER_PANE_OFF * 2), face(o.b, h * SLIDER_PANE_OFF * 2), pen.thin, 's1'),
          ]
        : o.kind === 'open'
          ? [line(face(o.a, h), face(o.b, h), pen.hair, 'o', `${pen.small * 0.5} ${pen.small * 0.4}`), line(face(o.a, -h), face(o.b, -h), pen.hair, 'i', `${pen.small * 0.5} ${pen.small * 0.4}`)]
          : []
  return (
    <g aria-label={`${o.kind} ${o.room}${o.to ? ` to ${o.to}` : ''}`}>
      <polygon points={pts([face(o.a, clear), face(o.b, clear), face(o.b, -clear), face(o.a, -clear)])} fill="#fff" stroke="none" />
      {line(face(o.a, h), face(o.a, -h), pen.thin, 'ja')}
      {line(face(o.b, h), face(o.b, -h), pen.thin, 'jb')}
      {marks}
      {o.kind === 'door' && <DoorSwing hinge={face(o.hinge, h)} free={face(o.jamb, h)} inward={n} pen={pen} />}
    </g>
  )
}

export function InteriorOpenings({ openings, pen }: { readonly openings: readonly SheetInteriorOpening[]; readonly pen: Pen }) {
  return (
    <g aria-label="Interior openings">
      {openings.map((o, i) => (
        <InteriorOpening key={i} opening={o} pen={pen} />
      ))}
    </g>
  )
}

/** Each room's name, and its size and area inside the walls where they fit, haloed white over the linework and kept off the plan's figures (`taken`). */
export function RoomLabels({ floor, pen, taken }: { readonly floor: SheetFloor; readonly pen: Pen; readonly taken: readonly Box[] }) {
  return (
    <g fill="#000" stroke="#fff" strokeWidth={pen.thin * 2} paintOrder="stroke" textAnchor="middle" dominantBaseline="central" aria-label="Rooms">
      {floor.rooms.map((r) => {
        const lines = roomLines(r, pen)
        const at = lineCentres(placeRoomLabel(r, lines, taken), lines)
        return (
          <g key={r.id}>
            {lines.map((l, k) => (
              <text key={k} x={at[k][0]} y={at[k][1]} fontSize={l.size} fontWeight={l.bold ? 700 : undefined} fontStyle={r.porch && l.bold ? 'italic' : undefined}>
                {l.text}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}

/**
 * The furniture and fixtures as the interior editor draws them, in hairline.
 * The symbol markup is generated from numbers and fixed labels only
 * (furniture.ts), never from anything typed, so it is set as markup.
 */
export function FurnitureMarks({ floor, pen }: { readonly floor: SheetFloor; readonly pen: Pen }) {
  return (
    <g stroke="#000" fill="none" strokeWidth={pen.hair} aria-label="Furniture">
      {floor.furniture.map((f, i) => (
        <g key={i} transform={`translate(${f.at[0]} ${f.at[1]}) rotate(${f.rotDeg}) scale(${f.mirror ? -1 : 1} 1)`}>
          <g dangerouslySetInnerHTML={{ __html: symbol(f.type, f.widthFt, f.depthFt) }} />
        </g>
      ))}
    </g>
  )
}
