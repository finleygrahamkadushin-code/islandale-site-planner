import { useEffect, useMemo } from 'react'
import { chainOffset, deckStepsPlan, type TreeWell } from './deckSteps'
import type { LocalPoint } from '../footprint'
import { emptyMesh } from '../geom'
import type { DeckSteps } from '../masses'
import { buildSlab } from '../slab'
import { ftToM } from '../../site/units'
import { paintedColour, type BuildingLook, type MassSite, type MeshHandlers } from '../../scene/buildingLook'
import { toGeometry } from '../../scene/meshData'
import { Segment } from '../../scene/Segment'
import { Surface } from '../../scene/Surface'

/** Tread blocks reach this far into the ground, metres (legacy 0.15). */
const BLOCK_EMBED_M = 0.15
const RAIL_HEIGHTS_M = [0.95, 0.5]
const RAIL_POST_GAP_M = 1.2
const STONE = '#8f8a80'

interface Props {
  readonly poly: readonly LocalPoint[]
  readonly steps: DeckSteps
  readonly wells: readonly TreeWell[]
  readonly look: BuildingLook
  readonly site: MassSite
  readonly handlers: MeshHandlers
}

/** Sitting steps down a deck edge: each tread follows the edge, flows round tree wells, and reaches down into the ground. */
export function DeckStepsMesh({ poly, steps, wells, look, site, handlers }: Props) {
  const rel = (x: number, z: number) => site.groundAt(x, z) - site.floor
  const plan = useMemo(() => deckStepsPlan(poly, steps, rel, wells), [poly, steps, wells, site.floor]) // eslint-disable-line react-hooks/exhaustive-deps
  const treads = useMemo(() => {
    const mesh = emptyMesh()
    for (const band of plan?.bands ?? []) {
      for (const piece of band.pieces) {
        const low = Math.min(...piece.map(([x, z]) => rel(x, z))) - BLOCK_EMBED_M
        if (band.top - low > 0.02) buildSlab(piece, band.top - low, band.top, mesh)
      }
    }
    return toGeometry(mesh)
  }, [plan]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => treads.dispose(), [treads])
  if (!plan) return null
  const { style, glow } = look
  return (
    <>
      <mesh geometry={treads} userData={{ part: 'deck' }} castShadow receiveShadow {...handlers}>
        <Surface kind="deck" style={style} texture="deck" color={paintedColour(look, site.mi, 'deck')} glow={glow} />
      </mesh>
      {plan.wells.map(({ well, top }, i) => {
        const g0 = rel(well.x, well.z) - 0.1
        const h = top + 0.05 - g0
        if (h <= 0.05) return null
        return (
          <mesh key={i} position={[ftToM(well.x), g0 + h / 2, ftToM(well.z)]} receiveShadow userData={WELL_DATA}>
            <cylinderGeometry args={[ftToM(well.r), ftToM(well.r), h, 48, 1, true]} />
            <Surface kind="concrete" style={style} color={STONE} />
          </mesh>
        )
      })}
      {plan.risers >= 2 && <FlightRails chain={plan.chain} run={plan.tread * (plan.risers - 1)} fall={plan.rise * (plan.risers - 1)} look={look} />}
    </>
  )
}

/** Part tags (read by Paint's hit test and the 3D export): the concrete ring round a tree well, the flight's rails. */
const WELL_DATA = { part: 'foundation' } as const
const FLIGHT_RAIL_DATA = { part: 'rail' } as const

/** A sloped handrail and guard down each open end of the flight (legacy deckStepsMesh rails). */
function FlightRails({ chain, run, fall, look }: { readonly chain: readonly LocalPoint[]; readonly run: number; readonly fall: number; readonly look: BuildingLook }) {
  const out = chainOffset(chain, 1)
  const ends: [number, number][] = [[0, 1], [chain.length - 1, chain.length - 2]]
  const runM = ftToM(run)
  return (
    <>
      {ends.map(([e, f]) => {
        const p = chain[e]
        const q = chain[f]
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
        const t = [(q[0] - p[0]) / l, (q[1] - p[1]) / l]
        const n = [out[e][0] - p[0], out[e][1] - p[1]]
        const x0 = ftToM(p[0]) + t[0] * 0.12
        const z0 = ftToM(p[1]) + t[1] * 0.12
        const at = (u: number, y: number): [number, number, number] => [x0 + n[0] * runM * u, -fall * u + y, z0 + n[1] * runM * u]
        const posts = Math.max(2, Math.round(runM / RAIL_POST_GAP_M) + 1)
        return (
          <group key={e} userData={FLIGHT_RAIL_DATA}>
            {RAIL_HEIGHTS_M.map((y, j) => (
              <Segment key={j} a={at(0, y)} b={at(1, y)} size={j ? 0.04 : 0.06}>
                <Surface kind="wood" style={look.style} />
              </Segment>
            ))}
            {Array.from({ length: posts }, (_, k) => k / (posts - 1)).map((u, k) => (
              <Segment key={`p${k}`} a={at(u, 0)} b={at(u, RAIL_HEIGHTS_M[0])} size={0.06}>
                <Surface kind="wood" style={look.style} />
              </Segment>
            ))}
          </group>
        )
      })}
    </>
  )
}
