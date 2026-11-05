import { describe, expect, test } from 'vitest'
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene, SphereGeometry, Vector3, type Material, type Object3D } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { edgeTable } from './edgeTable'
import { copiesOf, EdgeCache, findSheetTarget, frameBounds, isDrawable, isLineLike, meshLines, paints, seeThrough } from './sheetTarget'

const box = (name: string, material: Material = new MeshStandardMaterial()) => Object.assign(new Mesh(new BoxGeometry(1, 1, 1), material), { name })
const names = (xs: Iterable<Object3D>) => [...xs].map((x) => x.name).filter(Boolean).sort()

/** A scene like the planner's: a cabin with everything a part may add, a neighbour, retaining walls, the ground. */
function site() {
  const scene = new Scene()
  const cabin = new Group()
  cabin.userData = { objectId: 'C-0' }
  const mass = new Group()
  mass.add(box('wall'), box('glass', new MeshStandardMaterial({ transparent: true, opacity: 0.3 })), box('pick', new MeshBasicMaterial({ visible: false })))
  const hidden = box('hidden')
  hidden.visible = false
  mass.add(hidden)
  const rooms = new Group()
  rooms.userData = { sheetSkip: true }
  rooms.add(box('partition'))
  const tufts = Object.assign(new InstancedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial(), 3), { name: 'tufts' })
  tufts.userData = { part: 'roof', sheetSkip: true }
  const planters = Object.assign(new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 2), { name: 'planters' })
  planters.setColorAt(0, new Color('red'))
  // the Sketch style's outline (drei Edges): a mesh of screen-space line quads
  const sketch = Object.assign(new LineSegments2(new LineSegmentsGeometry(), new LineMaterial()), { name: 'sketch lines' })
  cabin.add(mass, rooms, tufts, planters, sketch)
  const neighbour = new Group()
  neighbour.userData = { objectId: 'C-1' }
  neighbour.add(box('neighbour wall'))
  const walls = new Group()
  const ours = box('our retaining wall')
  ours.userData = { sheetOwner: 'C-0' }
  const theirs = box('their retaining wall')
  theirs.userData = { sheetOwner: 'C-1' }
  walls.add(ours, theirs)
  scene.add(cabin, neighbour, walls, box('ground'))
  return scene
}

describe('findSheetTarget', () => {
  test('draws the cabin and what it owns; leaves out its rooms, dressing, pick targets, hidden parts and everything else', () => {
    const { meshes, inside } = findSheetTarget(site(), 'C-0')
    expect(names(meshes)).toEqual(['glass', 'our retaining wall', 'planters', 'wall'])
    expect(names(inside)).toEqual(['glass', 'hidden', 'our retaining wall', 'pick', 'planters', 'sketch lines', 'wall'])
  })

  test('a skipped or hidden subtree is not found at all, even by its own id', () => {
    const scene = site()
    const off = new Group()
    off.userData = { objectId: 'C-9' }
    off.visible = false
    off.add(box('hidden cabin'))
    scene.add(off)
    expect(findSheetTarget(scene, 'C-9').meshes).toHaveLength(0)
    expect(findSheetTarget(scene, 'nobody').meshes).toHaveLength(0)
  })

  test('fat lines are lines, not meshes to fill; groups draw nothing themselves', () => {
    const fat = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial())
    expect(fat.isMesh).toBe(true)
    expect(isLineLike(fat)).toBe(true)
    expect(isDrawable(fat)).toBe(true)
    expect(isLineLike(box('wall'))).toBe(false)
    expect(isDrawable(new Group())).toBe(false)
  })

  test('glass is see-through and paints; an invisible pick target does not paint', () => {
    expect(seeThrough(box('g', new MeshStandardMaterial({ transparent: true, opacity: 0.3 })))).toBe(true)
    expect(seeThrough(box('w'))).toBe(false)
    expect(paints(box('p', new MeshBasicMaterial({ visible: false })))).toBe(false)
    expect(paints(box('z', new MeshBasicMaterial({ transparent: true, opacity: 0 })))).toBe(false)
  })
})

describe('instanced meshes', () => {
  function pair() {
    const m = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 2)
    m.setMatrixAt(0, new Matrix4().makeTranslation(-3, 0, 0))
    m.setMatrixAt(1, new Matrix4().makeTranslation(4, 2, 0))
    m.updateMatrixWorld()
    return m
  }

  test('every copy counts for the bounds', () => {
    const b = frameBounds([pair()], new Matrix4())
    expect([b.minX, b.maxX, b.minY, b.maxY]).toEqual([-3.5, 4.5, -0.5, 2.5])
    expect(copiesOf(box('one'))).toHaveLength(1)
  })

  test('every copy draws its own edges, where it stands', () => {
    const m = pair()
    const lines = meshLines(m, new Vector3(0, 0, -1), edgeTable(m.geometry))
    expect(lines.length / 6).toBe(24)
    const xs = Array.from(lines).filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeCloseTo(-3.5, 6)
    expect(Math.max(...xs)).toBeCloseTo(4.5, 6)
  })
})

describe('meshLines', () => {
  test('a sphere under a turned, stretched parent draws its outline as the camera sees it', () => {
    const parent = new Group()
    parent.scale.set(2, 1, 0.5)
    parent.rotation.y = 0.7
    const ball = new Mesh(new SphereGeometry(1, 64, 32), new MeshStandardMaterial())
    parent.add(ball)
    parent.updateMatrixWorld(true)
    const lines = meshLines(ball, new Vector3(0, 0, -1), edgeTable(ball.geometry))
    const world = (arr: ArrayLike<number>) => Array.from({ length: arr.length / 3 }, (_, i) => new Vector3(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(ball.matrixWorld))
    const drawn = world(lines)
    const all = world(ball.geometry.attributes.position.array)
    const span = (ps: Vector3[], k: 'x' | 'y') => [Math.min(...ps.map((p) => p[k])), Math.max(...ps.map((p) => p[k]))]
    // the drawing reaches the ellipsoid's widest and tallest points as seen
    for (const k of ['x', 'y'] as const) {
      const [a, b] = [span(drawn, k), span(all, k)]
      expect(a[0]).toBeCloseTo(b[0], 2)
      expect(a[1]).toBeCloseTo(b[1], 2)
    }
    // and nothing is drawn over the middle of the face turned to the camera
    const centre = drawn.filter((p) => Math.hypot(p.x, p.y) < 0.5)
    expect(centre).toHaveLength(0)
  })

  test('the cache keeps a table per geometry, rebuilt when its vertices change and dropped when it is disposed', () => {
    const cache = new EdgeCache()
    const g = new BoxGeometry(1, 1, 1)
    const t = cache.get(g)
    expect(cache.get(g)).toBe(t)
    g.attributes.position.needsUpdate = true
    expect(cache.get(g)).not.toBe(t)
    g.dispose()
    cache.dispose()
  })
})
