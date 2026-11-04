import { useEffect, useMemo } from 'react'
import { massPoly, type Mass } from '../buildings/masses'
import { buildSlab } from '../buildings/slab'
import type { DeckSupports } from '../buildings/supportParams'
import { buildWalls } from '../buildings/walls'
import { DECK_BEAM_M as BEAM_M, DECK_M, DECK_POST_M, deckPostPoints, deckRimOutline, keptPorchPosts, PORCH_POST_M } from '../buildings/wingPosts'
import { ftToM } from '../site/units'
import type { TreeWell } from '../buildings/deckSteps'
import { paintedColour, type BuildingLook, type MassSite, type MeshHandlers } from './buildingLook'
import { DeckStepsMesh } from './DeckStepsMesh'
import { GuardRail } from './GuardRail'
import { Foundation, Posts } from './Foundation'
import { toGeometry } from './meshData'
import { RoofMesh } from './RoofMesh'
import { Surface } from './Surface'

export type { DeckSupports } from '../buildings/supportParams'

interface OpenMassProps {
  readonly m: Mass
  readonly look: BuildingLook
  readonly site: MassSite
  readonly handlers: MeshHandlers
}

/**
 * A deck: board floor following its outline (straight or curved), with a
 * rim beam on posts down to the ground (a ring and grid under a curve), or
 * on its own supports when given; sitting steps where it has them.
 */
export function DeckMass({ m, look, site, handlers, wells, supports }: OpenMassProps & { readonly wells: readonly TreeWell[]; readonly supports?: DeckSupports }) {
  const poly = useMemo(() => massPoly(m), [m])
  const floor = useMemo(() => toGeometry(buildSlab(poly, DECK_M)), [poly])
  const rim = useMemo(() => (supports ? null : toGeometry(buildWalls(deckRimOutline(poly), BEAM_M / 0.3048))), [poly, supports])
  const posts = useMemo(() => (supports ? [] : deckPostPoints(poly)), [poly, supports])
  useEffect(() => () => floor.dispose(), [floor])
  useEffect(() => () => rim?.dispose(), [rim])
  return (
    <>
      <mesh geometry={floor} userData={{ part: 'deck' }} castShadow receiveShadow {...handlers}>
        <Surface kind="deck" style={look.style} texture="deck" color={paintedColour(look, site.mi, 'deck')} glow={look.glow} />
      </mesh>
      {rim && (
        <mesh geometry={rim} position={[0, -DECK_M - BEAM_M, 0]} userData={{ part: 'deck' }} castShadow receiveShadow {...handlers}>
          <Surface kind="wood" style={look.style} />
        </mesh>
      )}
      {supports ? (
        <Foundation
          poly={poly}
          site={site}
          support={supports.support}
          spacingFt={supports.spacingFt}
          postIn={supports.postIn}
          bracing={supports.bracing}
          top={-DECK_M}
          style={look.style}
          handlers={handlers}
          paint={(part) => paintedColour(look, site.mi, part)}
        />
      ) : (
        <Posts points={posts} top={-DECK_M - BEAM_M} site={site} sizeM={DECK_POST_M} style={look.style} handlers={handlers} color={paintedColour(look, site.mi, 'post')} />
      )}
      {m.steps && <DeckStepsMesh poly={poly} steps={m.steps} wells={wells} look={look} site={site} handlers={handlers} />}
      <GuardRail m={m} poly={poly} site={site} look={look} handlers={handlers} />
    </>
  )
}

/** A covered porch: board floor, posts carrying a beam ring and its own roof, posts below where the floor is off the ground. */
export function PorchMass({ m, look, site, handlers }: OpenMassProps) {
  const poly = useMemo(() => massPoly(m), [m])
  const floor = useMemo(() => (m.slab ? toGeometry(buildSlab(poly, DECK_M)) : null), [poly, m.slab])
  const beam = useMemo(() => toGeometry(buildSlab(poly, DECK_M)), [poly])
  // no post inside the walls or in front of another mass's door (legacy porchPostKeep)
  const posts = useMemo(() => keptPorchPosts(poly, site), [poly, site])
  useEffect(() => () => floor?.dispose(), [floor])
  useEffect(() => () => beam.dispose(), [beam])
  const h = ftToM(m.h)
  const { style, glow } = look
  return (
    <>
      {floor && (
        <mesh geometry={floor} userData={{ part: 'deck' }} castShadow receiveShadow {...handlers}>
          <Surface kind="deck" style={style} texture="deck" color={paintedColour(look, site.mi, 'deck')} glow={glow} />
        </mesh>
      )}
      <mesh geometry={beam} position={[0, h, 0]} userData={{ part: 'trim' }} castShadow receiveShadow {...handlers}>
        <Surface kind="trim" style={style} color={paintedColour(look, site.mi, 'trim') ?? look.color} diagramColor={look.diagram} glow={glow} />
      </mesh>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[ftToM(x), h / 2, ftToM(z)]} userData={{ part: 'post' }} castShadow {...handlers}>
          <boxGeometry args={[PORCH_POST_M, h, PORCH_POST_M]} />
          <Surface kind="wood" style={style} color={paintedColour(look, site.mi, 'post')} glow={glow} />
        </mesh>
      ))}
      {m.slab && <Posts points={posts} top={-DECK_M} site={site} sizeM={PORCH_POST_M} style={style} handlers={handlers} color={paintedColour(look, site.mi, 'post')} />}
      {m.slab && <GuardRail m={m} poly={poly} site={site} look={look} handlers={handlers} />}
      <RoofMesh m={m} mi={site.mi ?? 0} poly={poly} look={look} handlers={handlers} />
    </>
  )
}
