import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import * as E from '../edits'
import { envelopeOf } from '../envelope'
import { FURNITURE, makeFurniture, snapToWall, type SnapRoom } from '../furniture/furniture'
import * as G from '../geom'
import type { Pt } from '../geom'
import { readFloors } from '../model'
import { accessibleRoom, fixtureDefaults } from '../furniture/fixtures'
import { cabinTypeOf, checkProgram, PROGRAMS } from '../program'
import { newRoomName, roomInfo } from '../rooms'
import type { Floor, Furniture, Opening, OpeningKind, Room, RoomType } from '../types'
import type { FloorEdit } from '../../store/interiorActions'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { fmtLen } from '../format'
import { useInteriorView, type PlanView } from './interiorView'
import { PlanLayers, type Preview, type Transform } from './PlanLayers'

/** Plan zoom limits, pixels per foot. */
const MIN_SCALE = 4
const MAX_SCALE = 120
/** A press that moves less than this (px) is a click. */
const CLICK_PX = 4
/** Snap reach, pixels. */
const SNAP_PX = 10
const GRID_FT = 0.5
const FURN_GRID_FT = 0.25
const r2 = (v: number) => Math.round(v * 100) / 100

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: PlanView }
  | { kind: 'vertex'; rid: number; i: number; pts: readonly Pt[] }
  | { kind: 'edge'; rid: number; edge: number; p0: Pt; nin: Pt; a: Pt }
  | { kind: 'move'; rid: number; p0: Pt }
  | { kind: 'opening'; oid: number }
  | { kind: 'furn'; fid: number; off: Pt }
  | { kind: 'rot'; fid: number }
  | { kind: 'size'; fid: number }
  | { kind: 'rect'; p0: Pt }
  | { kind: 'split'; p0: Pt }

interface Gesture {
  readonly drag: Drag
  readonly sx: number
  readonly sy: number
  moved: boolean
  last?: { p: Pt; snap: boolean }
}

interface Hit {
  readonly room?: number
  readonly edge?: number
  readonly vertex?: number
  readonly opening?: number
  readonly furniture?: number
  readonly handle?: string
  readonly bg: boolean
}

function hitOf(target: EventTarget | null): Hit {
  const el = target instanceof Element ? target.closest('[data-room],[data-opening],[data-furniture],[data-bg]') : null
  if (!(el instanceof SVGElement)) return { bg: false }
  const d = el.dataset
  const int = (v: string | undefined) => (v != null && v !== '' ? parseInt(v, 10) : undefined)
  return { room: int(d.room), edge: int(d.edge), vertex: int(d.vertex), opening: int(d.opening), furniture: int(d.furniture), handle: d.handle, bg: d.bg != null }
}

/** The view that fits the cabin's floor into a w × h canvas. */
export function fitView(params: Record<string, unknown>, fi: number, w: number, h: number, pad = 40): PlanView {
  const b = envelopeOf(params, fi).bboxAll
  if (!(b.w > 0 && b.d > 0)) return { scale: 20, cx: 0, cz: 0 }
  const s = Math.min((w - 2 * pad) / Math.max(b.w, 1), (h - 2 * pad) / Math.max(b.d, 1))
  return { scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number.isFinite(s) ? s : 20)), cx: (b.x1 + b.x2) / 2, cz: (b.z1 + b.z2) / 2 }
}

export function PlanCanvas({ o }: { readonly o: PlanObject }) {
  const v = useInteriorView()
  const editFloor = usePlanStore((s) => s.editFloor)
  const otherNames = usePlanStore(useShallow((s) => Object.values(s.plan.objects).filter((x) => x.id !== o.id).map((x) => x.name)))
  const floors = useMemo(() => readFloors(o.params), [o.params])
  const fi = Math.min(v.fi, floors.length - 1)
  const floor: Floor = floors[fi]
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const gesture = useRef<Gesture | null>(null)
  const [preview, setPreview] = useState<Preview>({})
  const [draft, setDraft] = useState<Pt[] | null>(null)
  /** A corner just added by double-click: the room's outline with it, until it is dragged. */
  const [inserted, setInserted] = useState<{ rid: number; pts: Pt[] } | null>(null)
  const [space, setSpace] = useState(false)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!v.view && size.w > 0) v.setView(fitView(o.params, fi, size.w, size.h))
  }, [v, o.params, fi, size])
  // a tool change drops whatever the last tool was showing
  useEffect(() => {
    setPreview({})
    setDraft(null)
  }, [v.tool, fi])
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) setSpace(true)
      if (e.key === 'Escape' && draft) {
        e.stopImmediatePropagation()
        setDraft(null)
        setPreview({})
      }
      if (e.key === 'Enter' && draft && draft.length >= 3) commitRoom(draft)
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
    }
  })

  const view = v.view ?? fitView(o.params, fi, size.w, size.h)
  const S = view.scale
  const t: Transform = { S, X: (x) => (x - view.cx) * S + size.w / 2, Y: (z) => (z - view.cz) * S + size.h / 2 }
  const toPlan = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrap.current!.getBoundingClientRect()
    return [(e.clientX - r.left - size.w / 2) / S + view.cx, (e.clientY - r.top - size.h / 2) / S + view.cz]
  }
  const snapOn = (e: { altKey: boolean }) => v.snap && !e.altKey
  const env = envelopeOf(o.params, fi)
  const snapP = (p: Pt, e: { altKey: boolean }, except?: number): G.Snap => {
    if (!snapOn(e)) return { p, kind: 'none' }
    const rooms = floor.rooms.filter((r) => r.id !== except)
    const verts = [...rooms.flatMap((r) => r.pts), ...env.loops.flat()]
    const edges = [...rooms.flatMap((r) => r.pts.map((a, i): [Pt, Pt] => [a, r.pts[(i + 1) % r.pts.length]])), ...env.edges]
    return G.snapPoint(p, { verts, edges, grid: GRID_FT }, SNAP_PX / S)
  }
  const commit = (op: FloorEdit) => {
    const sel = editFloor(o.id, fi, op)
    if (sel) v.select(sel)
    setPreview({})
    return sel
  }

  /** The type and name for a new room: the first program item still missing, else a bedroom (old pickTypeName). */
  const newRoomKind = (): { type: RoomType; name: string } => {
    const program = PROGRAMS[cabinTypeOf(o.name, o.params, otherNames)]
    const miss = checkProgram(program, floors).find((r) => !r.ok)
    const item = miss && program.items.find((i) => i.key === miss.key)
    return item ? { type: item.types[0], name: item.label } : { type: 'bedroom', name: newRoomName(floor, 'bedroom') }
  }
  const commitRoom = (pts: readonly Pt[]) => {
    setDraft(null)
    const k = newRoomKind()
    commit((p, f, next) => E.addRoom(p, fi, f, pts, k.type, k.name, next))
  }
  const snapRooms = (): SnapRoom[] => floor.rooms.map((r) => roomInfo(o.params, fi, r))
  /** Where a piece goes at p: backed onto a wall for wall-snapping types, else on the 3 in grid (Alt: free). */
  const placeFurn = (it: Pick<Furniture, 'type' | 'rot' | 'w' | 'd'>, p: Pt, e: { altKey: boolean }) => {
    if (snapOn(e) && FURNITURE[it.type]?.wallSnap) {
      const s = snapToWall({ ...it, x: p[0], z: p[1] }, snapRooms(), 2)
      if (s.x !== p[0] || s.z !== p[1] || s.rot !== it.rot) return { x: r2(s.x), z: r2(s.z), rot: s.rot }
    }
    const q = snapOn(e) ? [G.snapGrid(p[0], FURN_GRID_FT), G.snapGrid(p[1], FURN_GRID_FT)] : p
    return { x: r2(q[0]), z: r2(q[1]), rot: it.rot }
  }
  /** The room edge nearest p (the room containing p first; on a wall, the room on p's side). */
  const wallSpot = (p: Pt, tol: number): { room: Room; edge: number; t: number } | null => {
    const inside = floor.rooms.find((r) => G.pointInPoly(r.pts, p[0], p[1]))
    if (inside) {
      const ne = G.nearestEdge(inside.pts, p)
      return ne && ne.d <= tol ? { room: inside, edge: ne.i, t: ne.t } : null
    }
    let best: { room: Room; edge: number; t: number; score: number } | null = null
    for (const r of floor.rooms) {
      const ne = G.nearestEdge(r.pts, p)
      if (!ne || ne.d > tol) continue
      const e = G.edges(r.pts)[ne.i]
      const side = (p[0] - ne.q[0]) * e.nin[0] + (p[1] - ne.q[1]) * e.nin[1]
      const score = ne.d - (side > 0 ? 0.01 : 0)
      if (!best || score < best.score) best = { room: r, edge: ne.i, t: ne.t, score }
    }
    return best
  }
  const openingAt = (p: Pt, e: { altKey: boolean }, kind: OpeningKind): Omit<Opening, 'id'> | null => {
    const s = wallSpot(p, Math.max(1.5, 20 / S))
    if (!s) return null
    const len = G.edges(s.room.pts)[s.edge].len
    const t0 = snapOn(e) ? G.snapGrid(s.t * len, 0.25) / len : s.t
    return E.newOpening(s.room, s.edge, t0, kind)
  }
  const furnById = (id: number) => floor.furniture.find((f) => f.id === id)

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e)
    const hit = hitOf(e.target)
    const start = (drag: Drag) => {
      gesture.current = { drag, sx: e.clientX, sy: e.clientY, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (e.button === 1 || e.button === 2 || space) return start({ kind: 'pan', sx: e.clientX, sy: e.clientY, view })
    if (e.button !== 0) return
    const tool = v.tool
    if (tool === 'room') return start({ kind: 'rect', p0: snapP(p, e).p })
    if (tool === 'split') return start({ kind: 'split', p0: snapP(p, e).p })
    if (tool === 'door' || tool === 'window' || tool === 'slider' || tool === 'open') {
      const op = openingAt(p, e, tool)
      if (op) commit((_p, f, next) => E.addOpening(f, op, next))
      return
    }
    if (tool === 'furniture') {
      const room = floor.rooms.find((r) => G.pointInPoly(r.pts, p[0], p[1]))
      const accessible = accessibleRoom(room?.name ?? '', cabinTypeOf(o.name, o.params, otherNames), o.name)
      const base = { ...makeFurniture(v.furnType, p[0], p[1], 0), ...fixtureDefaults(v.furnType, accessible) }
      const at = placeFurn(base, p, e)
      commit((_p, f, next) => E.addFurniture(f, { ...base, ...at }, next))
      return
    }
    // select tool
    if (hit.handle && hit.furniture != null) return start({ kind: hit.handle === 'size' ? 'size' : 'rot', fid: hit.furniture })
    if (hit.vertex != null && hit.room != null) {
      const room = floor.rooms.find((r) => r.id === hit.room)
      if (!room) return
      const pts = inserted?.rid === room.id ? inserted.pts : room.pts
      return start({ kind: 'vertex', rid: room.id, i: hit.vertex, pts })
    }
    if (hit.edge != null && hit.room != null && hit.room === v.sel.room) {
      const room = floor.rooms.find((r) => r.id === hit.room)
      if (!room) return
      const ed = G.edges(room.pts)[hit.edge]
      return start({ kind: 'edge', rid: room.id, edge: hit.edge, p0: p, nin: ed.nin, a: ed.a })
    }
    if (hit.opening != null) {
      v.select({ opening: hit.opening })
      return start({ kind: 'opening', oid: hit.opening })
    }
    if (hit.furniture != null) {
      const it = furnById(hit.furniture)
      if (!it) return
      v.select({ furniture: it.id })
      return start({ kind: 'furn', fid: it.id, off: [it.x - p[0], it.z - p[1]] })
    }
    if (hit.room != null) {
      if (v.sel.room === hit.room) return start({ kind: 'move', rid: hit.room, p0: p })
      setInserted(null)
      v.select({ room: hit.room })
      return
    }
    setInserted(null)
    v.select({})
    start({ kind: 'pan', sx: e.clientX, sy: e.clientY, view })
  }

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e)
    const g = gesture.current
    if (!g) return hover(p, e)
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < CLICK_PX) return
    g.moved = true
    const d = g.drag
    if (d.kind === 'pan') {
      v.setView({ ...d.view, cx: d.view.cx - (e.clientX - d.sx) / S, cz: d.view.cz - (e.clientY - d.sy) / S })
      return
    }
    if (d.kind === 'rect') {
      const q = snapP(p, e)
      setPreview({ poly: G.rectFrom2(d.p0, q.p), pt: q.p, snapKind: q.kind })
      g.last = { p: q.p, snap: true }
      return
    }
    if (d.kind === 'split') {
      const q = snapP(p, e)
      setPreview({ line: [d.p0, q.p], pt: q.p, snapKind: q.kind })
      g.last = { p: q.p, snap: true }
      return
    }
    if (d.kind === 'vertex') {
      const q = snapP(p, e, d.rid)
      const pts = d.pts.map((x, k): Pt => (k === d.i ? q.p : [x[0], x[1]]))
      setPreview({ rooms: floor.rooms.map((r) => (r.id === d.rid ? { ...r, pts } : r)), pt: q.p, snapKind: q.kind })
      g.last = { p: q.p, snap: true }
      return
    }
    if (d.kind === 'edge') {
      let del = (p[0] - d.p0[0]) * d.nin[0] + (p[1] - d.p0[1]) * d.nin[1]
      if (snapOn(e)) {
        if (Math.abs(d.nin[0]) > 1 - 1e-6) del = (G.snapGrid(d.a[0] + d.nin[0] * del, GRID_FT) - d.a[0]) / d.nin[0]
        else if (Math.abs(d.nin[1]) > 1 - 1e-6) del = (G.snapGrid(d.a[1] + d.nin[1] * del, GRID_FT) - d.a[1]) / d.nin[1]
        else del = G.snapGrid(del, 0.25)
      }
      setPreview({ rooms: E.movedWall(floor, d.rid, d.edge, del), text: `Wall moved ${fmtLen(Math.abs(del))}` })
      g.last = { p: [del, 0], snap: false }
      return
    }
    if (d.kind === 'move') {
      let dx = p[0] - d.p0[0]
      let dz = p[1] - d.p0[1]
      if (snapOn(e)) {
        dx = G.snapGrid(dx, GRID_FT)
        dz = G.snapGrid(dz, GRID_FT)
      }
      setPreview({ rooms: floor.rooms.map((r) => (r.id === d.rid ? { ...r, pts: G.translate(r.pts, dx, dz) } : r)) })
      g.last = { p: [dx, dz], snap: false }
      return
    }
    if (d.kind === 'opening') {
      const op = floor.openings.find((x) => x.id === d.oid)
      const room = op && floor.rooms.find((r) => r.id === op.room)
      if (!op || !room) return
      const ed = G.edges(room.pts)[op.edge]
      let s = (p[0] - ed.a[0]) * ed.dir[0] + (p[1] - ed.a[1]) * ed.dir[1]
      if (snapOn(e)) s = G.snapGrid(s, 0.25)
      const pos = op.width >= ed.len ? 0.5 : Math.max(op.width / 2 / ed.len, Math.min(1 - op.width / 2 / ed.len, s / ed.len))
      setPreview({ opening: { ...op, pos } })
      return
    }
    const it = furnById(d.fid)
    if (!it) return
    if (d.kind === 'furn') setPreview({ furniture: { ...it, ...placeFurn(it, [p[0] + d.off[0], p[1] + d.off[1]], e) } })
    else if (d.kind === 'rot') {
      let deg = (Math.atan2(p[1] - it.z, p[0] - it.x) * 180) / Math.PI + 90
      if (snapOn(e)) deg = Math.round(deg / 15) * 15
      setPreview({ furniture: { ...it, rot: ((deg % 360) + 360) % 360 } })
    } else {
      const a = (it.rot * Math.PI) / 180
      const u = (p[0] - it.x) * Math.cos(a) + (p[1] - it.z) * Math.sin(a)
      const w = -(p[0] - it.x) * Math.sin(a) + (p[1] - it.z) * Math.cos(a)
      const snap = (x: number) => (snapOn(e) ? G.snapGrid(x, FURN_GRID_FT) : r2(x))
      const ww = Math.max(0.5, Math.min(30, snap(2 * Math.abs(u))))
      const dd = FURNITURE[it.type]?.resizable === 'w' ? it.d : Math.max(0.5, Math.min(30, snap(2 * Math.abs(w))))
      setPreview({ furniture: { ...it, w: ww, d: dd } })
    }
  }

  /** What the tool would do under the pointer, with no button down. */
  const hover = (p: Pt, e: { altKey: boolean }) => {
    const tool = v.tool
    if (tool === 'room' && draft) setPreview({ poly: [...draft, snapP(p, e).p] })
    else if (tool === 'room' || tool === 'split') {
      const q = snapP(p, e)
      setPreview({ pt: q.p, snapKind: q.kind })
    } else if (tool === 'door' || tool === 'window' || tool === 'slider' || tool === 'open') {
      const op = openingAt(p, e, tool)
      setPreview(op ? { ghostOpening: op } : {})
    } else if (tool === 'furniture') {
      const base = makeFurniture(v.furnType, p[0], p[1], 0)
      setPreview({ ghostFurniture: { ...base, ...placeFurn(base, p, e) } })
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    const d = g.drag
    if (d.kind === 'pan') return
    if (d.kind === 'rect') {
      if (g.moved && g.last) return commitRoom(G.rectFrom2(d.p0, g.last.p))
      return draftClick(d.p0)
    }
    if (d.kind === 'split') {
      if (g.moved && g.last) commit((pp, f, next) => E.splitRooms(pp, fi, f, d.p0, g.last!.p, next))
      else setPreview({})
      return
    }
    if (!g.moved) {
      setPreview({})
      return
    }
    if (d.kind === 'vertex' && g.last) {
      const at = g.last.p
      setInserted(null)
      commit((pp, f, next) => E.moveCorner(pp, fi, f, d.rid, d.pts, d.i, at, next))
    } else if (d.kind === 'edge' && g.last) {
      const del = g.last.p[0]
      commit((pp, f, next) => E.moveWall(pp, fi, f, d.rid, d.edge, del, next))
    } else if (d.kind === 'move' && g.last) {
      const [dx, dz] = g.last.p
      commit((pp, f, next) => E.moveRoom(pp, fi, f, d.rid, dx, dz, next))
    } else if (d.kind === 'opening' && preview.opening) {
      const pos = preview.opening.pos
      commit((_pp, f, next) => E.updateOpening(f, d.oid, { pos }, next))
    } else if ((d.kind === 'furn' || d.kind === 'rot' || d.kind === 'size') && preview.furniture) {
      const { x, z, rot, w, d: dd } = preview.furniture
      commit((_pp, f, next) => E.updateFurniture(f, d.fid, { x, z, rot, w, d: dd }, next))
    } else setPreview({})
  }

  /** A click with the room tool adds a corner to the polygon being drawn; a click on its first corner closes it. */
  const draftClick = (p: Pt) => {
    if (!draft) {
      setDraft([p])
      setPreview({ poly: [p] })
      return
    }
    if (draft.length >= 3 && Math.hypot(draft[0][0] - p[0], draft[0][1] - p[1]) * S <= SNAP_PX) return commitRoom(draft)
    const last = draft[draft.length - 1]
    setDraft(Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.01 ? [...draft, p] : draft)
  }

  const onDoubleClick = (e: RMouseEvent<SVGSVGElement>) => {
    if (v.tool !== 'select') return
    const hit = hitOf(e.target)
    if (hit.room == null || hit.room !== v.sel.room) return
    const room = floor.rooms.find((r) => r.id === hit.room)
    if (!room) return
    if (hit.vertex != null) {
      const i = hit.vertex
      setInserted(null)
      commit((pp, f, next) => E.removeCorner(pp, fi, f, room.id, i, next))
    } else if (hit.edge != null) {
      const base = inserted?.rid === room.id ? inserted.pts : room.pts
      const q = G.distToSeg(snapP(toPlan(e), e, room.id).p, base[hit.edge], base[(hit.edge + 1) % base.length]).q
      const pts = E.withCornerOnEdge(base, hit.edge, q)
      if (pts) {
        setInserted({ rid: room.id, pts })
        setPreview({ rooms: floor.rooms.map((r) => (r.id === room.id ? { ...r, pts } : r)) })
      }
    }
  }

  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    const p = toPlan(e)
    const k = Math.exp(-e.deltaY * 0.0015)
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, S * k))
    const f = S / scale
    v.setView({ scale, cx: p[0] - (p[0] - view.cx) * f, cz: p[1] - (p[1] - view.cz) * f })
  }

  const cursor = space || gesture.current?.drag.kind === 'pan' ? 'grab' : v.tool === 'select' ? 'default' : 'crosshair'
  return (
    <div className="int-canvas" ref={wrap}>
      <svg
        width={size.w}
        height={size.h}
        data-testid="interior-plan"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null
          setPreview({})
        }}
        onPointerLeave={() => !gesture.current && setPreview(draft ? { poly: draft } : {})}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <PlanLayers params={o.params} fi={fi} floor={floor} t={t} width={size.w} height={size.h} sel={v.sel} preview={preview.rooms || !inserted ? preview : { ...preview, rooms: floor.rooms.map((r) => (r.id === inserted.rid ? { ...r, pts: inserted.pts } : r)) }} grid />
      </svg>
    </div>
  )
}
