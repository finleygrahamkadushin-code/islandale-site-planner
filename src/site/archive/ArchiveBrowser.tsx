import { useMemo } from 'react'
import { usePlanStore } from '../../store/planStore'
import { schemeSummaries, type SchemeSummary } from './schemeSummary'
import { SchemeCard } from './SchemeCard'
import { thumbOf } from './SchemeThumb'

type Group = SchemeSummary['group']

const GROUPS: readonly { readonly id: Group; readonly title: string; readonly hint: string }[] = [
  { id: 'current', title: 'The current scheme', hint: 'Scheme C and its three prow variants.' },
  { id: 'brief', title: 'Within the brief', hint: 'Earlier schemes drawn to the rubric: 1,600 sq ft, the setbacks, the height limit.' },
  { id: 'dream', title: 'Dream schemes, rules off', hint: 'Ideas that set the brief aside, so nothing is checked against them.' },
]

/** Work out every card's summary ahead of time, so the first open doesn't wait (called once the view has drawn). */
export function warmArchive(): void {
  const s = usePlanStore.getState()
  schemeSummaries(s.schemes, s.site)
  for (const scheme of s.schemes) thumbOf(scheme, s.site)
}

/** The archive's contents (5F): the three groups of scheme cards. Loaded on first open. */
export function ArchiveBrowser() {
  const schemes = usePlanStore((s) => s.schemes)
  const site = usePlanStore((s) => s.site)
  const openId = usePlanStore((s) => s.plan.schemeId)
  const summaries = useMemo(() => schemeSummaries(schemes, site), [schemes, site])
  return (
    <div className="archive-body">
      {GROUPS.map((g) => {
        const cards = summaries.filter((s) => s.group === g.id)
        if (!cards.length) return null
        return (
          <section key={g.id} className="archive-group" aria-labelledby={`archive-${g.id}`} data-testid={`archive-group-${g.id}`}>
            <h3 id={`archive-${g.id}`}>{g.title}</h3>
            <p className="muted small">{g.hint}</p>
            <ul className="archive-cards">
              {cards.map((s) => (
                <li key={s.id}>
                  <SchemeCard summary={s} scheme={schemes.find((x) => x.id === s.id)!} site={site} isOpen={s.id === openId} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
