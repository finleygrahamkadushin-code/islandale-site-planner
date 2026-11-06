import { describe, expect, test } from 'vitest'
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Scene, type Object3D } from 'three'
import type { Plan, PlanObject } from '../../store/types'
import { collectModel, ROOTS } from './collect'
import { countGlb, finishJson, readGlb, writeGlb, type GltfJson } from './glb'

const obj = (id: string, type: string, name: string, params: Record<string, unknown>, x: number, n: number, rotation: number): PlanObject => ({
  id,
  type,
  name,
  position: { x, n },
  rotation,
  params,
  locked: false,
  hidden: false,
  labelVisible: true,
})
const house = obj('h1', 'house', 'Twin Pod', { w: 20, d: 16, h: 9, roof: 'gable', walls: 'cedar' }, 10, 20, 90)
const tree = obj('t1', 'tree', 'Madrone', { species: 'madrone' }, -5, 3, 0)
const plan: Plan = { name: 'Test', siteId: 'islandale', schemeId: null, objects: { h1: house, t1: tree }, order: ['h1', 't1'] }

const paint = (hex: string) => new MeshStandardMaterial({ color: hex })
/** Four triangles: two on wall 0, two on wall 1. */
function wallGeometry(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(36).map((_, i) => i % 7), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(24).fill(10), 2))
  return g
}

/** A live scene shaped like the app's: named site roots, the plan group, and clutter around them. */
function liveScene(): Scene {
  const s = new Scene()
  s.add(Object.assign(new Mesh(new BoxGeometry(), paint('#556b2f')), { name: 'terrain' }))
  s.add(Object.assign(new Mesh(new BoxGeometry(), paint('#3a6ea5')), { name: 'water' }))
  s.add(Object.assign(new Mesh(new BoxGeometry(), paint('#ff00ff')), { name: 'gizmo' }))
  const planGroup = Object.assign(new Group(), { name: 'plan' })
  const h = new Group()
  h.userData = { objectId: 'h1' }
  h.position.set(10, 4.5, -20)
  h.rotation.y = Math.PI / 2
  const mass = new Group()
  mass.userData = { mass: 0 }
  const wall = new Mesh(wallGeometry(), paint('#9b6b43'))
  wall.userData = { part: 'wall', faceEdges: [0, 0, 1, 1] }
  const roof = new Mesh(new BoxGeometry(), paint('#333333'))
  roof.userData = { part: 'roof' }
  const pick = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ visible: false }))
  const edges = new Line(new BufferGeometry(), new LineBasicMaterial())
  const gable = new Mesh(new BoxGeometry(1, 1, 0.2), paint('#9b6b43'))
  gable.position.y = 4
  gable.userData = { part: 'wall', massWide: true }
  const cladding = new Mesh(new BoxGeometry(1, 2, 0.2), paint('#9b6b43'))
  cladding.position.y = 1
  cladding.userData = { part: 'wall', massWide: true }
  const flight = new Group()
  flight.userData = { part: 'rail' }
  flight.add(new Mesh(new BoxGeometry(), paint('#6e5236')))
  mass.add(wall, roof, pick, edges, gable, cladding, flight)
  const rooms = new Group()
  rooms.userData = { sheetSkip: true }
  const bed = new Mesh(new BoxGeometry(), paint('#aa8866'))
  bed.userData = { interiorPart: 'furniture' }
  rooms.add(bed)
  h.add(mass, rooms)
  const t = new Group()
  t.userData = { objectId: 't1' }
  t.position.set(-5, 2, -3)
  t.add(new Mesh(new BoxGeometry(), paint('#3a5a2a')))
  planGroup.add(h, t)
  s.add(planGroup)
  return s
}

const names = (root: Object3D) => root.children.map((c) => c.name)

describe('collectModel', () => {
  const { scene, nodes } = collectModel(liveScene(), plan, { interiors: true })
  const objects = scene.getObjectByName('Objects')!

  test('has the four roots and nothing else at the top', () => {
    expect(names(scene)).toEqual([...ROOTS])
    expect(scene.getObjectByName('gizmo')).toBeUndefined()
  })

  test('puts each object node where its group is, in site terms', () => {
    expect(names(objects)).toEqual(['Twin Pod #h1', 'Madrone #t1'])
    expect(nodes[0]).toEqual({ oid: 'h1', node: 'Twin Pod #h1', x: 10, n: 20, floor: 4.5, rot: 90 })
    expect(objects.children[0].userData).toMatchObject({ oid: 'h1', t: 'house', x: 10, n: 20, floor: 4.5, rot: 90 })
  })

  test('splits a wall mesh into one mesh per edge, leaves out lines and pick targets', () => {
    expect(names(objects.children[0])).toEqual([
      'Twin Pod #h1|wall|m0|e0|0',
      'Twin Pod #h1|wall|m0|e1|1',
      'Twin Pod #h1|roof|m0|2',
      'Twin Pod #h1|gable|m0|3',
      'Twin Pod #h1|wall|m0|4',
      'Twin Pod #h1|rail|m0|5',
      'Twin Pod #h1|furniture|6',
    ])
    const e1 = objects.children[0].children[1] as Mesh
    expect(e1.geometry.getAttribute('position').count).toBe(6)
    expect(e1.userData).toMatchObject({ part: 'wall', ei: 1, mi: 0, wallKind: 'cedar' })
  })

  test('bakes geometry into the node frame and writes uvs in metres for buildings', () => {
    const e0 = objects.children[0].children[0] as Mesh
    expect(e0.geometry.getAttribute('position').getX(0)).toBeCloseTo(0)
    expect(e0.geometry.getAttribute('uv').getX(0)).toBeCloseTo(3.048)
  })

  test('a gable end above the walls is "gable"; cladding down the walls stays "wall"', () => {
    expect(objects.children[0].children[3].userData).toMatchObject({ part: 'gable', decor: true, wallKind: 'cedar' })
    expect(objects.children[0].children[4].userData).toMatchObject({ part: 'wall', decor: true })
  })

  test('a mesh takes the part tag of the nearest group above it', () => {
    expect(objects.children[0].children[5].userData).toMatchObject({ part: 'rail', partSrc: 'planner', railStyle: 'wood' })
  })

  test('tags the rooms inside as interior, or leaves them out', () => {
    expect((objects.children[0].children[6] as Mesh).userData).toMatchObject({ interior: true })
    const without = collectModel(liveScene(), plan, { interiors: false }).scene.getObjectByName('Twin Pod #h1')!
    expect(without.children.some((c) => c.userData.interior)).toBe(false)
  })

  test('names site meshes under their root', () => {
    expect(names(scene.getObjectByName('Terrain')!)).toEqual(['Terrain|terrain|0'])
    expect(names(scene.getObjectByName('Water')!)).toEqual(['Water|water|0'])
  })

  test('never changes the live scene', () => {
    const live = liveScene()
    live.updateMatrixWorld(true)
    const before = JSON.stringify(live.toJSON())
    collectModel(live, plan, { interiors: true })
    expect(JSON.stringify(live.toJSON())).toBe(before)
  })
})

describe('glb helpers', () => {
  const json: GltfJson = {
    asset: { version: '2.0' },
    nodes: [{ name: 'Objects' }, { name: 'Twin Pod #h1|wall|m0|e0|0', mesh: 0, extras: { part: 'wall', ei: 0 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ count: 6 }],
    materials: [{}],
  }

  test('names each glTF mesh after its node and copies its extras', () => {
    const done = finishJson(json)
    expect(done.meshes?.[0]).toMatchObject({ name: 'Twin Pod #h1|wall|m0|e0|0', extras: { part: 'wall', ei: 0 } })
    expect(json.meshes?.[0].name).toBeUndefined()
  })

  test('writes and reads a GLB back, and counts what is in it', () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5])
    const back = readGlb(writeGlb(json, bin))
    expect(back.json).toEqual(json)
    expect(Array.from(back.bin.subarray(0, 5))).toEqual([1, 2, 3, 4, 5])
    expect(countGlb(json)).toEqual({ nodes: 2, meshes: 1, materials: 1, triangles: 2 })
  })
})
