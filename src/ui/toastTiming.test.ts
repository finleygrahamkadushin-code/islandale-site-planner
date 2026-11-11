import { describe, expect, test } from 'vitest'
import { REFUSED_MS, TOAST_MAX_MS, TOAST_MIN_MS, toastDuration, toastKind } from './toastTiming'

describe('which toasts are problems, refusals or news', () => {
  test.each([
    'The saved plan could not be read, so editing is off to protect it',
    'The saved plan could not be opened, so editing is off to protect it',
    'Could not save to this browser',
    'Could not import: bad JSON',
    'That save could not be read: bad file. Download it from History.',
    '2 objects could not be read and were left out: Shed (bad size); Deck (bad size)',
    'The plan is open for editing in another tab',
    'This save is from a newer version of the planner; it opens read-only',
    'The old save could not be set aside safely, so editing is off',
    'Editing moved to another tab; this one is now read-only',
    'The picture could not be saved',
  ])('a problem with the plan or the save: %s', (text) => {
    expect(toastKind(text)).toBe('problem')
  })

  test.each([
    'Cabin A is locked',
    '3 objects are locked',
    'Decks and paths are locked',
    'Locked objects stay where they are',
    'Every walk is locked',
    'No one-click fix for that',
    'Select two or more objects to group',
    'Nothing selected is grouped',
    'Paint works on buildings and decks',
    'That part has no exterior finish',
    'A cabin takes at most 6 parts',
    'The main walls stay; pick a wing to remove it',
    'No route found',
  ])('a refused edit: %s', (text) => {
    expect(toastKind(text)).toBe('refused')
  })

  test.each(['Snap on: 1 ft moves, 5° turns', 'Grouped 3 objects', 'Removed rail · Undo brings it back', 'Snapped: end → Door 1'])(
    'news: %s',
    (text) => {
      expect(toastKind(text)).toBe('info')
    },
  )
})

describe('how long a toast stays', () => {
  test('a problem stays until it is dismissed', () => {
    expect(toastDuration('The saved plan could not be read, so editing is off to protect it')).toBeNull()
  })

  test('a refused edit stays long enough to read twice', () => {
    expect(toastDuration('Cabin A is locked')).toBe(REFUSED_MS)
    expect(REFUSED_MS).toBeGreaterThanOrEqual(8000)
  })

  test('news stays longer the longer it is, within limits', () => {
    const short = toastDuration('Snap off')
    const long = toastDuration('Rebuilt 4 walks as 22 path pieces, kept 2 that are set aside out of the way of the new ones.')
    expect(short).toBe(TOAST_MIN_MS)
    expect(TOAST_MIN_MS).toBeGreaterThan(2500)
    expect(long).toBeGreaterThan(TOAST_MIN_MS)
    expect(toastDuration('x'.repeat(1000))).toBe(TOAST_MAX_MS)
  })
})
