import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { allJunctions, CHIP_LIFT_M, junctionChips } from '../paths/junctionsChips'
import { hostJoinery, pieceTabs, type JoinSlab } from '../paths/junctionsGeom'
import { isPathPiece } from '../paths/pieces'
import { usePlanStore } from '../store/planStore'
import { toScene } from './frame'
import { LAYER, ScreenChip } from './ScreenChip'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'
import { useEarthworks } from './useEarthworks'

/**
 * Where paths meet buildings (old join-geom and junction chips): door
 * threshold plates, filler strips between abutting decks and tabs under
 * piece ends, and a "6 in step" chip at every junction that is not flush.
 */
export function JunctionLayer() {
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const style = useDisplayStyle()
  const { ground } = useEarthworks()
  const objects = useMemo(() => plan.order.map((id) => plan.objects[id]).filter((o) => o && !o.hidden), [plan])
  const slabs = useMemo(
    () => objects.flatMap((o): JoinSlab[] => (o.type === 'house' || o.type === 'deck' ? hostJoinery(o, objects, terrain, ground) : isPathPiece(o) ? pieceTabs(o, objects, terrain, ground) : [])),
    [objects, terrain, ground],
  )
  const chips = useMemo(() => junctionChips(allJunctions(objects, terrain, ground)), [objects, terrain, ground])
  return (
    <>
      {slabs.map((s, i) => (
        <SlabMesh key={i} slab={s} style={style} />
      ))}
      {chips.map((c, i) => (
        <ScreenChip key={`c${i}`} position={toScene(c.x, c.n, c.z + CHIP_LIFT_M)} layer={LAYER.rail}>
          <span className="step-chip" data-testid="step-chip">
            {c.text}
          </span>
        </ScreenChip>
      ))}
    </>
  )
}

/** A thin slab over a four-corner outline in site metres, its top at topZ. */
function SlabMesh({ slab, style }: { readonly slab: JoinSlab; readonly style: ReturnType<typeof useDisplayStyle> }) {
  const geometry = useMemo(() => {
    const top = slab.outline.map(([x, n]) => toScene(x, n, slab.topZ))
    const bot = slab.outline.map(([x, n]) => toScene(x, n, slab.topZ - slab.thickness))
    const pos: number[] = []
    const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    const k = top.length
    for (let i = 1; i + 1 < k; i++) {
      pos.push(...top[0], ...top[i + 1], ...top[i])
      pos.push(...bot[0], ...bot[i], ...bot[i + 1])
    }
    for (let i = 0; i < k; i++) quad(top[i], top[(i + 1) % k], bot[(i + 1) % k], bot[i])
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [slab])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} receiveShadow castShadow name={`join-${slab.kind}`}>
      <Surface kind={slab.kind === 'tab' ? 'concrete' : 'deck'} style={style} texture={slab.kind === 'tab' ? 'concrete' : 'deck'} />
    </mesh>
  )
}
