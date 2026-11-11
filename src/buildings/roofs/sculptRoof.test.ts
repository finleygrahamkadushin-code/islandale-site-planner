import { describe, expect, test } from 'vitest'
import { loadSchemes } from '../../site/schemes'
import { pointInPolygon } from '../../site/geom2d'
import { localFootprint, type LocalPoint } from '../footprint'
import { bounds, triangleCount, type MeshData } from '../geom'
import { buildingMasses, massPoly, type Mass } from '../masses'
import { polyOffset } from '../organic'
import { buildRoof } from './roof'
import { isSculpted, roofFinishOf, roofSurface, sculptedRoof, sculptRiseFt, type SculptMass } from './sculptRoof'
import { M_PER_FT as FT } from '../../site/units'

const toM = (P: readonly LocalPoint[]) => P.map(([x, z]) => [x * FT, z * FT] as const)
const mass = (o: Partial<SculptMass> & Pick<SculptMass, 'roof'>): SculptMass => ({ pitch: 6, ridge: 'x', overhang: 0, open: false, ...o })
const rect = (w: number, d: number) => toM(localFootprint({ w, d }))

describe('dome', () => {
  // a 20 ft circle at 6/12: S = 6.096 m, cap rise H0 = 0.5 * S / 2
  const circle = toM(localFootprint({ w: 20, d: 20, shape: 'ellipse' }))
  const surf = roofSurface(circle, 'dome', { pitch: 6 })
  const R = 10 * FT
  const H0 = (0.5 * 20 * FT) / 2

  test('is a spherical cap on a circle: highest at the centre, at the cap height', () => {
    expect(surf.at(0, 0).h).toBeCloseTo(H0, 1)
    const Rs = (R * R + H0 * H0) / (2 * H0)
    for (const r of [0.25, 0.5, 0.75].map((k) => k * R)) {
      const cap = Math.sqrt(Rs * Rs - r * r) - (Rs - H0)
      expect(Math.abs(surf.at(r, 0).h - cap)).toBeLessThan(0.04 * H0)
    }
    expect(Math.max(...surf.H)).toBeLessThanOrEqual(H0 + 1e-9)
  })

  test('is symmetric about both axes on a circle, and zero on the eave', () => {
    for (const r of [0.3, 0.6, 0.9].map((k) => k * R)) {
      const h = surf.at(r, 0).h
      for (const [x, z] of [[-r, 0], [0, r], [0, -r]]) expect(surf.at(x, z).h).toBeCloseTo(h, 2)
    }
    for (const p of surf.ring) expect(p.h).toBe(0)
  })

  test('the slab top faces up and its normals are unit length', () => {
    const r = sculptedRoof(localFootprint({ w: 20, d: 20, shape: 'ellipse' }), mass({ roof: 'dome' }))
    expect(triangleCount(r.slab)).toBeGreaterThan(100)
    for (let i = 0; i < r.slab.normals.length; i += 3) {
      expect(Math.hypot(r.slab.normals[i], r.slab.normals[i + 1], r.slab.normals[i + 2])).toBeCloseTo(1, 6)
      expect(r.slab.normals[i + 1]).toBeGreaterThan(0)
    }
    for (let i = 0; i < r.soffit.normals.length; i += 3) expect(r.soffit.normals[i + 1]).toBeLessThan(0)
    // rise: the cap plus the dome slab
    expect(r.rise).toBeCloseTo(H0 + 0.18, 1)
  })

  test('a kidney gets a smooth bean, symmetric left to right', () => {
    const k = toM(localFootprint({ w: 30, d: 16, shape: 'kidney' }))
    const s = roofSurface(k, 'dome', { pitch: 4 })
    for (const [x, z] of [[1, 0.5], [2.5, 1], [3.5, -0.2]]) expect(s.at(x, z).h).toBeCloseTo(s.at(-x, z).h, 2)
  })
})

describe('symmetric outlines', () => {
  // the grid is symmetric about a centred outline, so every vertex has a mirror image to compare heights with
  const mirrorCheck = (type: 'dome' | 'sod' | 'vault' | 'shell' | 'saddle', mx: number, mz: number, sign: 1 | -1) => {
    const s = roofSurface(rect(30, 18), type, { pitch: 6, ridge: 'x' })
    const key = (x: number, z: number) => `${Math.round(x * 1e4)}_${Math.round(z * 1e4)}`
    const at = new Map(s.V.map((v, i) => [key(v[0], v[1]), s.H[i]]))
    let checked = 0
    s.V.forEach(([x, z], i) => {
      const h = at.get(key(mx * x, mz * z))
      if (h === undefined) return
      checked++
      // the membrane is solved to a tolerance, sweeping one way, so it is symmetric to a tenth of a millimetre
      expect(sign > 0 ? h : s.H0 - h).toBeCloseTo(s.H[i], 3)
    })
    expect(checked).toBe(s.V.length)
  }
  test.each(['dome', 'sod', 'vault'] as const)('%s mirrors left to right and front to back', (type) => {
    mirrorCheck(type, -1, 1, 1)
    mirrorCheck(type, 1, -1, 1)
  })
  test('the shell mirrors across its sweep', () => mirrorCheck('shell', -1, 1, 1))
  test('the saddle turns over: a mirror image is the rise less the height', () => mirrorCheck('saddle', -1, 1, -1))
})

describe('vault', () => {
  test('its crown runs along the ridge at pitch × half span, and arcs down to the eaves', () => {
    const P = rect(30, 16)
    const half = 8 * FT
    const x = roofSurface(P, 'vault', { pitch: 6, ridge: 'x' })
    for (const u of [-4, -1.5, 0, 2, 4.2]) expect(x.at(u, 0).h).toBeCloseTo(0.5 * half, 2)
    expect(x.at(0, half * 0.6).h).toBeLessThan(x.at(0, 0).h)
    expect(x.at(0, half).h).toBeCloseTo(0, 4)
    // the crown line is drawn along the ridge
    const r = sculptedRoof(localFootprint({ w: 30, d: 16 }), mass({ roof: 'vault' }))
    const crown = r.lines.find((l) => l.kind === 'crown')
    expect(crown?.segments.length).toBeGreaterThan(0)
    for (const p of crown?.segments ?? []) expect(Math.abs(p[2])).toBeLessThan(0.05)
  })

  test('ridge z turns it ninety degrees', () => {
    const z = roofSurface(rect(30, 16), 'vault', { pitch: 6, ridge: 'z' })
    // now it spans the 30 ft side
    expect(z.at(0, 1).h).toBeCloseTo(0.5 * 15 * FT, 2)
  })
})

describe('shell', () => {
  const P = toM(localFootprint({ w: 30, d: 20, shape: 'ellipse' }))
  const tip = (curl: number) => roofSurface(P, 'shell', { pitch: 6, ridge: 'z', curl })

  test('sweeps up toward its tip (+x for ridge z) and is highest on the centreline', () => {
    const s = tip(0.5)
    expect(s.at(3.5, 0).h).toBeGreaterThan(s.at(0, 0).h)
    expect(s.at(0, 0).h).toBeGreaterThan(s.at(-3.5, 0).h)
    expect(s.at(2, 0).h).toBeGreaterThan(s.at(2, 1.8).h)
  })

  test('more curl lifts the tip and lowers the middle of the sweep against it', () => {
    const lo = tip(0.2)
    const hi = tip(0.9)
    expect(hi.at(4.3, 0).h).toBeGreaterThan(lo.at(4.3, 0).h)
    expect(hi.at(0, 0).h / hi.at(4.3, 0).h).toBeLessThan(lo.at(0, 0).h / lo.at(4.3, 0).h)
    expect(hi.Hl).toBeGreaterThan(lo.Hl)
  })
})

describe('saddle', () => {
  test('two opposite corners high, the other two low, the middle at half', () => {
    const s = roofSurface(rect(24, 16), 'saddle', { pitch: 6, ridge: 'x' })
    const [x0, x1, z0, z1] = s.bbox
    const e = 0.02
    const high = [s.at(x0 + e, z0 + e).h, s.at(x1 - e, z1 - e).h]
    const low = [s.at(x0 + e, z1 - e).h, s.at(x1 - e, z0 + e).h]
    for (const h of high) expect(h).toBeGreaterThan(0.9 * s.H0)
    for (const h of low) expect(h).toBeLessThan(0.1 * s.H0)
    expect(s.at(0, 0).h).toBeCloseTo(s.H0 / 2, 2)
    // ridge z swaps the pair
    const z = roofSurface(rect(24, 16), 'saddle', { pitch: 6, ridge: 'z' })
    expect(z.at(x0 + e, z1 - e).h).toBeGreaterThan(0.9 * z.H0)
  })
})

describe('sod tufts', () => {
  const blob = localFootprint({ w: 28, d: 21, shape: 'blob' })
  test('are the same for the same seed, different for another, and stay on the roof', () => {
    const a = sculptedRoof(blob, mass({ roof: 'sod', pitch: 2 }), 42)
    const b = sculptedRoof(blob, mass({ roof: 'sod', pitch: 2 }), 42)
    const c = sculptedRoof(blob, mass({ roof: 'sod', pitch: 2 }), 7)
    expect(a.tufts.length).toBeGreaterThan(10)
    expect(a.tufts).toEqual(b.tufts)
    expect(a.blooms).toEqual(b.blooms)
    expect(c.tufts).not.toEqual(a.tufts)
    const outline = toM(blob)
    for (const t of a.tufts) expect(pointInPolygon(outline, t.at[0], t.at[2])).toBe(true)
  })

  test('only sod roofs grow grass; the default seed comes from the outline', () => {
    expect(sculptedRoof(blob, mass({ roof: 'dome' })).tufts).toHaveLength(0)
    expect(sculptedRoof(blob, mass({ roof: 'dome', roofMat: 'sod' })).tufts.length).toBeGreaterThan(0)
    expect(sculptedRoof(blob, mass({ roof: 'sod' })).tufts).toEqual(sculptedRoof(blob, mass({ roof: 'sod' })).tufts)
  })
})

describe('under the slab', () => {
  const ell = localFootprint({ w: 20, d: 14, shape: 'ellipse' })
  const sumY = (m: MeshData) => bounds(m).max[1]

  test('dome and sod close the gap above the walls with cladding, vault/shell/saddle with glass and mullions', () => {
    const dome = sculptedRoof(ell, mass({ roof: 'dome', overhang: 1.5 }))
    expect(dome.infillKind).toBe('clad')
    expect(triangleCount(dome.infill)).toBeGreaterThan(0)
    expect(dome.lines.some((l) => l.kind === 'mullion')).toBe(false)
    const shell = sculptedRoof(ell, mass({ roof: 'shell', ridge: 'z', curl: 0.7 }))
    expect(shell.infillKind).toBe('glass')
    expect(shell.lines.some((l) => l.kind === 'mullion')).toBe(true)
    // the infill reaches no higher than the soffit
    expect(sumY(shell.infill)).toBeLessThanOrEqual(sumY(shell.soffit) + 1e-6)
  })

  test('an open porch gets struts and no infill', () => {
    const r = sculptedRoof(ell, mass({ roof: 'shell', ridge: 'z', open: true }))
    expect(triangleCount(r.infill)).toBe(0)
    expect(triangleCount(r.struts)).toBeGreaterThan(0)
  })

  test('the fascia faces outward all round', () => {
    const r = sculptedRoof(ell, mass({ roof: 'dome', overhang: 1 }))
    const p = r.fascia.positions
    const n = r.fascia.normals
    for (let i = 0; i < p.length; i += 3) expect(p[i] * n[i] + p[i + 2] * n[i + 2]).toBeGreaterThan(0)
  })

  test('a glass roof gets a thin slab and a mullion grid', () => {
    const r = sculptedRoof(ell, mass({ roof: 'dome', roofMat: 'glass' }))
    expect(r.finish).toBe('glass')
    expect(r.infillKind).toBe('glass')
    expect(r.lines.filter((l) => l.kind === 'mullion').length).toBeGreaterThan(0)
  })
})

describe('roof finish', () => {
  test('a mass\'s own, else the building\'s on the main mass, else sod on a sod roof (legacy roofMatOf)', () => {
    expect(roofFinishOf({ roof: 'gable', roofMat: 'copper', main: false })).toBe('copper')
    expect(roofFinishOf({ roof: 'gable', main: true }, 'glass')).toBe('glass')
    expect(roofFinishOf({ roof: 'gable', main: false }, 'glass')).toBeNull()
    expect(roofFinishOf({ roof: 'sod', main: false })).toBe('sod')
    expect(roofFinishOf({ roof: 'gable', roofMat: 'shake', main: false })).toBeNull()
  })
})

describe('the height check reads the finish (review fix R4.5)', () => {
  // the reported rise must change with the finish exactly as the built roof does
  const circle = localFootprint({ w: 20, d: 20, shape: 'ellipse' })
  const dims = { w: 20, d: 20, curl: 0.5 }
  for (const roof of ['dome', 'vault', 'shell', 'saddle', 'sod'] as const) {
    test(`${roof}: each finish adds to the reported rise what it adds to the built one`, () => {
      const plain = mass({ roof })
      const builtPlain = sculptedRoof(circle, plain).rise / FT
      const toldPlain = sculptRiseFt({ ...plain, ...dims })
      for (const roofMat of ['sod', 'glass', 'copper']) {
        const m = mass({ roof, roofMat })
        const built = sculptedRoof(circle, m).rise / FT - builtPlain
        const told = sculptRiseFt({ ...m, ...dims }) - toldPlain
        expect(told, `${roof} ${roofMat}`).toBeCloseTo(built, 2)
      }
    })
  }
})

describe('schemes D–I', () => {
  const schemes = loadSchemes().slice(6, 12)
  const masses = schemes.flatMap((s) =>
    s.objects.filter((o) => o.t === 'house').flatMap((o) => buildingMasses(o as Record<string, unknown>).filter((m) => isSculpted(m.roof)).map((m) => ({ id: `${s.id} ${o.name} ${m.roof}`, m }))),
  )

  test('every scheme has sculpted roofs', () => {
    expect(new Set(masses.map((x) => x.id.split(' ')[0]))).toEqual(new Set(['D', 'E', 'F', 'G', 'H', 'I']))
  })

  test.each(masses.map((x) => [x.id, x.m] as const))('%s builds a closed slab that rises as sculptRiseFt says', (_, m: Mass) => {
    const r = sculptedRoof(massPoly(m), m)
    expect(triangleCount(r.slab)).toBeGreaterThan(20)
    expect(triangleCount(r.fascia)).toBeGreaterThan(10)
    for (const v of r.slab.positions) expect(Number.isFinite(v)).toBe(true)
    const want = sculptRiseFt(m) * FT
    expect(Math.abs(r.rise - want)).toBeLessThan(0.15 * want + 0.25)
    // the slab covers the walls grown by the overhang
    const b = bounds(r.slab)
    const grown = polyOffset(massPoly(m), m.overhang).map(([x]) => x * FT)
    expect(b.max[0]).toBeCloseTo(Math.max(...grown), 1)
  })
})

describe('gambrel', () => {
  test('has two pitches a side: steep below the quarter-span knuckle, shallow above', () => {
    const r = buildRoof(localFootprint({ w: 24, d: 16 }), { type: 'gambrel', pitch: 6, ridge: 'x', overhangFt: 0 })
    const slopes = new Set<number>()
    for (let i = 0; i < r.roof.normals.length; i += 3) {
      const [nx, ny, nz] = [r.roof.normals[i], r.roof.normals[i + 1], r.roof.normals[i + 2]]
      if (ny > 0.01) slopes.add(Math.round((Math.hypot(nx, nz) / ny) * 1000) / 1000)
    }
    // H = 0.5 × 16 ft / 2; Hg = 1.3 H; the knuckle at 0.72 Hg a quarter span in
    const lower = (1.3 * 0.72 * 0.5 * 8) / 4
    const upper = (1.3 * 0.28 * 0.5 * 8) / 4
    expect([...slopes].sort()).toEqual([upper, lower].map((v) => Math.round(v * 1000) / 1000).sort())
    expect(r.rise / FT).toBeCloseTo(1.3 * 4, 6)
    expect(triangleCount(r.gables)).toBeGreaterThan(0)
  })

  test('is no longer drawn as a gable', () => {
    const g = buildRoof(localFootprint({ w: 24, d: 16 }), { type: 'gable', pitch: 6, ridge: 'x', overhangFt: 0 })
    const m = buildRoof(localFootprint({ w: 24, d: 16 }), { type: 'gambrel', pitch: 6, ridge: 'x', overhangFt: 0 })
    expect(m.rise).toBeGreaterThan(g.rise)
  })
})

describe('prow tip column', () => {
  const prowOf = (id: string): Mass => {
    const o = loadSchemes().find((s) => s.id === id)?.objects.find((x) => x.name === 'Gathering prow')
    return buildingMasses(o as Record<string, unknown>)[0]
  }
  const roofOf = (m: Mass) =>
    buildRoof(massPoly(m), { type: m.roof, pitch: m.pitch, ridge: m.ridge, overhangFt: m.overhang, prow: { roofPts: m.roofPts, gable: m.gable, vault: m.vault, dip: m.roofDip } })

  test('C4\'s shell gets one column under its tip, under the roof', () => {
    const m = prowOf('C4')
    const r = roofOf(m)
    expect(r.tip).toBeDefined()
    const tip = r.tip!
    const out = (m.roofPts ?? []).map(([x, z]) => [x * FT, z * FT] as const)
    expect(pointInPolygon(out, tip.x, tip.z)).toBe(true)
    expect(tip.top).toBeGreaterThan(-ftToMetres(m.h))
    expect(tip.top).toBeLessThan(r.rise)
  })

  test('C\'s prow, with no roof outline of its own, has none; tipPost false turns it off', () => {
    expect(roofOf(prowOf('C')).tip).toBeUndefined()
    const m = prowOf('C4')
    const off = buildRoof(massPoly(m), { type: 'prow', pitch: m.pitch, ridge: m.ridge, overhangFt: m.overhang, prow: { roofPts: m.roofPts, vault: m.vault }, tipPost: false })
    expect(off.tip).toBeUndefined()
  })
})

const ftToMetres = (ft: number) => ft * FT

describe('box roofs face up (review fix)', () => {
  test('every slope of a low gable, hip, gambrel and butterfly faces up', async () => {
    const { buildRoof } = await import('./roof')
    const rect = [[-10, -6], [10, -6], [10, 6], [-10, 6]] as const
    for (const type of ['gable', 'hip', 'gambrel', 'butterfly', 'shed']) {
      for (const pitch of [1, 2, 6]) {
        const r = buildRoof(rect, { type, pitch, ridge: 'x', overhangFt: 1.5 })
        for (let i = 1; i < r.roof.normals.length; i += 3) expect(r.roof.normals[i], `${type} ${pitch}`).toBeGreaterThan(0)
      }
    }
  })
})
