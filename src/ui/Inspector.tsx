import { useShallow } from 'zustand/react/shallow'
import { num } from '../buildings/footprint'
import { ftToM, mToFt } from '../site/units'
import { isObjectLocked, pickedPartOf, usePlanStore } from '../store/planStore'
import { LAYER_NAMES, layerOf } from '../store/types'
import { NumField, TextField } from './fields'
import { OpeningsPanel } from '../buildings/openings/OpeningsPanel'
import { PartInspector } from '../buildings/parts/PartInspector'
import { RailingsPanel } from '../buildings/rails/RailingsPanel'
import { useInteriorView } from '../interiors/editor/interiorView'
import { PathPiecePanel } from '../paths/PathPanels'
import { LevelsPanel } from '../buildings/parts/LevelsPanel'
import { ExteriorPanel } from '../buildings/paint/ExteriorPanel'
import { RoofFields, ShapeFields } from './ShapeFields'
import { PAD_TYPES } from '../buildings/parts/shapeEdits'
import { buildingMasses } from '../buildings/masses'

const TYPE_NAMES: Record<string, string> = { house: 'Cabin', pad: 'Pad or path', tree: 'Tree', bridge: 'Boardwalk', deck: 'Deck' }

/** Settings for the selected object; several selected shows a summary. */
export function Inspector() {
  const selection = usePlanStore((s) => s.selection)
  if (selection.length > 1) return <MultiInspector ids={selection} />
  return <SingleInspector id={selection[0]} />
}

function SingleInspector({ id }: { readonly id: string }) {
  const o = usePlanStore((s) => s.plan.objects[id])
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const layerLocked = usePlanStore((s) => (o ? s.layers[layerOf(o)].locked : false))
  const part = usePlanStore(pickedPartOf)
  const picked = part?.objectId === id ? part.mass : null
  const a = usePlanStore(
    useShallow((s) => ({
      rename: s.renameObject, move: s.moveObject, rotate: s.rotateObject, resize: s.resizeObject,
      params: s.setObjectParams, setLocked: s.setLocked, setLabelVisible: s.setLabelVisible, setHidden: s.setHidden, del: s.deleteObjects,
    })),
  )
  if (!o) return null
  const w = num(o.params.w, 10)
  const d = num(o.params.d, 10)
  const h = num(o.params.h, 1)
  const color = typeof o.params.color === 'string' ? o.params.color : '#b8b0a0'
  const dis = locked
  const sizeable = o.type !== 'bridge'
  return (
    <section className="panel inspector" aria-label="Inspector">
      <header>
        <TextField label="Name" value={o.name} disabled={dis} onCommit={(v) => a.rename(id, v)} />
        <div className="muted small">
          {TYPE_NAMES[o.type] ?? o.type} · {LAYER_NAMES[layerOf(o)]}
        </div>
      </header>
      {picked !== null && <PartInspector id={id} mass={picked} />}
      {picked === null && (
        <div className="grid2">
          <NumField label="East" unit="ft" value={mToFt(o.position.x)} disabled={dis} onCommit={(v) => a.move(id, { x: ftToM(v), n: o.position.n })} />
          <NumField label="North" unit="ft" value={mToFt(o.position.n)} disabled={dis} onCommit={(v) => a.move(id, { x: o.position.x, n: ftToM(v) })} />
          <NumField label="Rotation" unit="°" value={o.rotation} disabled={dis} onCommit={(v) => a.rotate(id, v)} />
          <NumField label="Height" unit="ft" value={h} disabled={dis} min={0.1} onCommit={(v) => a.params(id, { h: v })} />
          {sizeable && <NumField label="Width" unit="ft" value={w} disabled={dis} min={1} onCommit={(v) => a.resize(id, { w: v, d })} />}
          {sizeable && <NumField label="Depth" unit="ft" value={d} disabled={dis} min={1} onCommit={(v) => a.resize(id, { w, d: v })} />}
        </div>
      )}
      {picked === null && o.type === 'house' && (
        <>
          <ShapeFields p={o.params} pad={false} disabled={dis} set={(patch) => a.params(id, patch)} />
          <RoofFields m={buildingMasses(o.params)[0]} disabled={dis} set={(patch) => a.params(id, patch)} />
        </>
      )}
      {picked === null && PAD_TYPES.has(o.type) && typeof o.params.kind !== 'string' && (
        <ShapeFields p={o.params} pad cars={o.type === 'pad'} disabled={dis} set={(patch) => a.params(id, patch)} />
      )}
      {picked === null && (
        <label className="row">
          <span>Colour</span>
          <input type="color" value={color} disabled={dis} onChange={(e) => a.params(id, { color: e.target.value })} />
        </label>
      )}
      <label className="row">
        <input type="checkbox" checked={o.locked} onChange={(e) => a.setLocked(id, e.target.checked)} />
        <span>Locked{layerLocked ? ' (layer is locked too)' : ''}</span>
      </label>
      <label className="row">
        <input type="checkbox" checked={o.labelVisible} onChange={(e) => a.setLabelVisible(id, e.target.checked)} />
        <span>Show name</span>
      </label>
      <div className="actions">
        <button onClick={() => a.setHidden(id, true)}>Hide</button>
        <button className="danger" disabled={dis} onClick={() => a.del([id])}>
          Delete
        </button>
      </div>
      {locked && <p className="muted small">Locked: select to read, unlock to edit.</p>}
      {o.type === 'house' && (
        <button data-testid="open-interior" onClick={() => useInteriorView.getState().open(id)}>
          Interior: rooms and furniture
        </button>
      )}
      {o.type === 'pad' && <PathPiecePanel o={o} />}
      {o.type === 'house' && <OpeningsPanel id={id} />}
      {(o.type === 'house' || o.type === 'deck') && <RailingsPanel id={id} />}
      {(o.type === 'house' || o.type === 'deck') && <ExteriorPanel id={id} />}
      {(o.type === 'house' || o.type === 'deck') && <LevelsPanel o={o} />}
    </section>
  )
}

function MultiInspector({ ids }: { readonly ids: readonly string[] }) {
  const setLocked = usePlanStore((s) => s.setLocked)
  const del = usePlanStore((s) => s.deleteObjects)
  const names = usePlanStore(useShallow((s) => ids.map((id) => s.plan.objects[id]?.name ?? '')))
  return (
    <section className="panel inspector" aria-label="Inspector">
      <header>
        <strong>{ids.length} selected</strong>
      </header>
      <ul className="list">
        {names.map((n, i) => (
          <li key={ids[i]}>{n}</li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={() => ids.forEach((id) => setLocked(id, true))}>Lock all selected</button>
        <button onClick={() => ids.forEach((id) => setLocked(id, false))}>Unlock</button>
        <button className="danger" onClick={() => del(ids)}>
          Delete
        </button>
      </div>
    </section>
  )
}
