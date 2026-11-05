import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo } from 'react'
import * as E from '../edits'
import { readFloors } from '../model'
import { upperFloorBlocked } from '../../store/interiorActions'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import { InteriorPanel } from './InteriorPanel'
import { useInteriorView, type InteriorTool } from './interiorView'
import { PlanCanvas } from './PlanCanvas'

const TOOLS: readonly { readonly id: InteriorTool; readonly label: string; readonly key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'room', label: 'Room', key: 'B' },
  { id: 'split', label: 'Split', key: 'S' },
  { id: 'door', label: 'Door', key: 'D' },
  { id: 'window', label: 'Window', key: 'W' },
  { id: 'slider', label: 'Slider', key: 'L' },
  { id: 'open', label: 'Opening', key: 'O' },
]

/** Arrow-key nudge, feet: furniture, then rooms; Shift for the bigger step. */
const NUDGE_FURN = [0.25, 1] as const
const NUDGE_ROOM = [0.5, 2] as const

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/**
 * The interior editor for one cabin (old interior overlay): its floor plan
 * over the whole window, the tools and floors along the top, and the
 * panels down the side. Every change is a plan edit, so undo, redo, locks
 * and saving work as they do everywhere else.
 */
export function InteriorEditor() {
  const v = useInteriorView()
  const o = usePlanStore((s) => (v.objectId ? s.plan.objects[v.objectId] : undefined))
  const locked = usePlanStore((s) => (v.objectId ? isObjectLocked(s, v.objectId) : false))
  const a = usePlanStore(useShallow((s) => ({ addFloor: s.addFloor, removeFloor: s.removeFloor, renameFloor: s.renameFloor, editFloor: s.editFloor })))
  const floors = useMemo(() => (o ? readFloors(o.params) : []), [o])
  const gone = !!v.objectId && (!o || o.type !== 'house')
  useEffect(() => {
    if (gone) v.close()
  }, [gone, v])
  if (v.fi >= floors.length && floors.length) v.setFloor(floors.length - 1)

  useEffect(() => {
    if (!o) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return
      const s = useInteriorView.getState()
      const fi = s.fi
      const run = (op: Parameters<typeof a.editFloor>[2]) => {
        const sel = a.editFloor(o.id, fi, op)
        if (sel) s.select(sel)
      }
      const tool = TOOLS.find((t) => t.key === e.key.toUpperCase())
      if (tool && !e.altKey) {
        e.preventDefault()
        s.setTool(tool.id)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (s.tool !== 'select') s.setTool('select')
        else if (s.sel.room != null || s.sel.opening != null || s.sel.furniture != null) s.select({})
        else s.close()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const { room, opening, furniture } = s.sel
        if (opening != null) run((_p, f, n) => E.deleteOpening(f, opening, n))
        else if (furniture != null) run((_p, f, n) => E.deleteFurniture(f, furniture, n))
        else if (room != null) run((_p, f, n) => E.deleteRoom(f, room, n))
        return
      }
      const fid = s.sel.furniture
      if (fid != null && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        run((_p, f, n) => {
          const it = f.furniture.find((x) => x.id === fid)
          return it ? E.updateFurniture(f, fid, { rot: (it.rot + (e.shiftKey ? 270 : 90)) % 360 }, n) : { ok: false, message: 'No such piece' }
        })
        return
      }
      if (fid != null && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        run((_p, f, n) => E.updateFurniture(f, fid, { mirror: !f.furniture.find((x) => x.id === fid)?.mirror }, n))
        return
      }
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const d = dir[e.key]
      if (!d) return
      e.preventDefault()
      const big = e.shiftKey ? 1 : 0
      if (fid != null) {
        const k = NUDGE_FURN[big]
        run((_p, f, n) => {
          const it = f.furniture.find((x) => x.id === fid)
          return it ? E.updateFurniture(f, fid, { x: it.x + d[0] * k, z: it.z + d[1] * k }, n) : { ok: false, message: 'No such piece' }
        })
      } else if (s.sel.room != null) {
        const k = NUDGE_ROOM[big]
        const rid = s.sel.room
        run((p, f, n) => E.moveRoom(p, fi, f, rid, d[0] * k, d[1] * k, n))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [o, a])

  if (!o || o.type !== 'house') return null
  const fi = Math.min(v.fi, floors.length - 1)
  const blocked = upperFloorBlocked(o)
  return (
    <div className="int-editor" role="dialog" aria-label={`Interior of ${o.name}`}>
      <header className="int-bar">
        <strong>Interior · {o.name}</strong>
        <nav className="int-floors" aria-label="Floors">
          {floors.map((f, i) => (
            <button
              key={i}
              className={i === fi ? 'on' : ''}
              onClick={() => v.setFloor(i)}
              onDoubleClick={() => {
                const name = window.prompt('Floor name', f.name)
                if (name) a.renameFloor(o.id, i, name)
              }}
              title="Double-click to rename"
            >
              {f.name}
            </button>
          ))}
          {floors.length < 2 && (
            <button
              disabled={locked}
              title={blocked ?? 'Add an upper floor'}
              data-testid="add-floor"
              onClick={() => {
                const i = a.addFloor(o.id)
                if (i != null) v.setFloor(i)
              }}
            >
              + Upper floor
            </button>
          )}
          {fi >= 1 && (
            <button
              disabled={locked}
              onClick={() => {
                if (window.confirm(`Remove ${floors[fi].name} and everything on it?`)) {
                  a.removeFloor(o.id, fi)
                  v.setFloor(0)
                }
              }}
            >
              Remove floor
            </button>
          )}
        </nav>
        <nav className="int-tools" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={v.tool === t.id ? 'on' : ''} onClick={() => v.setTool(t.id)} title={`${t.label} (${t.key})`} data-testid={`tool-${t.id}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <label className="int-snap">
          <input type="checkbox" checked={v.snap} onChange={(e) => v.setSnap(e.target.checked)} /> Snap
        </label>
        <button onClick={() => v.setView(null)}>Fit</button>
        <button className="int-close" onClick={() => v.close()} data-testid="interior-close">
          Back to 3D
        </button>
      </header>
      <div className="int-body">
        <PlanCanvas o={o} />
        <InteriorPanel o={o} />
      </div>
    </div>
  )
}
