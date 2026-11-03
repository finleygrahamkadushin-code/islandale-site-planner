import { useShallow } from 'zustand/react/shallow'
import { useMemo } from 'react'
import * as E from '../../interiors/edits'
import { FURNITURE, FURNITURE_ORDER } from '../../interiors/furniture'
import { FixtureFields } from './FixtureFields'
import * as G from '../../interiors/geom'
import { readFloors } from '../../interiors/model'
import { cabinTypeOf, checkProgram, PROGRAMS } from '../../interiors/program'
import { accessibleRoom } from '../../interiors/fixtures'
import { floorStats } from '../../interiors/rooms'
import { OPENING_KINDS, OPENING_LABELS, ROOM_COLORS, ROOM_TYPES, TYPE_LABELS, type Floor, type OpeningKind, type RoomType } from '../../interiors/types'
import type { FloorEdit } from '../../store/interiorActions'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { FeetInchesField } from '../FeetInchesField'
import { NumField, TextField } from '../fields'
import { fmtArea, fmtLen } from './format'
import { useInteriorView } from './interiorView'

/**
 * The interior editor's side column (old int2/ui.js panels): the selected
 * room, opening or piece, the rooms list, floor stats, the cabin's program
 * checklist and the furniture library.
 */
export function InteriorPanel({ o }: { readonly o: PlanObject }) {
  const v = useInteriorView()
  const editFloor = usePlanStore((s) => s.editFloor)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const otherNames = usePlanStore(useShallow((s) => Object.values(s.plan.objects).filter((x) => x.id !== o.id).map((x) => x.name)))
  const floors = useMemo(() => readFloors(o.params), [o.params])
  const fi = Math.min(v.fi, floors.length - 1)
  const floor = floors[fi]
  const run = (op: FloorEdit) => {
    const sel = editFloor(o.id, fi, op)
    if (sel) v.select(sel)
  }
  const cabinType = cabinTypeOf(o.name, o.params, otherNames)
  const program = PROGRAMS[cabinType]
  const checklist = checkProgram(program, floors)
  const stats = floorStats(o.params, fi, floor)
  return (
    <aside className="int-side" aria-label="Interior panel">
      {locked && <p className="muted small">Locked: unlock the cabin to change its rooms.</p>}
      <Selected floor={floor} run={run} disabled={locked} accessibleIn={(roomName) => accessibleRoom(roomName, cabinType, o.name)} />
      <section className="panel">
        <h3>Rooms</h3>
        <ul className="int-rooms">
          {floor.rooms.map((r) => (
            <li key={r.id}>
              <button className={v.sel.room === r.id ? 'on' : ''} onClick={() => v.select({ room: r.id })}>
                <span className="swatch" style={{ background: ROOM_COLORS[r.type] }} />
                {r.name} <span className="muted">{fmtArea(G.area(r.pts))}</span>
              </button>
            </li>
          ))}
        </ul>
        {!floor.rooms.length && <p className="muted small">No rooms yet: pick Room (B) and drag a rectangle, or click corners.</p>}
      </section>
      <section className="panel" aria-label="Floor stats">
        <h3>{floor.name}</h3>
        <dl className="int-stats">
          <dt>Inside the walls</dt>
          <dd>{fmtArea(stats.envArea)}</dd>
          <dt>Rooms ({stats.nRooms})</dt>
          <dd>{fmtArea(stats.roomsArea)}</dd>
          <dt>Unassigned</dt>
          <dd>{fmtArea(stats.unassigned)}</dd>
          <dt>Circulation</dt>
          <dd>{stats.circPct}%</dd>
          {stats.porchArea > 0 && (
            <>
              <dt>Porches</dt>
              <dd>{fmtArea(stats.porchArea)}</dd>
            </>
          )}
        </dl>
      </section>
      <section className="panel" aria-label="Program">
        <h3>{program.label}</h3>
        <ul className="int-program">
          {checklist.map((row) => (
            <li key={row.key} className={row.ok ? 'ok' : 'miss'}>
              {row.ok ? '✓' : '○'} {row.label} <span className="muted">{row.room ? `${row.room.name} · ${fmtArea(row.room.area)}` : `${row.target} sf`}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-label="Furniture library">
        <h3>Furniture</h3>
        <div className="int-library">
          {FURNITURE_ORDER.map((type) => (
            <button key={type} className={v.tool === 'furniture' && v.furnType === type ? 'on' : ''} data-testid={`furn-${type}`} onClick={() => v.setFurnType(type)}>
              {FURNITURE[type].label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}

interface SelectedProps {
  readonly floor: Floor
  readonly run: (op: FloorEdit) => void
  readonly disabled: boolean
  /** Is a room of this name an accessible one (the elders' cabin, or named for access)? */
  readonly accessibleIn: (roomName: string) => boolean
}

function Selected({ floor, run, disabled, accessibleIn }: SelectedProps) {
  const sel = useInteriorView((s) => s.sel)
  const room = sel.room != null ? floor.rooms.find((r) => r.id === sel.room) : undefined
  const op = sel.opening != null ? floor.openings.find((x) => x.id === sel.opening) : undefined
  const it = sel.furniture != null ? floor.furniture.find((x) => x.id === sel.furniture) : undefined
  if (room) {
    const ob = G.obb(room.pts)
    const neighbours = floor.rooms.filter((r) => r.id !== room.id && G.sharedSegments(room.pts, r.pts).length)
    return (
      <section className="panel" aria-label="Room">
        <h3>Room</h3>
        <TextField label="Name" value={room.name} disabled={disabled} onCommit={(name) => run((_p, f, n) => E.setRoom(f, room.id, { name }, n))} />
        <label className="field">
          <span>Type</span>
          <select value={room.type} disabled={disabled} onChange={(e) => run((_p, f, n) => E.setRoom(f, room.id, { type: e.target.value as RoomType }, n))}>
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {ob ? `${fmtLen(ob.w)} × ${fmtLen(ob.d)} · ` : ''}
          {fmtArea(G.area(room.pts))}
        </p>
        {neighbours.length > 0 && (
          <label className="field">
            <span>Merge with</span>
            <select value="" disabled={disabled} onChange={(e) => e.target.value && run((p, f, n) => E.mergeRooms(p, useInteriorView.getState().fi, f, room.id, +e.target.value, n))}>
              <option value="">…</option>
              {neighbours.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button disabled={disabled} onClick={() => run((_p, f, n) => E.deleteRoom(f, room.id, n))}>
          Delete room
        </button>
      </section>
    )
  }
  if (op) {
    return (
      <section className="panel" aria-label="Opening">
        <h3>{OPENING_LABELS[op.kind]}</h3>
        <label className="field">
          <span>Kind</span>
          <select value={op.kind} disabled={disabled} onChange={(e) => run((_p, f, n) => E.updateOpening(f, op.id, { kind: e.target.value as OpeningKind }, n))}>
            {OPENING_KINDS.map((k) => (
              <option key={k} value={k}>
                {OPENING_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <FeetInchesField label="Width" value={op.width} min={1} max={20} disabled={disabled} onCommit={(width) => run((_p, f, n) => E.updateOpening(f, op.id, { width }, n))} />
        {op.kind === 'door' && (
          <div className="row">
            <button disabled={disabled} onClick={() => run((_p, f, n) => E.updateOpening(f, op.id, { flip: !op.flip }, n))}>
              Flip hinge
            </button>
            <button disabled={disabled} onClick={() => run((_p, f, n) => E.updateOpening(f, op.id, { out: !op.out }, n))}>
              Swing {op.out ? 'in' : 'out'}
            </button>
          </div>
        )}
        <button disabled={disabled} onClick={() => run((_p, f, n) => E.deleteOpening(f, op.id, n))}>
          Delete
        </button>
      </section>
    )
  }
  if (it) {
    const t = FURNITURE[it.type]
    return (
      <section className="panel" aria-label="Furniture">
        <h3>{t?.label ?? it.type}</h3>
        <FeetInchesField label="Width" value={it.w} min={0.5} max={30} disabled={disabled || !t?.resizable} onCommit={(w) => run((_p, f, n) => E.updateFurniture(f, it.id, { w }, n))} />
        <FeetInchesField label="Depth" value={it.d} min={0.5} max={30} disabled={disabled || t?.resizable !== true} onCommit={(d) => run((_p, f, n) => E.updateFurniture(f, it.id, { d }, n))} />
        <NumField label="Turn" unit="°" value={it.rot} disabled={disabled} onCommit={(rot) => run((_p, f, n) => E.updateFurniture(f, it.id, { rot: ((rot % 360) + 360) % 360 }, n))} />
        <FixtureFields it={it} roomName={roomOf(floor, it)?.name ?? ''} accessible={accessibleIn(roomOf(floor, it)?.name ?? '')} disabled={disabled} set={(next) => run((_p, f, n) => E.updateFurniture(f, it.id, next, n))} />
        <div className="row">
          <button disabled={disabled} onClick={() => run((_p, f, n) => E.updateFurniture(f, it.id, { mirror: !it.mirror }, n))}>
            Mirror
          </button>
          <button disabled={disabled} onClick={() => run((_p, f, n) => E.duplicateFurniture(f, it.id, n))}>
            Duplicate
          </button>
          <button disabled={disabled} onClick={() => run((_p, f, n) => E.deleteFurniture(f, it.id, n))}>
            Delete
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="panel">
      <p className="muted small">Click a room, door or piece of furniture to edit it. Click a selected room again and drag to move it; drag its corners and walls to reshape it.</p>
    </section>
  )
}

const roomOf = (floor: Floor, it: { x: number; z: number }) => floor.rooms.find((r) => G.pointInPoly(r.pts, it.x, it.z))
