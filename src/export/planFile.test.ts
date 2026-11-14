import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { viewOf } from '../store/autosave'
import { currentPlanText, importPlanFile } from './planFile'

const store = () => usePlanStore.getState()
const fileOf = (text: string) => ({ text: async () => text }) as unknown as File

describe('plan file import (R6.8)', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().setDisplayStyle('realistic')
    store().setContours(null)
    usePlanStore.temporal.getState().clear()
  })

  test('a download followed by an import gives back the same plan and view', async () => {
    store().setDisplayStyle('white')
    store().setDisplayOption('shadows', false)
    store().setContours(true)
    store().setLabelMode('selected')
    store().setLayer('trees', { visible: false })
    store().setEnvironment({ season: 'dec', hour: 9 })
    store().setSetbacks({ shoreFt: 50 })
    const plan = store().plan
    const view = viewOf(store())
    const text = currentPlanText()

    store().clearPlan()
    store().setDisplayStyle('sketch')
    store().setContours(false)
    store().setLabelMode('none')
    store().setLayer('trees', { visible: true })
    store().setEnvironment({ season: 'jun', hour: 16 })
    store().setSetbacks({ shoreFt: 35 })

    await importPlanFile(fileOf(text))
    expect(store().plan).toEqual(plan)
    expect(viewOf(store())).toEqual(view)
  })

  test('a refused import changes neither the plan nor the view', async () => {
    const text = currentPlanText()
    store().setDisplayStyle('sketch')
    store().setLabelMode('none')
    const plan = store().plan
    const view = viewOf(store())
    store().setReadOnly('other-tab')
    await importPlanFile(fileOf(text.replace('"labelMode": "none"', '"labelMode": "all"').replace('"sketch"', '"white"')))
    expect(store().plan).toBe(plan)
    expect(viewOf(store())).toEqual(view)
    store().setReadOnly(null)
  })

  test('an import with a bad object opens the rest and names it', async () => {
    const raw = JSON.parse(currentPlanText()) as { plan: { order: string[]; objects: Record<string, Record<string, unknown>> } }
    const [bad, ...rest] = raw.plan.order
    raw.plan.objects[bad] = { ...raw.plan.objects[bad], name: 'Bad pad', position: 'here' }
    await importPlanFile(fileOf(JSON.stringify(raw)))
    expect(store().plan.order).toEqual(rest)
    expect(store().toast?.text).toMatch(/Bad pad/)
  })
})
