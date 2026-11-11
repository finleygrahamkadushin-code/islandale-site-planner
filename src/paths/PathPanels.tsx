import { useShallow } from 'zustand/react/shallow'
import { num } from '../buildings/footprint'
import { isPathPiece, KIND_LABELS, PATH_KINDS, pieceEnds, pieceKind, pieceLength, pieceSlope, pieceSurface, pieceWidth, railOn, stairInfo, SURFACES, type PathKind } from './pieces'
import { elevationAt } from '../site/terrain'
import { isObjectLocked, usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { FeetInchesField } from '../ui/FeetInchesField'
import { PieceCheck } from './route/RoutePanels'
import { FT_PER_M as M_TO_FT } from '../site/units'

const fmtFt = (m: number) => `${(m * M_TO_FT).toFixed(2)} ft`
const ratio = (slope: number) => (slope > 1e-4 ? `1:${(1 / slope).toFixed(1)}` : 'level')

/** A path piece's settings and readouts (old Path piece panel): kind, surface, rails, length, width, lift, slope, risers and end levels. */
export function PathPiecePanel({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const a = usePlanStore(useShallow((s) => ({ set: s.setPieceParams, cont: s.continuePiece })))
  if (!isPathPiece(o)) return null
  const ground = (x: number, n: number) => elevationAt(terrain, x, n)
  const kind = pieceKind(o)
  const E = pieceEnds(o, ground)
  const st = kind === 'stair' ? stairInfo(o, ground) : null
  const slope = pieceSlope(o, ground)
  const rails = railOn(o, ground)
  const railSetting = o.params.rail === true ? 'on' : o.params.rail === false ? 'off' : 'auto'
  const ribbon = o.params.shape === 'ribbon'
  return (
    <section className="panel" aria-label="Path piece">
      <header>
        <strong>Path piece</strong>
      </header>
      <label className="field">
        <span className="muted small">Kind</span>
        <select value={kind} disabled={locked || ribbon} onChange={(e) => a.set(o.id, { kind: e.target.value as PathKind })}>
          {PATH_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="muted small">Surface</span>
        <select value={pieceSurface(o)} disabled={locked} onChange={(e) => a.set(o.id, { surface: e.target.value })}>
          {SURFACES.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      {kind !== 'walk' && (
        <label className="field">
          <span className="muted small">Rails</span>
          <select value={railSetting} disabled={locked} onChange={(e) => a.set(o.id, { rail: e.target.value === 'auto' ? undefined : e.target.value === 'on' })}>
            <option value="auto">auto ({rails ? 'railed' : 'none'})</option>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
        </label>
      )}
      {!ribbon && <FeetInchesField label="Length" value={pieceLength(o)} min={1} max={120} disabled={locked} onCommit={(w) => a.set(o.id, { w })} />}
      <FeetInchesField label="Width" value={pieceWidth(o)} min={2} max={20} disabled={locked} onCommit={(d) => a.set(o.id, { d })} />
      {kind === 'boardwalk' && <FeetInchesField label="Lift" value={num(o.params.lift, 0)} min={0} max={20} disabled={locked} onCommit={(lift) => a.set(o.id, { lift })} />}
      <dl className="int-stats" data-testid="piece-readout">
        <dt>End A</dt>
        <dd>{fmtFt(E.zA)}</dd>
        <dt>End B</dt>
        <dd>{fmtFt(E.zB)}</dd>
        <dt>Rise</dt>
        <dd>{fmtFt(Math.abs(E.zB - E.zA))}</dd>
        {kind !== 'stair' && kind !== 'landing' && (
          <>
            <dt>Slope</dt>
            <dd>{ratio(slope)}</dd>
          </>
        )}
        {st && (
          <>
            <dt>Risers</dt>
            <dd>
              {st.risers} × {st.riserIn.toFixed(1)} in
            </dd>
            <dt>Treads</dt>
            <dd>
              {st.treads} × {st.treadIn.toFixed(1)} in
            </dd>
          </>
        )}
        {kind !== 'walk' && (
          <>
            <dt>Rails</dt>
            <dd>{rails ? (kind === 'stair' || kind === 'ramp' ? 'handrails' : 'guards') : 'none'}</dd>
          </>
        )}
      </dl>
      {st && !st.ok && <p className="small fixture-note bad">Too short for 11 in treads: make it at least {st.minRunFt.toFixed(1)} ft long.</p>}
      {kind === 'ramp' && slope > 1 / 12 + 1e-6 && <p className="small fixture-note bad">Steeper than 1:12: lengthen it or add a landing.</p>}
      <PieceCheck o={o} />
      {!ribbon && (
        <div className="row">
          <button disabled={locked} data-testid="continue-a" onClick={() => a.cont(o.id, 'A')}>
            Continue from A
          </button>
          <button disabled={locked} data-testid="continue-b" onClick={() => a.cont(o.id, 'B')}>
            Continue from B
          </button>
        </div>
      )}
    </section>
  )
}
