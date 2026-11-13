import { usePlanStore } from '../../store/planStore'
import { DEFAULT_SETBACKS, SETBACK_RANGES, STRICT_SHORE_FT, type Setbacks } from '../../store/types'
import { Term } from '../../guide/Term'

type Slider = 'shoreFt' | 'bankFt' | 'sideFt'

/** Setback sliders (5E, old Setbacks panel). View settings: saved with the plan, not undo steps. */
export function SetbacksPanel() {
  const setbacks = usePlanStore((s) => s.setbacks)
  const setSetbacks = usePlanStore((s) => s.setSetbacks)
  const range = (key: Slider, label: React.ReactNode, aria: string) => (
    <label className="field">
      <span className="muted small">
        {label} <em>{setbacks[key]} ft</em>
      </span>
      <input
        type="range"
        min={SETBACK_RANGES[key].min}
        max={SETBACK_RANGES[key].max}
        step={SETBACK_RANGES[key].step}
        value={setbacks[key]}
        aria-label={aria}
        onChange={(e) => setSetbacks({ [key]: Number(e.target.value) } as Partial<Setbacks>)}
      />
    </label>
  )
  return (
    <section className="panel" aria-label="Setbacks" data-testid="setbacks">
      <header>
        <strong>
          <Term term="setback">Setbacks</Term>
        </strong>
      </header>
      {range('shoreFt', <>Shoreline, from the <Term term="top-of-bank">top of bank</Term></>, 'Shoreline setback')}
      {range('bankFt', 'Top of bank, in from the east lot line at the water', 'Top of bank')}
      {range('sideFt', 'Side and rear lot lines', 'Side setback')}
      <label className="row small">
        <input type="checkbox" checked={setbacks.treeZones} onChange={(e) => setSetbacks({ treeZones: e.target.checked })} />
        Shade the <Term term="tree-zone">tree protection zones</Term>
      </label>
      <div className="row">
        <button onClick={() => setSetbacks({ shoreFt: STRICT_SHORE_FT })} disabled={setbacks.shoreFt === STRICT_SHORE_FT}>
          Strict ({STRICT_SHORE_FT} ft)
        </button>
        <button
          onClick={() => setSetbacks({ shoreFt: DEFAULT_SETBACKS.shoreFt, bankFt: DEFAULT_SETBACKS.bankFt, sideFt: DEFAULT_SETBACKS.sideFt })}
        >
          Reset
        </button>
      </div>
      <p className="muted small">
        SJCC 18.50.540(C) sets the shoreline setback 50 ft back from the top of the bank. Where there is no clear bank, it is
        measured from the water. It may drop to 35 ft where neighbouring houses sit closer, which is how the schemes are sited.
        The east shore climbs about 14 ft in its first 50 ft, so its bank top is taken as 45 ft in. The south-west shore is
        gentle, so it is measured from the water. Verify on site.
      </p>
    </section>
  )
}
