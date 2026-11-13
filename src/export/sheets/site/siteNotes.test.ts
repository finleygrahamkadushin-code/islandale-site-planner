import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { lotFacts } from '../../../site/lotFacts'
import { codeCheck } from '../../../site/rules/codeCheck'
import { CodeCheckPanel } from '../../../site/rules/CodeCheckPanel'
import { SetbacksPanel } from '../../../site/rules/SetbacksPanel'
import { TipProvider } from '../../../guide/Tip'
import { programBudget } from '../../../site/rules/program'
import { ProgramPanel } from '../../../site/rules/ProgramPanel'
import { LotFactsPanel } from '../../../site/SitePanels'
import { usePlanStore } from '../../../store/planStore'
import { DEFAULT_SETBACKS, type Plan } from '../../../store/types'
import { CURRENT_SCHEME_ID } from '../../../site/schemes'
import { clearanceRows } from '../../../ui/selectionStats'
import { PLANNING_AID_NOTE, ROUTE_UNCHECKED_NOTE } from '../../../site/rules/ruleSources'
import { siteNotes, VERDICT_TEXT, type SiteNotes } from './siteNotes'
import { earthworksFor, objectsOf, planOf, SCHEMES, SITE } from './siteTestKit'

/**
 * The text a panel shows, as the app renders it (tags dropped, entities
 * read, spaces squeezed). The server renderer reads the store's initial
 * state, which is Scheme C with the default setbacks: the plan the app
 * opens on, so these checks are against the real panels for Scheme C.
 */
function panelText(panel: FunctionComponent): string {
  // inside the tooltip provider the app mounts once (Setbacks has glossary words)
  const html = renderToStaticMarkup(createElement(TipProvider, null, createElement(panel)))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}
const squeeze = (s: string) => s.replace(/\s+/g, ' ')

function notesFor(plan: Plan): SiteNotes {
  const { ground } = earthworksFor(objectsOf(plan))
  return siteNotes({ plan, site: SITE, setbacks: DEFAULT_SETBACKS, routeGround: ground })
}

const block = (notes: SiteNotes, id: string) => notes.blocks.find((b) => b.id === id)!

describe.each(SCHEMES.map((s) => s.id))('site notes · Scheme %s', (schemeId) => {
  const plan = planOf(schemeId)
  const objects = objectsOf(plan)
  const notes = notesFor(plan)
  const { ground } = earthworksFor(objects)

  test('lot coverage and shoreline come from lotFacts, written as the Lot facts panel writes them', () => {
    const facts = lotFacts(SITE.parcel, objects)
    const lot = block(notes, 'lot')
    expect(lot.rows.find((r) => r.label === 'Lot coverage')!.value).toBe(`${Math.round(facts.coveredSqFt).toLocaleString('en-US')} sq ft · ${facts.coveragePct.toFixed(1)} %`)
    expect(lot.rows.find((r) => r.label === 'Shoreline')!.value).toBe(`${Math.round(facts.shorelineFt).toLocaleString('en-US')} ft`)
  })

  test('the program budget comes from programBudget, a row per building', () => {
    const budget = programBudget(objects)
    const rows = block(notes, 'program').rows
    expect(rows.map((r) => r.label)).toEqual(['Enclosed total', 'Covered outdoor', ...budget.buildings.map((b) => b.name)])
    expect(rows[0].value).toBe(`${budget.enclosedSqFt.toLocaleString('en-US')} / 1,600 sq ft`)
    expect(rows.filter((r) => r.flag === 'over' && r.label !== 'Enclosed total').map((r) => r.label)).toEqual([...budget.overBuildings])
  })

  test('the code check is codeCheck’s, row for row: id, verdict and text', () => {
    const check = codeCheck({ objects, terrain: SITE.terrain, parcel: SITE.parcel, setbacks: DEFAULT_SETBACKS, schemeId: plan.schemeId, routeGround: ground })
    expect(notes.code.rulesOff).toBe(check.rulesOff)
    expect(notes.code.rows.map((r) => [r.id, r.label, r.verdict, r.text, r.names])).toEqual(check.rows.map((r) => [r.id, r.label, r.verdict, r.text, r.names.map((x) => x.name)]))
  })

  test('each building’s clearances are the inspector’s rows', () => {
    const rows = block(notes, 'clearances').rows
    const houses = objects.filter((o) => o.type === 'house')
    expect(rows.map((r) => r.label)).toEqual(houses.map((o) => o.name))
    expect(rows.map((r) => r.value)).toEqual(houses.map((o) => clearanceRows(o, plan, SITE, DEFAULT_SETBACKS).map((r) => r.text).join('; ')))
  })
})

describe('the real panels, Scheme C (the plan the app opens on)', () => {
  const plan = usePlanStore.getState().plan
  const notes = notesFor(plan)

  test('the store opens on Scheme C with the default setbacks', () => {
    expect(plan.schemeId).toBe(CURRENT_SCHEME_ID)
    expect(usePlanStore.getState().setbacks).toEqual(DEFAULT_SETBACKS)
  })

  test('lot coverage and shoreline read word for word as the Lot facts panel', () => {
    const text = panelText(LotFactsPanel)
    for (const label of ['Lot coverage', 'Shoreline']) expect(text).toContain(block(notes, 'lot').rows.find((r) => r.label === label)!.value)
  })

  test('every program row reads word for word as the Program panel', () => {
    const text = panelText(ProgramPanel)
    for (const r of block(notes, 'program').rows) expect(text).toContain(squeeze(r.value))
  })

  test('every code-check row reads word for word as the Code check panel', () => {
    const text = panelText(CodeCheckPanel)
    for (const r of notes.code.rows) {
      expect(text).toContain(squeeze(`${r.label} · ${r.text}`))
      expect(VERDICT_TEXT[r.verdict]).toBeTruthy()
    }
  })
})

describe('a planning aid, not a code review (R2.7, R2.8)', () => {
  const notes = notesFor(planOf(CURRENT_SCHEME_ID))

  test('the sheet’s code check opens its small print with the planning-aid note', () => {
    expect(notes.code.notes[0]).toBe(PLANNING_AID_NOTE)
  })

  test('next, what the accessible route check leaves out (R2.10)', () => {
    expect(notes.code.notes[1]).toBe(ROUTE_UNCHECKED_NOTE)
  })

  test('the Code check panel says the same, word for word', () => {
    const text = panelText(CodeCheckPanel)
    expect(text).toContain(squeeze(PLANNING_AID_NOTE))
    expect(text).toContain(squeeze(ROUTE_UNCHECKED_NOTE))
    expect(text).toContain('Height 35 ft above average grade (assumed)')
    expect(text).toContain('Ramp handrails rise over 6 in (ADA 405.8)')
  })
})

describe('rules off', () => {
  test('a rules-off scheme notes every row (the notes column says why, in a box)', () => {
    const off = SCHEMES.find((s) => ['D', 'E', 'F'].includes(s.id))!
    const notes = notesFor(planOf(off.id))
    expect(notes.code.rulesOff).toBe(true)
    expect(notes.code.rows.every((r) => r.verdict === 'note')).toBe(true)
  })
})

describe('the line along the water is called what it is: the assessor\'s lot line, not an OHWM (decision 1, Nov 13)', () => {
  test('the sheet\'s setback notes and the Setbacks panel never call it the OHWM', () => {
    const rows = block(notesFor(planOf(CURRENT_SCHEME_ID)), 'setbacks').rows.map((r) => `${r.label} ${r.value}`).join(' · ')
    expect(rows).not.toMatch(/OHWM|ordinary high water/i)
    expect(rows).toContain('in from the east lot line at the water')
    const panel = panelText(SetbacksPanel)
    expect(panel).not.toMatch(/OHWM/)
    expect(panel).toContain('Top of bank, in from the east lot line at the water')
  })
})
