import { useEffect } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from 'lucide-react'
import type { AlignMode } from '../tools/arrange'
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
import { InspectorSection, useOpenSections } from './InspectorSection'
import { selectionStats } from './selectionStats'
import { ClearanceStats } from '../site/rules/ClearanceStats'
import { requestDelete } from '../guide/confirm'
import { useBeginner } from '../guide/mode'
import { Term } from '../guide/Term'
import { Tip } from '../guide/Tip'

const TYPE_NAMES: Record<string, string> = { house: 'Cabin', pad: 'Pad or path', tree: 'Tree', bridge: 'Boardwalk', deck: 'Deck' }

/** Settings for the selected object; several selected shows a summary. */
export function Inspector() {
  const selection = usePlanStore((s) => s.selection)
  if (selection.length > 1) return <MultiInspector ids={selection} />
  return <SingleInspector id={selection[0]} />
}

function SingleInspector({ id }: { readonly id: string }) {
  const o = usePlanStore((s) => s.plan.objects[id])
  const terrain = usePlanStore((s) => s.site.terrain)
  // Paint mode works through the Exterior panel, which sits under Look: open it when Paint turns on
  const painting = usePlanStore((s) => s.painting)
  useEffect(() => {
    if (painting) useOpenSections.getState().setOpen('look', true)
  }, [painting])
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const layerLocked = usePlanStore((s) => (o ? s.layers[layerOf(o)].locked : false))
  const part = usePlanStore(pickedPartOf)
  const picked = part?.objectId === id ? part.mass : null
  const beginner = useBeginner()
  const a = usePlanStore(
    useShallow((s) => ({
      rename: s.renameObject, move: s.moveObject, rotate: s.rotateObject, resize: s.resizeObject,
      params: s.setObjectParams, setLocked: s.setLocked, setLabelVisible: s.setLabelVisible, setHidden: s.setHidden,
    })),
  )
  if (!o) return null
  const w = num(o.params.w, 10)
  const d = num(o.params.d, 10)
  const h = num(o.params.h, 1)
  const color = typeof o.params.color === 'string' ? o.params.color : '#b8b0a0'
  const dis = locked
  const sizeable = o.type !== 'bridge'
  const stats = selectionStats(o, terrain)
  return (
    <section className="panel inspector" aria-label="Inspector">
      <header>
        <TextField label="Name" value={o.name} disabled={dis} onCommit={(v) => a.rename(id, v)} />
        <div className="muted small">
          {TYPE_NAMES[o.type] ?? o.type} · {LAYER_NAMES[layerOf(o)]}
        </div>
        <div className="stats small" data-testid="selection-stats">
          {Math.round(stats.areaSqFt).toLocaleString('en-US')} sq ft · floor {stats.floorFt.toFixed(1)} ft · ground {stats.lowestGroundFt.toFixed(1)} ft <Term term="navd88">NAVD88</Term>
        </div>
        <ClearanceStats id={id} />
        {locked && <p className="muted small">Locked: select to read, unlock to edit.</p>}
      </header>
      {o.type === 'house' && (
        <button data-testid="open-interior" onClick={() => useInteriorView.getState().open(id)}>
          Interior: rooms and furniture (I)
        </button>
      )}
      {picked !== null && <PartInspector id={id} mass={picked} />}
      {picked === null && (
        <InspectorSection id="placement" title="Placement" tourAnchor="placement">
          {beginner && <p className="muted small">East and North are feet from the centre of the lot. Or drag it in the view.</p>}
          <div className="grid2">
            <NumField label="East" unit="ft" value={mToFt(o.position.x)} disabled={dis} onCommit={(v) => a.move(id, { x: ftToM(v), n: o.position.n })} />
            <NumField label="North" unit="ft" value={mToFt(o.position.n)} disabled={dis} onCommit={(v) => a.move(id, { x: o.position.x, n: ftToM(v) })} />
            <NumField label={beginner ? 'Turned' : 'Rotation'} unit="°" value={o.rotation} disabled={dis} onCommit={(v) => a.rotate(id, v)} />
          </div>
        </InspectorSection>
      )}
      {picked === null && (
        <InspectorSection id="size" title="Size and shape">
          <div className="grid2">
            <NumField label={beginner ? (o.type === 'house' ? 'How tall the walls are' : 'How tall') : 'Height'} unit="ft" value={h} disabled={dis} min={0.1} onCommit={(v) => a.params(id, { h: v })} />
            {sizeable && <NumField label="Width" unit="ft" value={w} disabled={dis} min={1} onCommit={(v) => a.resize(id, { w: v, d })} />}
            {sizeable && <NumField label="Depth" unit="ft" value={d} disabled={dis} min={1} onCommit={(v) => a.resize(id, { w, d: v })} />}
          </div>
          {o.type === 'house' && <ShapeFields p={o.params} pad={false} disabled={dis} set={(patch) => a.params(id, patch)} />}
          {PAD_TYPES.has(o.type) && typeof o.params.kind !== 'string' && (
            <ShapeFields p={o.params} pad cars={o.type === 'pad'} disabled={dis} set={(patch) => a.params(id, patch)} />
          )}
        </InspectorSection>
      )}
      {picked === null && o.type === 'house' && (
        <InspectorSection id="roof" title="Roof">
          <RoofFields m={buildingMasses(o.params)[0]} disabled={dis} set={(patch) => a.params(id, patch)} />
        </InspectorSection>
      )}
      {o.type === 'pad' && (
        <InspectorSection id="path" title="Path piece">
          <PathPiecePanel o={o} />
        </InspectorSection>
      )}
      <InspectorSection id="look" title="Look">
        {picked === null && (
          <label className="row">
            <span>Colour</span>
            <input type="color" value={color} disabled={dis} onChange={(e) => a.params(id, { color: e.target.value })} />
          </label>
        )}
        {(o.type === 'house' || o.type === 'deck') && <ExteriorPanel id={id} />}
      </InspectorSection>
      {o.type === 'house' && <OpeningsPanel id={id} />}
      {(o.type === 'house' || o.type === 'deck') && <RailingsPanel id={id} />}
      {(o.type === 'house' || o.type === 'deck') && (
        <InspectorSection id="levels" title="Levels and junctions">
          <LevelsPanel o={o} />
        </InspectorSection>
      )}
      <InspectorSection id="visibility" title="Visibility and lock">
        <label className="row" data-tour="lock">
          <input type="checkbox" checked={o.locked} data-testid="object-locked" onChange={(e) => a.setLocked(id, e.target.checked)} />
          <span>Locked{layerLocked ? ' (layer is locked too)' : ''}</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={o.labelVisible} onChange={(e) => a.setLabelVisible(id, e.target.checked)} />
          <span>Show name</span>
        </label>
        <div className="actions">
          <button onClick={() => a.setHidden(id, true)}>Hide</button>
          <button className="danger" disabled={dis} onClick={() => requestDelete([id])} data-testid="delete-object">
            Delete
          </button>
        </div>
      </InspectorSection>
    </section>
  )
}

function MultiInspector({ ids }: { readonly ids: readonly string[] }) {
  const setLocked = usePlanStore((s) => s.setLocked)
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
      <AlignButtons ids={ids} />
      <div className="actions">
        <button onClick={() => ids.forEach((id) => setLocked(id, true))}>Lock all selected</button>
        <button onClick={() => ids.forEach((id) => setLocked(id, false))}>Unlock</button>
        <button className="danger" onClick={() => requestDelete(ids)}>
          Delete
        </button>
      </div>
    </section>
  )
}

const ALIGN: readonly { readonly mode: AlignMode; readonly label: string; readonly Icon: LucideIcon }[] = [
  { mode: 'west', label: 'Align west edges', Icon: AlignStartVertical },
  { mode: 'centre-x', label: 'Align centres east-west', Icon: AlignCenterVertical },
  { mode: 'east', label: 'Align east edges', Icon: AlignEndVertical },
  { mode: 'north', label: 'Align north edges', Icon: AlignStartHorizontal },
  { mode: 'centre-n', label: 'Align centres north-south', Icon: AlignCenterHorizontal },
  { mode: 'south', label: 'Align south edges', Icon: AlignEndHorizontal },
]

/** Align and distribute for several selected objects (4B): each is one undo step, and locked objects stay put. */
function AlignButtons({ ids }: { readonly ids: readonly string[] }) {
  const align = usePlanStore((s) => s.alignObjects)
  const spread = usePlanStore((s) => s.distributeObjects)
  return (
    <div className="align-row" role="group" aria-label="Align and distribute">
      {ALIGN.map(({ mode, label, Icon }) => (
        <Tip key={mode} label={label}>
          <button type="button" className="tool-button" aria-label={label} data-testid={`align-${mode}`} onClick={() => align(ids, mode)}>
            <Icon size={16} aria-hidden="true" />
          </button>
        </Tip>
      ))}
      {ids.length > 2 && (
        <>
          <Tip label="Space evenly east-west">
            <button type="button" className="tool-button" aria-label="Space evenly east-west" data-testid="distribute-x" onClick={() => spread(ids, 'x')}>
              <AlignHorizontalDistributeCenter size={16} aria-hidden="true" />
            </button>
          </Tip>
          <Tip label="Space evenly north-south">
            <button type="button" className="tool-button" aria-label="Space evenly north-south" data-testid="distribute-n" onClick={() => spread(ids, 'n')}>
              <AlignVerticalDistributeCenter size={16} aria-hidden="true" />
            </button>
          </Tip>
        </>
      )}
    </div>
  )
}
