import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { readGlb } from '../src/export/model3d/glb'

/** Export 3D model (6B): Scheme C as a .glb and manifest in the Blender pipeline's contract, from the top bar's 3D model button. */

const ROOTS = ['Terrain', 'Earthworks', 'Water', 'Objects']
const SETTLE_POLLS = 3
const POLL_MS = 500

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => typeof (window as any).islandale?.exportModel === 'function', null, { timeout: 60_000 })
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
  await settled(page)
})

/** Scene mesh and triangle counts unchanged for a few polls. */
async function settled(page: Page) {
  let last = ''
  let stable = 0
  while (stable < SETTLE_POLLS) {
    await page.waitForTimeout(POLL_MS)
    const now = JSON.stringify(await page.evaluate(() => (window as any).islandale.sceneStats()))
    stable = now === last ? stable + 1 : 0
    last = now
  }
}

const bytesOf = async (d: Download) => new Uint8Array(await readFile((await d.path())!))

test('the 3D model button downloads Scheme C as a tagged .glb and its manifest', async ({ page }) => {
  const downloads: Download[] = []
  page.on('download', (d) => downloads.push(d))
  const plan = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return { order: s.plan.order as string[], objects: s.plan.objects as Record<string, { name: string; type: string; hidden: boolean }> }
  })
  await page.getByTestId('export-3d').click()
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(2)
  expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual(['c-prow-lantern.glb', 'c-prow-lantern.manifest.json'])

  const glbDownload = downloads.find((d) => d.suggestedFilename().endsWith('.glb'))!
  const { json } = readGlb(await bytesOf(glbDownload))
  const nodes = json.nodes as { name?: string; children?: number[]; mesh?: number; extras?: Record<string, unknown> }[]
  const scene = (json.scenes as { nodes: number[] }[])[0]
  expect(scene.nodes.map((i) => nodes[i].name)).toEqual(ROOTS)

  const objectNodes = (nodes[scene.nodes[3]].children ?? []).map((i) => nodes[i])
  const visible = plan.order.filter((id) => !plan.objects[id].hidden)
  expect(objectNodes.map((n) => n.name)).toEqual(visible.map((id) => `${plan.objects[id].name} #${id}`))

  for (const obj of objectNodes.filter((n) => n.extras?.t === 'house')) {
    const meshes = (obj.children ?? []).map((i) => nodes[i])
    expect(meshes.length).toBeGreaterThan(0)
    for (const m of meshes) {
      expect(m.extras?.part, m.name).toBeTruthy()
      expect(m.name?.startsWith(`${obj.name}|`)).toBe(true)
    }
    expect(meshes.some((m) => m.extras?.part === 'wall' && typeof m.extras?.ei === 'number')).toBe(true)
  }

  const manifestDownload = downloads.find((d) => d.suggestedFilename().endsWith('.json'))!
  const manifest = JSON.parse(new TextDecoder().decode(await bytesOf(manifestDownload)))
  expect(manifest).toMatchObject({ format: 'islandale-export/1', exag: 1, from: 'app', schemeId: 'C' })
  expect(manifest.objects).toHaveLength(objectNodes.length)
  await expect(page.getByText(/Saved c-prow-lantern\.glb/)).toBeVisible()
})

test('Export 3D model is in command search', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('Export 3D')
  await expect(page.getByRole('option', { name: /Export 3D model/ })).toBeVisible()
})
