import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlanStore } from '../store/planStore'
import { lotFacts } from './lotFacts'
import { EARTH_TINTS, type TintKind } from './earthworks/earthworksTint'
import { BUFFER, STAKE } from './SiteMarks'
import { PARCEL_LINE, SHORELINE_LINE } from './ParcelLine'

const sqft = (v: number) => `${Math.round(v).toLocaleString('en-US')} sq ft`

/** Lot facts on the Site tab (old site header stats and coverage): lot area, shoreline, and the ground buildings and decks cover. */
export function LotFactsPanel() {
  const parcel = usePlanStore((s) => s.site.parcel)
  const objects = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id])))
  const facts = useMemo(() => lotFacts(parcel, objects), [parcel, objects])
  return (
    <section className="panel" aria-label="Lot facts" data-testid="lot-facts">
      <header>
        <strong>The lot</strong>
      </header>
      <dl className="facts">
        <dt>Lot area</dt>
        <dd>{sqft(facts.lotSqFt)}</dd>
        <dt>Shoreline</dt>
        <dd>{Math.round(facts.shorelineFt).toLocaleString('en-US')} ft</dd>
        <dt>Covered by buildings and decks</dt>
        <dd>
          {sqft(facts.coveredSqFt)} · {facts.coveragePct.toFixed(1)} %
        </dd>
      </dl>
    </section>
  )
}

const TINT_LABELS: Readonly<Record<TintKind, string>> = {
  mud: 'Pond bottom',
  court: 'Levelled court',
  berm: 'Raised berm',
  wet: 'Wet margin',
  bank: 'Cut bank',
}

/** What the colours on the ground mean (old ground colour key). */
export function LegendPanel() {
  const rows: readonly (readonly [string, string, 'fill' | 'line'])[] = [
    ...(Object.keys(EARTH_TINTS) as TintKind[]).map((k) => [EARTH_TINTS[k], TINT_LABELS[k], 'fill'] as const),
    [PARCEL_LINE, 'Lot line', 'line'],
    [SHORELINE_LINE, 'Lot line along the water', 'line'],
    [BUFFER, 'Shoreline buffer', 'line'],
    [STAKE, 'Lot-corner stakes', 'fill'],
  ]
  return (
    <section className="panel" aria-label="Legend" data-testid="legend">
      <header>
        <strong>Legend</strong>
      </header>
      <ul className="legend">
        {rows.map(([colour, label, kind]) => (
          <li key={label}>
            <i className={`legend-key ${kind}`} style={{ background: colour }} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      <p className="muted small">Contour lines every 2 ft, darker every 10 ft; switch them in Layers.</p>
    </section>
  )
}
