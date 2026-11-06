import { expect, test } from 'vitest'
import { oversized } from './checkBundle.mjs'

test('only chunks other than three.js over 500 kB fail', () => {
  const files = [
    ['three-B-yeekNQ.js', 740_000],
    ['index-1qy.js', 378_000],
    ['effects-CF.js', 501_000],
    ['big.css', 900_000],
  ]
  expect(oversized(files)).toEqual([['effects-CF.js', 501_000]])
})
