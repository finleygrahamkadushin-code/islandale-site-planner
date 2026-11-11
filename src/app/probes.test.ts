import { describe, expect, it } from 'vitest'
import { installProbes, PROBES_ON, type IslandaleProbes } from './probes'
import { usePlanStore } from '../store/planStore'

describe('window.islandale probes (R11.2)', () => {
  it('are on under the dev server and the unit tests', () => {
    expect(import.meta.env.DEV).toBe(true)
    expect(PROBES_ON).toBe(true)
  })

  it('install the store and the speed probes when on', () => {
    const target: { islandale?: IslandaleProbes } = {}
    installProbes(target, true)
    expect(target.islandale?.store).toBe(usePlanStore)
    expect(typeof target.islandale?.firstFrameMs).toBe('function')
    expect(typeof target.islandale?.sampleFrames).toBe('function')
    expect(typeof target.islandale?.liveDrag).toBe('function')
  })

  it('install nothing when off, as in a production build', () => {
    const target: { islandale?: IslandaleProbes } = {}
    installProbes(target, false)
    expect(target).toEqual({})
  })
})
