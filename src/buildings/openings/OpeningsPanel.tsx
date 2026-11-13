import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildingMasses } from '../masses'
import { fitMass, massWalls } from './openingEdits'
import { FIT, asKind, type CutData, type FitNote, type PlacedOpening } from './openingLayout'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import { FeetInchesField } from '../../ui/FeetInchesField'
import { formatLengthField } from '../../ui/feetInches'
import { InspectorSection } from '../../ui/InspectorSection'
import { Tip } from '../../guide/Tip'

const KINDS = [
  { id: 'window', label: 'Window' },
  { id: 'slider', label: 'Slider' },
  { id: 'door', label: 'Door' },
  { id: 'cutout', label: 'Cut-out' },
] as const

const NEW_CUT: Record<string, Omit<CutData, 'edge' | 'x'>> = {
  window: { kind: 'window', w: 3, h: 4, sill: 3 },
  door: { kind: 'door', w: 3, h: 7, sill: 0 },
  slider: { kind: 'slider', w: 8, h: 7, sill: 0 },
}

/** Pick a wall of a cabin and edit its openings to the inch; everything is fitted by the shared rules. */
export function OpeningsPanel({ id }: { readonly id: string }) {
  const params = usePlanStore((s) => s.plan.objects[id]?.params)
  const locked = usePlanStore((s) => isObjectLocked(s, id))
  const focus = usePlanStore((s) => s.openingFocus)
  const a = usePlanStore(
    useShallow((s) => ({
      add: s.addOpening, update: s.updateOpening, remove: s.removeOpening, dup: s.duplicateOpening,
      centre: s.centreOpening, align: s.alignHeads, fitAll: s.fitAllOpenings, setFocus: s.setOpeningFocus,
    })),
  )
  const masses = useMemo(() => (params ? buildingMasses(params) : []), [params])
  const enclosed = masses.flatMap((m, i) => (m.kind === 'wall' ? [i] : []))
  const [mass, setMass] = useState(0)
  const [wall, setWall] = useState<number | 'along'>(0)
  const mi = enclosed.includes(mass) ? mass : 0
  const walls = useMemo(() => (params ? massWalls(params, mi) : []), [params, mi])
  const fit = useMemo(() => (params ? fitMass(params, mi) : null), [params, mi])
  if (!params || !fit) return null

  const cuts = fit.mass.cuts as CutData[]
  const hasAlong = cuts.some((c) => c.along)
  const wallSel = wall === 'along' ? (hasAlong ? 'along' : 0) : Math.min(wall, walls.length - 1)
  const length = wallSel === 'along' ? 0 : (walls[wallSel]?.lengthFt ?? 0)
  const onWall = fit.openings.filter((o) => (wallSel === 'along' ? o.along : !o.along && o.edge === wallSel))
  const broken = new Set(fit.notes.map((n) => n.id))
  const notesFor = (cutId: number) => fit.notes.filter((n) => n.id === cutId)
  const dis = locked

  const add = (kind: keyof typeof NEW_CUT) => {
    if (wallSel === 'along') return
    const c = NEW_CUT[kind]
    a.add(id, mi, { ...c, edge: wallSel, x: Math.max(0, (length - (c.w ?? 3)) / 2) })
  }

  return (
    <InspectorSection
      id="openings"
      className="openings"
      title={
        <>
          Openings <span className="muted small">{cuts.length}</span>
        </>
      }
    >
      <div className="grid2">
        {enclosed.length > 1 && (
          <label className="field">
            <span className="muted small">Part</span>
            <select value={mi} onChange={(e) => (setMass(Number(e.target.value)), setWall(0))}>
              {enclosed.map((i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'Main' : `Wing ${i}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="muted small">Wall</span>
          <select value={String(wallSel)} onChange={(e) => setWall(e.target.value === 'along' ? 'along' : Number(e.target.value))} data-testid="opening-wall">
            {walls.map((w) => (
              <option key={w.edge} value={w.edge}>
                {w.label.split(' · ')[1]} · {formatLengthField(w.lengthFt)}
              </option>
            ))}
            {hasAlong && <option value="along">curved wall</option>}
          </select>
        </label>
      </div>

      {broken.size > 0 && (
        <p className="fit-warn small">
          {broken.size === 1 ? '1 opening breaks' : `${broken.size} openings break`} the fit rules.{' '}
          <button disabled={dis} onClick={() => a.fitAll(id)}>
            Fit all
          </button>
        </p>
      )}

      {wallSel !== 'along' && <Elevation length={length} height={fit.mass.h} openings={onWall} focus={focus?.objectId === id && focus.mass === mi ? focus.cutId : null} />}

      <ul className="opening-list">
        {onWall.length === 0 && <li className="muted small">No openings on this wall.</li>}
        {onWall.map((op) => (
          <OpeningRow
            key={op.id}
            op={op}
            cut={cuts.find((c) => c.id === op.id) ?? {}}
            wallLength={length}
            notes={notesFor(op.id)}
            focused={focus?.objectId === id && focus.mass === mi && focus.cutId === op.id}
            disabled={dis}
            onFocus={() => a.setFocus({ objectId: id, mass: mi, cutId: op.id })}
            onChange={(patch) => a.update(id, mi, op.id, patch)}
            onCentre={() => a.centre(id, mi, op.id)}
            onAlign={() => a.align(id, mi, op.id)}
            onDuplicate={() => a.dup(id, mi, op.id)}
            onRemove={() => a.remove(id, mi, op.id)}
          />
        ))}
      </ul>

      {wallSel !== 'along' && (
        <div className="actions">
          <button disabled={dis} onClick={() => add('window')}>
            + Window
          </button>
          <button disabled={dis} onClick={() => add('door')}>
            + Door
          </button>
          <button disabled={dis} onClick={() => add('slider')}>
            + Slider
          </button>
        </div>
      )}
      <p className="muted small">
        Openings keep {formatLengthField(FIT.cornerFt)} from corners, {formatLengthField(FIT.gapFt)} apart and {formatLengthField(FIT.headFt)} under the eave. Lengths take 2' 9", 33 in or 2.75.
      </p>
    </InspectorSection>
  )
}

interface RowProps {
  readonly op: PlacedOpening
  readonly cut: CutData
  readonly wallLength: number
  readonly notes: readonly FitNote[]
  readonly focused: boolean
  readonly disabled: boolean
  readonly onFocus: () => void
  readonly onChange: (patch: Partial<CutData>) => void
  readonly onCentre: () => void
  readonly onAlign: () => void
  readonly onDuplicate: () => void
  readonly onRemove: () => void
}

function OpeningRow({ op, cut, wallLength, notes, focused, disabled, onFocus, onChange, onCentre, onAlign, onDuplicate, onRemove }: RowProps) {
  const head = op.sill + op.h
  const fromRight = wallLength - op.x - op.w
  const status = op.hidden ? 'behind another part, not drawn' : op.conflict ? 'overlaps another opening' : null
  return (
    <li className={`opening${focused ? ' focused' : ''}${op.conflict ? ' conflict' : ''}`} onFocusCapture={onFocus} onClick={onFocus} data-testid="opening-row">
      <div className="row between">
        <select value={asKind(cut.kind ?? op.kind)} disabled={disabled} onChange={(e) => onChange({ kind: e.target.value })} aria-label="Kind">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <span className="muted small">#{op.id}</span>
      </div>
      <div className="grid2">
        <FeetInchesField label="Width" value={op.w} min={FIT.minFt} disabled={disabled} onCommit={(w) => onChange({ w })} />
        <FeetInchesField label="Height" value={op.h} min={FIT.minFt} disabled={disabled} onCommit={(h) => onChange({ h })} />
        <FeetInchesField label="Sill" value={op.sill} disabled={disabled} onCommit={(sill) => onChange({ sill })} />
        <FeetInchesField label="Head" value={head} min={FIT.minFt} disabled={disabled} onCommit={(hd) => onChange({ h: Math.max(FIT.minFt, hd - op.sill) })} />
        {!op.along && <FeetInchesField label="From left" value={op.x} disabled={disabled} onCommit={(x) => onChange({ x })} />}
        {!op.along && <FeetInchesField label="From right" value={fromRight} disabled={disabled} onCommit={(r) => onChange({ x: wallLength - op.w - r })} />}
        <FeetInchesField label="Trim" value={op.trim} disabled={disabled} onCommit={(trim) => onChange({ trim })} />
        <label className="field">
          <span className="muted small">Mullions</span>
          <span className="row">
            <input type="number" min={0} max={8} value={op.mullV} disabled={disabled} aria-label="Upright mullions" onChange={(e) => onChange({ mullV: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            <input type="number" min={0} max={8} value={op.mullH} disabled={disabled} aria-label="Cross mullions" onChange={(e) => onChange({ mullH: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </span>
        </label>
      </div>
      {(status || notes.length > 0) && (
        <ul className="fit-notes small">
          {status && <li className="warn">{status}</li>}
          {notes.map((n, i) => (
            <li key={i}>{n.reason}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        {!op.along && (
          <button disabled={disabled} onClick={onCentre}>
            Centre
          </button>
        )}
        <Tip label="Give every other opening on this part the same head height">
          <button disabled={disabled} onClick={onAlign}>
            Align heads
          </button>
        </Tip>
        <button disabled={disabled} onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="danger" disabled={disabled} onClick={onRemove}>
          Delete
        </button>
      </div>
    </li>
  )
}

/** The wall seen from outside, to scale: its openings with their casing, conflicts in red. */
function Elevation({ length, height, openings, focus }: { readonly length: number; readonly height: number; readonly openings: readonly PlacedOpening[]; readonly focus: number | null }) {
  if (length <= 0 || height <= 0) return null
  const pad = 0.6
  const vb = `${-pad} ${-pad} ${length + pad * 2} ${height + pad * 2}`
  const y = (ft: number) => height - ft
  return (
    <svg className="elevation" viewBox={vb} role="img" aria-label="Wall elevation">
      <rect x={0} y={0} width={length} height={height} className="el-wall" />
      <rect x={FIT.cornerFt} y={FIT.headFt} width={Math.max(0, length - 2 * FIT.cornerFt)} height={height - FIT.headFt} className="el-zone" />
      {openings.map((o) => (
        <g key={o.id} className={`${o.conflict ? 'el-conflict' : ''}${o.hidden ? ' el-hidden' : ''}${focus === o.id ? ' el-focus' : ''}`}>
          <rect x={o.x - o.trim} y={y(o.sill + o.h) - o.trim} width={o.w + 2 * o.trim} height={o.h + o.trim * (o.sill >= o.trim ? 2 : 1)} className="el-trim" />
          <rect x={o.x} y={y(o.sill + o.h)} width={o.w} height={o.h} className={`el-open el-${o.kind}`} />
        </g>
      ))}
    </svg>
  )
}
