import { useMemo } from 'react'
import type { Selection } from '../edits'
import { envelopeOf, type Envelope } from '../envelope'
import { FURNITURE, symbol } from '../furniture/furniture'
import * as G from '../geom'
import type { Pt } from '../geom'
import { openingGeom, partitionSegments, roomInfo } from '../rooms'
import { ROOM_COLORS, WALL, type Floor, type Furniture, type FurnitureBase, type Opening, type Room } from '../types'
import { fmtArea, fmtLen } from '../format'
import { roomLabel } from './labelFit'

/**
 * One floor of a cabin drawn as a plan (old int2/render.js, editor mode):
 * masses, room fills, partitions and the exterior wall band, openings with
 * swing arcs, furniture symbols, room labels, the selection and the tool's
 * preview, and the front marker. Hit targets carry data-room, data-edge,
 * data-vertex, data-opening, data-furniture and data-handle.
 */

export const ACCENT = '#2d7fc1'
const INK = '#2b2622'

export interface Transform {
  /** Pixels per foot. */
  readonly S: number
  readonly X: (x: number) => number
  readonly Y: (z: number) => number
}

export interface Preview {
  /** Rooms as a drag shows them, before the edit is committed. */
  readonly rooms?: readonly Room[]
  readonly furniture?: Furniture
  readonly opening?: Opening
  /** A ghost to place (furniture tool, opening tools). */
  readonly ghostFurniture?: FurnitureBase
  readonly ghostOpening?: Omit<Opening, 'id'>
  readonly poly?: readonly Pt[]
  readonly line?: readonly [Pt, Pt]
  readonly pt?: Pt
  readonly snapKind?: string
  readonly text?: string
}

type PtsFn = (P: readonly (readonly number[])[]) => string

interface Props {
  readonly params: Record<string, unknown>
  readonly fi: number
  readonly floor: Floor
  readonly t: Transform
  readonly width: number
  readonly height: number
  readonly sel: Selection
  readonly preview: Preview
  readonly grid: boolean
}

export function PlanLayers({ params, fi, floor, t, width, height, sel, preview, grid }: Props) {
  const { S, X, Y } = t
  const env = envelopeOf(params, fi)
  const rooms = preview.rooms ?? floor.rooms
  const furniture = preview.furniture ? floor.furniture.map((f) => (f.id === preview.furniture!.id ? preview.furniture! : f)) : floor.furniture
  const openings = preview.opening ? floor.openings.map((o) => (o.id === preview.opening!.id ? preview.opening! : o)) : floor.openings
  const pts: PtsFn = (P) => P.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')
  const pathD: PtsFn = (P) => `M${P.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' L')} Z`
  const infos = useMemo(() => new Map(rooms.map((r) => [r.id, roomInfo(params, fi, r)])), [params, fi, rooms])
  const partitions = useMemo(() => partitionSegments(params, fi, rooms), [params, fi, rooms])
  const room = sel.room != null ? rooms.find((r) => r.id === sel.room) : undefined
  const selFurn = sel.furniture != null ? furniture.find((f) => f.id === sel.furniture) : undefined
  return (
    <>
      <rect width="100%" height="100%" fill="#fff" data-bg="1" />
      {grid && S >= 6 && <Grid t={t} width={width} height={height} />}
      <g pointerEvents="none">
        {env.masses.map((P, i) => (
          <polygon key={`m${i}`} points={pts(P)} fill="#f7f6f1" />
        ))}
        {[...env.open, ...env.access.map((a) => a.P)].map((P, i) => (
          <polygon key={`o${i}`} points={pts(P)} fill="none" stroke="#555" strokeWidth={1} strokeDasharray="6 4" />
        ))}
        {fi >= 1 && <BelowGhost params={params} env={env} pts={pts} />}
      </g>
      <g>
        {rooms.map((r) => (
          <polygon
            key={r.id}
            data-room={r.id}
            points={pts(r.pts)}
            fill={ROOM_COLORS[r.type] ?? '#eee'}
            opacity={0.85}
            stroke={r.type === 'porch' ? '#555' : 'none'}
            strokeWidth={1}
            strokeDasharray={r.type === 'porch' ? '4 3' : undefined}
          />
        ))}
      </g>
      <Walls env={env} partitions={partitions} t={t} pathD={pathD} />
      <g>
        {openings.map((op) => (
          <OpeningMark key={op.id} params={params} fi={fi} op={op} rooms={rooms} t={t} color={sel.opening === op.id ? ACCENT : '#111'} hit />
        ))}
      </g>
      <g>
        {furniture.map((f) => (
          <FurnitureMark key={f.id} f={f} t={t} stroke="#3a3a3a" hit />
        ))}
      </g>
      <g pointerEvents="none" textAnchor="middle" fill="#222">
        {rooms.map((r) => {
          const inf = infos.get(r.id)
          if (!inf?.obb || !inf.label) return null
          const mn = Math.min(inf.obb.w, inf.obb.d)
          const details = mn * S < 50 ? [] : [`${fmtLen(inf.obb.w)} × ${fmtLen(inf.obb.d)}`, fmtArea(inf.area)]
          const fit = roomLabel(r.pts, inf.label, S, mn, r.name, details)
          if (!fit) return null
          const { lines, fs } = fit
          const y0 = Y(inf.label[1]) - ((lines.length - 1) * 1.25 * fs) / 2
          return (
            <g key={r.id} data-label-room={r.id}>
              {lines.map((txt, k) => (
                <text key={k} x={X(inf.label![0])} y={y0 + k * 1.25 * fs} dy=".35em" fontSize={k ? fs * 0.9 : fs} fontWeight={k ? undefined : 'bold'} stroke={ROOM_COLORS[r.type] ?? '#fff'} strokeWidth={3} paintOrder="stroke">
                  {txt}
                </text>
              ))}
            </g>
          )
        })}
      </g>
      <g>
        {room && <RoomHandles room={room} t={t} pts={pts} />}
        {selFurn && <FurnitureHandles f={selFurn} t={t} pts={pts} />}
      </g>
      <PreviewMarks params={params} fi={fi} rooms={rooms} preview={preview} t={t} pts={pts} />
      <FrontMarker width={width} height={height} />
    </>
  )
}

function Grid({ t, width, height }: { readonly t: Transform; readonly width: number; readonly height: number }) {
  const { S, X, Y } = t
  const ox = -X(0) / S
  const oz = -Y(0) / S
  const lines = []
  for (let x = Math.floor(ox); x <= Math.ceil(ox + width / S); x++)
    lines.push(<line key={`x${x}`} x1={X(x)} y1={0} x2={X(x)} y2={height} stroke={x % 5 ? '#eef0ea' : '#dfe2d8'} />)
  for (let z = Math.floor(oz); z <= Math.ceil(oz + height / S); z++)
    lines.push(<line key={`z${z}`} x1={0} y1={Y(z)} x2={width} y2={Y(z)} stroke={z % 5 ? '#eef0ea' : '#dfe2d8'} />)
  return (
    <g pointerEvents="none" strokeWidth={1}>
      {lines}
    </g>
  )
}

/** The floor below, dashed grey, on an upper floor. */
function BelowGhost({ params, env, pts }: { readonly params: Record<string, unknown>; readonly env: Envelope; readonly pts: PtsFn }) {
  const env0 = envelopeOf(params, 0)
  const key = (P: readonly Pt[]) => JSON.stringify(G.roundPts(P, 0.01))
  const here = new Set(env.masses.map(key))
  const ghosts = [...env0.masses.filter((P) => !here.has(key(P))), ...env0.open, ...env0.access.map((a) => a.P)]
  return (
    <>
      {ghosts.map((P, i) => (
        <polygon key={i} points={pts(P)} fill="none" stroke="#bbb" strokeWidth={1} strokeDasharray="6 4" />
      ))}
    </>
  )
}

/** Partitions first, then the exterior wall band over their ends. */
function Walls({ env, partitions, t, pathD }: { readonly env: Envelope; readonly partitions: readonly { a: Pt; b: Pt }[]; readonly t: Transform; readonly pathD: PtsFn }) {
  const { S, X, Y } = t
  const onEnv = (p: Pt) => env.edges.some(([a, b]) => G.distToSeg(p, a, b).d < G.ON)
  const segs = partitions.map((g) => {
    const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1])
    if (len < 1e-6) return g
    // ends that meet the exterior wall tuck under its band so square caps never poke outside it
    const u: Pt = [(g.b[0] - g.a[0]) / len, (g.b[1] - g.a[1]) / len]
    const r = Math.min(0.3, len / 3)
    const a: Pt = onEnv(g.a) ? [g.a[0] + u[0] * r, g.a[1] + u[1] * r] : g.a
    const b: Pt = onEnv(g.b) ? [g.b[0] - u[0] * r, g.b[1] - u[1] * r] : g.b
    return { a, b }
  })
  return (
    <g pointerEvents="none">
      {segs.map((g, i) => (
        <line key={i} x1={X(g.a[0])} y1={Y(g.a[1])} x2={X(g.b[0])} y2={Y(g.b[1])} stroke={INK} strokeWidth={WALL.int * S} strokeLinecap="square" />
      ))}
      {(env.smooth ?? env.loops).map((L, i) => {
        const inner = env.smooth ? smoothInner(L, WALL.ext) : G.offsetPoly(L, WALL.ext)
        return inner ? (
          <path key={i} fillRule="evenodd" d={`${pathD(L)} ${pathD(inner)}`} fill={INK} stroke="none" />
        ) : (
          <polygon key={i} points={L.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} fill="none" stroke={INK} strokeWidth={WALL.ext * S} />
        )
      })}
    </g>
  )
}

/** The inner face of a smooth curved wall (vertex-normal offset). */
function smoothInner(L: readonly Pt[], t: number): Pt[] | null {
  const n = L.length
  if (n < 3) return null
  return L.map((p, i) => {
    const e1 = G.edges([L[(i + n - 1) % n], p])[0]
    const e2 = G.edges([p, L[(i + 1) % n]])[0]
    const nx = e1.nin[0] + e2.nin[0]
    const nz = e1.nin[1] + e2.nin[1]
    const k = Math.hypot(nx, nz) || 1
    const c = Math.max(0.5, (nx * e1.nin[0] + nz * e1.nin[1]) / k)
    return [p[0] + ((nx / k) * t) / c, p[1] + ((nz / k) * t) / c]
  })
}

interface OpeningProps {
  readonly params: Record<string, unknown>
  readonly fi: number
  readonly op: Opening | Omit<Opening, 'id'>
  readonly rooms: readonly Room[]
  readonly t: Transform
  readonly color: string
  readonly hit: boolean
}

/** A gap in the wall with its symbol: a swing arc for a door, three lines for a window, two leaves for a slider. */
export function OpeningMark({ params, fi, op, rooms, t, color, hit }: OpeningProps) {
  const { S, X, Y } = t
  const id = 'id' in op ? op.id : -1
  const g = openingGeom(params, fi, { ...op, id }, rooms)
  if (!g) return null
  const w = op.width
  const P = (s: number, off: number): Pt => [g.a[0] + g.dir[0] * s + g.nin[0] * off, g.a[1] + g.dir[1] * s + g.nin[1] * off]
  const XY = (p: Pt) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`
  const L = (a: Pt, b: Pt, sw: number, k: string) => <line key={k} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke={color} strokeWidth={sw} />
  const marks = []
  if (op.kind === 'window') [g.off0, (g.off0 + g.off1) / 2, g.off1].forEach((off, i) => marks.push(L(P(0, off), P(w, off), 1, `w${i}`)))
  else if (op.kind === 'slider') {
    const mid = (g.off0 + g.off1) / 2
    const k = g.t / 5
    marks.push(L(P(0, mid - k), P(0.55 * w, mid - k), 2, 's0'), L(P(0.45 * w, mid + k), P(w, mid + k), 2, 's1'))
  } else if (op.kind === 'door') {
    const sg = op.out ? -1 : 1
    const f = sg > 0 ? g.off1 : g.off0
    const Hp: Pt = [g.hinge[0] + g.nin[0] * f, g.hinge[1] + g.nin[1] * f]
    const Jp: Pt = [g.jamb[0] + g.nin[0] * f, g.jamb[1] + g.nin[1] * f]
    const T: Pt = [Hp[0] + g.nin[0] * sg * w, Hp[1] + g.nin[1] * sg * w]
    const v1 = [(T[0] - Hp[0]) * S, (T[1] - Hp[1]) * S]
    const v2 = [(Jp[0] - Hp[0]) * S, (Jp[1] - Hp[1]) * S]
    const sweep = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0
    const r = (w * S).toFixed(1)
    marks.push(L(Hp, T, 1.5, 'leaf'), <path key="arc" d={`M${XY(T)} A${r} ${r} 0 0 ${sweep} ${XY(Jp)}`} fill="none" stroke={color} strokeWidth={1} />)
  }
  const band = (o0: number, o1: number) => [P(0, o0), P(w, o0), P(w, o1), P(0, o1)].map(XY).join(' ')
  return (
    <g data-opening={hit ? id : undefined}>
      <polygon points={band(g.off0, g.off1)} fill="#fff" />
      <path d={`M${XY(P(0, g.off0))} L${XY(P(0, g.off1))} M${XY(P(w, g.off0))} L${XY(P(w, g.off1))}`} stroke={color} strokeWidth={1} fill="none" />
      {marks}
      {hit && <polygon points={band(g.off0 - 0.6, g.off1 + 0.6)} fill="transparent" stroke="none" />}
    </g>
  )
}

/**
 * A piece of furniture: its catalogue symbol scaled from feet. The symbol
 * markup is generated from numbers and fixed labels only (furniture.ts),
 * never from anything typed, so it is set as markup.
 */
export function FurnitureMark({ f, t, stroke, hit }: { readonly f: FurnitureBase & { readonly id?: number }; readonly t: Transform; readonly stroke: string; readonly hit: boolean }) {
  const { S, X, Y } = t
  const m = f.mirror ? -1 : 1
  return (
    <g
      data-furniture={hit && 'id' in f ? f.id : undefined}
      transform={`translate(${X(f.x)},${Y(f.z)}) rotate(${(+f.rot || 0).toFixed(2)}) scale(${S}) scale(${m},1)`}
      stroke={stroke}
      fill="none"
      strokeWidth={+(1 / S).toFixed(5)}
    >
      <g dangerouslySetInnerHTML={{ __html: symbol(f.type, f.w, f.d) }} />
      {hit && <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} fill="transparent" stroke="none" />}
    </g>
  )
}

function RoomHandles({ room, t, pts }: { readonly room: Room; readonly t: Transform; readonly pts: PtsFn }) {
  const { X, Y } = t
  const n = room.pts.length
  return (
    <>
      <polygon points={pts(room.pts)} fill="none" stroke={ACCENT} strokeWidth={2.5} pointerEvents="none" />
      {room.pts.map((p, i) => {
        const q = room.pts[(i + 1) % n]
        return <line key={`e${i}`} data-room={room.id} data-edge={i} x1={X(p[0])} y1={Y(p[1])} x2={X(q[0])} y2={Y(q[1])} stroke="transparent" strokeWidth={12} />
      })}
      {room.pts.map((p, i) => (
        <rect key={`v${i}`} data-room={room.id} data-vertex={i} x={X(p[0]) - 4.5} y={Y(p[1]) - 4.5} width={9} height={9} fill="#fff" stroke={ACCENT} strokeWidth={1.5} />
      ))}
    </>
  )
}

function FurnitureHandles({ f, t, pts }: { readonly f: Furniture; readonly t: Transform; readonly pts: PtsFn }) {
  const { X, Y } = t
  const a = ((+f.rot || 0) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const L = (u: number, v: number): Pt => [f.x + u * c - v * s, f.z + u * s + v * c]
  const hr = L(0, -f.d / 2 - 1.2)
  const back = L(0, -f.d / 2)
  const size = L(f.w / 2, f.d / 2)
  return (
    <>
      <polygon points={pts([L(-f.w / 2, -f.d / 2), L(f.w / 2, -f.d / 2), L(f.w / 2, f.d / 2), L(-f.w / 2, f.d / 2)])} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="5 3" pointerEvents="none" />
      <line x1={X(back[0])} y1={Y(back[1])} x2={X(hr[0])} y2={Y(hr[1])} stroke={ACCENT} strokeWidth={1} pointerEvents="none" />
      <circle data-furniture={f.id} data-handle="rot" cx={X(hr[0])} cy={Y(hr[1])} r={6} fill="#fff" stroke={ACCENT} strokeWidth={1.5} />
      {FURNITURE[f.type]?.resizable && <rect data-furniture={f.id} data-handle="size" x={X(size[0]) - 4.5} y={Y(size[1]) - 4.5} width={9} height={9} fill="#fff" stroke={ACCENT} strokeWidth={1.5} />}
    </>
  )
}

interface PreviewProps {
  readonly params: Record<string, unknown>
  readonly fi: number
  readonly rooms: readonly Room[]
  readonly preview: Preview
  readonly t: Transform
  readonly pts: PtsFn
}

function PreviewMarks({ params, fi, rooms, preview: pv, t, pts }: PreviewProps) {
  const { X, Y } = t
  const poly = pv.poly
  return (
    <g pointerEvents="none">
      {poly && poly.length >= 2 && (
        <>
          <polygon points={pts(poly)} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="6 4" />
          {poly.slice(0, poly.length === 2 ? 1 : poly.length).map((a, i) => {
            const b = poly[(i + 1) % poly.length]
            const len = Math.hypot(b[0] - a[0], b[1] - a[1])
            return len < 0.05 ? null : (
              <text key={i} x={X((a[0] + b[0]) / 2)} y={Y((a[1] + b[1]) / 2)} dy=".35em" fontSize={10} textAnchor="middle" fill={ACCENT} stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {fmtLen(len)}
              </text>
            )
          })}
        </>
      )}
      {pv.line && <line x1={X(pv.line[0][0])} y1={Y(pv.line[0][1])} x2={X(pv.line[1][0])} y2={Y(pv.line[1][1])} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="6 4" />}
      {pv.pt &&
        (pv.snapKind === 'edge' ? (
          <rect x={X(pv.pt[0]) - 5} y={Y(pv.pt[1]) - 5} width={10} height={10} fill="none" stroke={ACCENT} strokeWidth={2} />
        ) : (
          <circle cx={X(pv.pt[0])} cy={Y(pv.pt[1])} r={5} fill={pv.snapKind === 'vertex' || pv.snapKind === 'intersection' ? 'none' : ACCENT} stroke={ACCENT} strokeWidth={2} />
        ))}
      {pv.ghostFurniture && (
        <g opacity={0.5}>
          <FurnitureMark f={pv.ghostFurniture} t={t} stroke={ACCENT} hit={false} />
        </g>
      )}
      {pv.ghostOpening && (
        <g opacity={0.6}>
          <OpeningMark params={params} fi={fi} op={pv.ghostOpening} rooms={rooms} t={t} color={ACCENT} hit={false} />
        </g>
      )}
      {pv.text && (
        <>
          <rect x={4} y={4} width={pv.text.length * 6.2 + 12} height={20} rx={3} fill="#fff" fillOpacity={0.92} stroke={ACCENT} strokeWidth={1} />
          <text x={10} y={18} fontSize={11} fill="#222">
            {pv.text}
          </text>
        </>
      )}
    </g>
  )
}

function FrontMarker({ width, height }: { readonly width: number; readonly height: number }) {
  const cx = width / 2
  const cy = height - 24
  return (
    <g pointerEvents="none" fill="#1f4e6a" stroke="none">
      <text x={cx} y={cy} fontSize={10} textAnchor="middle" letterSpacing={2} fontWeight="bold" stroke="#fff" strokeWidth={3} paintOrder="stroke">
        FRONT · MUD BAY
      </text>
      <path d={`M${cx} ${cy + 3} V${cy + 13}`} stroke="#1f4e6a" strokeWidth={1.5} />
      <path d={`M${cx - 4} ${cy + 9} L${cx} ${cy + 15} L${cx + 4} ${cy + 9} Z`} />
    </g>
  )
}
