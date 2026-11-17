import { describe, expect, test } from 'vitest'
import { foldingZigZag } from './WallMarks'
import type { SheetOpeningPiece } from '../types'

// a 8 ft piece along the outside face (y = 0), its mid-wall line 0.5 ft in
const piece = (w: number): SheetOpeningPiece => ({
  edge: 0,
  a: [0, 0],
  b: [w, 0],
  innerA: [0, 0.66],
  innerB: [w, 0.66],
  midA: [0, 0.33],
  midB: [w, 0.33],
  fromLeftFt: 0,
  fromRightFt: 0,
} as unknown as SheetOpeningPiece)

describe('the folding door plan symbol', () => {
  test('an 8 ft piece folds into 3 panels: four points, zig-zagging between the face and mid-wall', () => {
    const path = foldingZigZag(piece(8))
    expect(path).toHaveLength(4)
    expect(path[0]).toEqual([0, 0])
    expect(path[1][1]).toBeCloseTo(0.33)
    expect(path[2][1]).toBeCloseTo(0)
    expect(path[3]).toEqual([8, 0])
  })

  test('it ends on the face at the far jamb even when the panel count is odd', () => {
    const path = foldingZigZag(piece(5))
    expect(path[path.length - 1]).toEqual([5, 0])
  })
})
