import { useEffect, useMemo } from 'react'
import type { LocalPoint } from '../buildings/footprint'
import { massPoly, type Mass } from '../buildings/masses'
import { curvePosts, edgePosts, offsetOutline } from '../buildings/outline'
import { buildSlab } from '../buildings/slab'
import { buildWalls } from '../buildings/walls'
import { ftToM } from '../site/units'
import type { BuildingLook, MassSite, MeshHandlers } from './buildingLook'
import { Posts } from './Foundation'
import { toGeometry } from './meshData'
import { RoofMesh } from './RoofMesh'
import { Surface } from './Surface'

/** Deck and porch floors are 0.3 m deep, top at the mass floor (legacy shapeGeom(P, 0.3)). */
export const DECK_M = 0.3
const BEAM_M = 0.28
const DECK_POST_SPACING_FT = 6
const DECK_POST_INSET_FT = 1
const PORCH_POST_INSET_FT = 0.8
const PORCH_POST_GAP_FT = 12
const PORCH_POST_M = 0.25
const DECK_POST_M = 0.2
/** Outlines with more vertices than this are curves: posts go in a ring and grid, not at the corners. */
const CURVED_VERTICES = 24

interface OpenMassProps {
  readonly m: Mass
  readonly look: BuildingLook
  readonly site: MassSite
  readonly handlers: MeshHandlers
}

/** A deck: board floor with a rim beam, on posts down to the ground. */
export function DeckMass({ m, look, site, handlers }: OpenMassProps) {
  const poly = useMemo(() => massPoly(m), [m])
  const floor = useMemo(() => toGeometry(buildSlab(poly, DECK_M)), [poly])
  const rim = useMemo(() => toGeometry(buildWalls(offsetOutline(poly, -DECK_POST_INSET_FT * 0.6), BEAM_M / 0.3048)), [poly])
  const posts = useMemo(() => deckPostPoints(poly), [poly])
  useEffect(() => () => floor.dispose(), [floor])
  useEffect(() => () => rim.dispose(), [rim])
  return (
    <>
      <mesh geometry={floor} castShadow receiveShadow {...handlers}>
        <Surface kind="deck" style={look.style} texture="deck" glow={look.glow} />
      </mesh>
      <mesh geometry={rim} position={[0, -DECK_M - BEAM_M, 0]} castShadow receiveShadow>
        <Surface kind="wood" style={look.style} />
      </mesh>
      <Posts points={posts} top={-DECK_M - BEAM_M} site={site} sizeM={DECK_POST_M} style={look.style} />
    </>
  )
}

/** A covered porch: board floor, posts carrying a beam ring and its own roof, posts below where the floor is off the ground. */
export function PorchMass({ m, look, site, handlers }: OpenMassProps) {
  const poly = useMemo(() => massPoly(m), [m])
  const floor = useMemo(() => (m.slab ? toGeometry(buildSlab(poly, DECK_M)) : null), [poly, m.slab])
  const beam = useMemo(() => toGeometry(buildSlab(poly, DECK_M)), [poly])
  const posts = useMemo(() => porchPostPoints(poly).filter((p) => !site.insideWalls(p)), [poly, site])
  useEffect(() => () => floor?.dispose(), [floor])
  useEffect(() => () => beam.dispose(), [beam])
  const h = ftToM(m.h)
  const { style, glow } = look
  return (
    <>
      {floor && (
        <mesh geometry={floor} castShadow receiveShadow {...handlers}>
          <Surface kind="deck" style={style} texture="deck" glow={glow} />
        </mesh>
      )}
      <mesh geometry={beam} position={[0, h, 0]} castShadow receiveShadow {...handlers}>
        <Surface kind="trim" style={style} color={look.color} diagramColor={look.diagram} glow={glow} />
      </mesh>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[ftToM(x), h / 2, ftToM(z)]} castShadow {...handlers}>
          <boxGeometry args={[PORCH_POST_M, h, PORCH_POST_M]} />
          <Surface kind="wood" style={style} glow={glow} />
        </mesh>
      ))}
      {m.slab && <Posts points={posts} top={-DECK_M} site={site} sizeM={PORCH_POST_M} style={style} />}
      <RoofMesh m={m} poly={poly} look={look} handlers={handlers} />
    </>
  )
}

/** Legacy deck posts: at the inset corners, or a ring and grid under curved decks. */
export function deckPostPoints(poly: readonly LocalPoint[]): LocalPoint[] {
  if (poly.length > CURVED_VERTICES) return curvePosts(poly, DECK_POST_SPACING_FT, DECK_POST_INSET_FT)
  return edgePosts(offsetOutline(poly, -DECK_POST_INSET_FT), DECK_POST_SPACING_FT * 1.5)
}

/** Porch posts: just inside each corner and along long edges. */
export function porchPostPoints(poly: readonly LocalPoint[]): LocalPoint[] {
  return edgePosts(offsetOutline(poly, -PORCH_POST_INSET_FT), PORCH_POST_GAP_FT)
}
