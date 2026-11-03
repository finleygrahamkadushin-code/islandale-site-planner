import { useEffect, useMemo } from 'react'
import { num } from '../buildings/footprint'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { useEarthworks } from './useEarthworks'
import { baseElevation } from './placement'
import { toScene } from './frame'
import { useObjectInteraction } from './useObjectInteraction'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'
import { barkColour, buildTree, speciesOf, treeSeed } from './treeShapes'

/** A tree by species (madrone, fir, cedar, alder) inside its legacy canopy width and height. */
export function TreeMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const species = speciesOf(o.params.species)
  const w = ftToM(num(o.params.w, 20))
  const d = ftToM(num(o.params.d, num(o.params.w, 20)))
  const h = ftToM(num(o.params.h, 25))
  const leaf = typeof o.params.color === 'string' ? o.params.color : '#4f7d4b'
  const shape = useMemo(() => buildTree(species, { w, d, h }, leaf, treeSeed(o.id)), [species, w, d, h, leaf, o.id])
  useEffect(() => () => {
    shape.bark.dispose()
    shape.crown.dispose()
  }, [shape])
  const position = toScene(o.position.x, o.position.n, baseElevation(terrain, o, ground))
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={position} userData={{ objectId: o.id }}>
      <mesh geometry={shape.bark} castShadow {...handlers}>
        <Surface kind="trunk" style={style} color={barkColour(species)} />
      </mesh>
      <mesh geometry={shape.crown} castShadow receiveShadow {...handlers}>
        <Surface kind="canopy" style={style} color={leaf} glow={glow} vertexColors />
      </mesh>
    </group>
  )
}
