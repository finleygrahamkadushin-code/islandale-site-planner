import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlanStore } from '../../store/planStore'
import { BUILDING_CAP_SQFT, PROGRAM_CAP_SQFT, programBudget, type BuildingProgram, type ProgramBudget } from './program'

const n = (v: number) => v.toLocaleString('en-US')

/** One building's enclosed area, its floor count, and its covered porches. */
function buildingLine(b: BuildingProgram): string {
  const floors = b.floors > 1 ? ` (${b.floors} fl)` : ''
  const covered = b.coveredSqFt > 0 ? ` + ${n(b.coveredSqFt)} covered` : ''
  return `${n(b.enclosedSqFt)} sq ft${floors}${covered}`
}

/** What's over its limit, or nothing. */
function flagLine(budget: ProgramBudget): string | null {
  if (budget.overTotal) return `Over the ${n(PROGRAM_CAP_SQFT)} sq ft enclosed limit.`
  if (budget.overBuildings.length) return `${budget.overBuildings.join(', ')} over ${n(BUILDING_CAP_SQFT)} sq ft.`
  return null
}

/** The program budget on the Build tab (old refreshProgram): enclosed against the caps, covered and deck area, a row per building. */
export function ProgramPanel() {
  const objects = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id])))
  const budget = useMemo(() => programBudget(objects), [objects])
  const flag = flagLine(budget)
  return (
    <section className="panel" aria-label="Program budget" data-testid="program-budget">
      <header>
        <strong>Program budget</strong>
      </header>
      <dl className="facts">
        <dt>Enclosed total</dt>
        <dd className={budget.overTotal ? 'over' : undefined}>
          {n(budget.enclosedSqFt)} / {n(PROGRAM_CAP_SQFT)} sq ft
        </dd>
        <dt>Covered outdoor</dt>
        <dd>
          {n(budget.coveredSqFt)} sq ft + {n(budget.deckSqFt)} deck
        </dd>
        {budget.buildings.map((b) => (
          <BuildingRow key={b.id} building={b} />
        ))}
      </dl>
      {flag && (
        <p className="fit-warn" role="status">
          {flag}
        </p>
      )}
      <p className="muted">
        Enclosed counts every floor of the main walls plus closed wings; porches count as covered. Each building must stay at or below{' '}
        {n(BUILDING_CAP_SQFT)} sq ft.
      </p>
    </section>
  )
}

function BuildingRow({ building }: { readonly building: BuildingProgram }) {
  return (
    <>
      <dt>{building.name}</dt>
      <dd className={building.over ? 'over' : undefined}>{buildingLine(building)}</dd>
    </>
  )
}
