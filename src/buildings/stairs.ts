const IN = 0.0254

/** Legacy stair rule (walk-model): risers of 7 in or less, 11 in treads. */
export const MAX_RISER_IN = 7
export const TREAD_IN = 11
export const HANDRAIL_IN = 34

export interface StairMath {
  readonly risers: number
  readonly riserIn: number
  readonly treads: number
  readonly runIn: number
}

/** Port of the legacy stairMath(): riser count and sizes for a drop in metres. */
export function stairMath(riseM: number): StairMath {
  const riseIn = Math.abs(riseM) / IN
  const risers = riseIn < 0.5 ? 0 : Math.ceil(riseIn / MAX_RISER_IN - 1e-9)
  return { risers, riserIn: risers ? riseIn / risers : 0, treads: Math.max(0, risers - 1), runIn: risers * TREAD_IN }
}

/** One tread block, in the stair's frame: z0..z1 feet along the run, top elevation metres. */
export interface StairStep {
  readonly z0: number
  readonly z1: number
  readonly top: number
}

export interface StairLayout {
  /** Floor minus the ground at the stair's foot, metres. */
  readonly drop: number
  readonly math: StairMath
  readonly steps: readonly StairStep[]
  /** Where the run ends on the ground, feet along z. */
  readonly footZ: number
}

interface StairInput {
  readonly widthFt: number
  /** The wing's own depth: where the stair starts (its -z end) and its run if no ground is known. */
  readonly nominalRunFt: number
  /** Absolute floor elevation at the top, metres. */
  readonly floor: number
  /** Ground elevation (metres) at a point on the stair's centre line, z feet. */
  readonly groundAt: (z: number) => number
}

/**
 * A stair that starts at the floor on its -z end and steps down along +z
 * until it meets the ground. The riser count depends on the drop at the
 * foot, and the foot depends on the run, so settle it in a few passes.
 */
export function stairLayout({ nominalRunFt, floor, groundAt }: StairInput): StairLayout {
  const z0 = -nominalRunFt / 2
  let footZ = z0 + nominalRunFt
  let math = stairMath(0)
  let drop = 0
  for (let pass = 0; pass < 4; pass++) {
    drop = floor - groundAt(footZ)
    math = stairMath(Math.max(0, drop))
    const next = z0 + math.runIn / 12
    if (Math.abs(next - footZ) < 0.05) break
    footZ = next
  }
  if (drop <= 0 || math.risers === 0) return { drop: Math.max(0, drop), math, steps: [], footZ: z0 }
  const rise = math.riserIn * IN
  const tread = TREAD_IN / 12
  const steps: StairStep[] = []
  // tread blocks between the floor and the ground; the last tread of the run is the ground itself
  for (let i = 1; i < math.risers; i++) steps.push({ z0: z0 + (i - 1) * tread, z1: z0 + i * tread, top: floor - i * rise })
  return { drop, math, steps, footZ }
}
