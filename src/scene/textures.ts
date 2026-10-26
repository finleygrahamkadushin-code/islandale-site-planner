import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Procedural textures drawn on a canvas, so nothing is downloaded. Each is
 * greyscale-ish detail meant to be multiplied by the material colour, and is
 * drawn for a known real-world tile size so `repeat` can make it true size.
 */
export interface TileTexture {
  readonly texture: Texture
  /** Real-world size of one tile, feet: [u, v]. */
  readonly tileFt: readonly [number, number]
}

const cache = new Map<string, TileTexture>()

function make(key: string, px: [number, number], tileFt: [number, number], draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): TileTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = px[0]
  canvas.height = px[1]
  const g = canvas.getContext('2d')
  if (!g) throw new Error('2D canvas is not available')
  draw(g, px[0], px[1])
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  const out = { texture, tileFt }
  cache.set(key, out)
  return out
}

/** Seeded noise so textures are the same every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, seed: number, amount: number, alpha: number) {
  const r = rng(seed)
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(r() * 255)
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }
}

/** Board-and-batten: 12 in boards with 2.5 in battens, 8 ft tile. */
export function battenSiding(): TileTexture {
  return make('batten', [256, 256], [8, 8], (g, w, h) => {
    g.fillStyle = '#e6e6e6'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 11, 2500, 0.06)
    const board = w / 8
    for (let i = 0; i < 8; i++) {
      const x = i * board
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(x + board - 3, 0, 2, h)
      g.fillStyle = '#f4f4f4'
      g.fillRect(x - 3, 0, 7, h)
      g.fillStyle = 'rgba(0,0,0,0.18)'
      g.fillRect(x + 4, 0, 2, h)
    }
  })
}

/** Horizontal lap siding: 6 in exposure, 8 ft tile. */
export function lapSiding(): TileTexture {
  return make('lap', [256, 256], [8, 8], (g, w, h) => {
    g.fillStyle = '#e8e8e8'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 12, 2000, 0.05)
    const course = h / 16
    for (let i = 0; i < 16; i++) {
      const y = i * course
      const grad = g.createLinearGradient(0, y, 0, y + course)
      grad.addColorStop(0, 'rgba(0,0,0,0.22)')
      grad.addColorStop(0.18, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(255,255,255,0.06)')
      g.fillStyle = grad
      g.fillRect(0, y, w, course)
    }
  })
}

/** Cedar shingles: 5 in courses, staggered joints, 4 ft tile. */
export function shingleSiding(): TileTexture {
  return make('shingle', [256, 256], [4, 4], (g, w, h) => {
    g.fillStyle = '#e0e0e0'
    g.fillRect(0, 0, w, h)
    const r = rng(13)
    const rows = 10
    const rh = h / rows
    for (let row = 0; row < rows; row++) {
      let x = -r() * 20
      while (x < w) {
        const sw = 14 + r() * 22
        const v = 205 + Math.floor(r() * 45)
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect(x, row * rh, sw - 1.5, rh)
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.fillRect(x + sw - 1.5, row * rh, 1.5, rh)
        x += sw
      }
      g.fillStyle = 'rgba(0,0,0,0.3)'
      g.fillRect(0, row * rh + rh - 2, w, 2)
    }
  })
}

/** Standing-seam metal: seams 16 in apart, 8 ft tile. */
export function standingSeam(): TileTexture {
  return make('seam', [256, 256], [8, 8], (g, w, h) => {
    g.fillStyle = '#d8d8d8'
    g.fillRect(0, 0, w, h)
    const pitch = w / 6
    for (let i = 0; i < 6; i++) {
      const x = i * pitch
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.fillRect(x, 0, 2, h)
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x + 2, 0, 2, h)
    }
  })
}

/** Cedar shakes on a roof: 7 in courses, 4 ft tile. */
export function shakeRoof(): TileTexture {
  return make('shake', [256, 256], [4, 4], (g, w, h) => {
    g.fillStyle = '#cfcfcf'
    g.fillRect(0, 0, w, h)
    const r = rng(21)
    const rows = 7
    const rh = h / rows
    for (let row = 0; row < rows; row++) {
      let x = -r() * 30
      while (x < w) {
        const sw = 18 + r() * 26
        const v = 180 + Math.floor(r() * 60)
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect(x, row * rh, sw - 2, rh)
        x += sw
      }
      g.fillStyle = 'rgba(0,0,0,0.4)'
      g.fillRect(0, row * rh + rh - 3, w, 3)
    }
  })
}

/** Sod / green roof and meadow grass: soft clumps, 6 ft tile. */
export function grass(): TileTexture {
  return make('grass', [256, 256], [20, 20], (g, w, h) => {
    g.fillStyle = '#d9d9d9'
    g.fillRect(0, 0, w, h)
    const r = rng(31)
    for (let i = 0; i < 9000; i++) {
      const v = 150 + Math.floor(r() * 105)
      g.fillStyle = `rgba(${v},${v},${v},0.5)`
      const x = r() * w
      const y = r() * h
      g.fillRect(x, y, 1, 2 + r() * 3)
    }
  })
}

/** Deck boards: 5.5 in boards with 1/4 in gaps, 8 ft tile. */
export function deckBoards(): TileTexture {
  return make('deck', [256, 256], [8, 8], (g, w, h) => {
    g.fillStyle = '#e2e2e2'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 41, 3000, 0.07)
    const n = 17
    const bh = h / n
    const r = rng(42)
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(0, i * bh, w, 1.5)
      const joint = r() * w
      g.fillRect(joint, i * bh, 1.5, bh)
    }
  })
}

/** Board-formed concrete: faint pours and speckle, 8 ft tile. */
export function concrete(): TileTexture {
  return make('concrete', [128, 128], [8, 8], (g, w, h) => {
    g.fillStyle = '#d4d4d4'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 51, 2500, 0.08)
    g.fillStyle = 'rgba(0,0,0,0.08)'
    g.fillRect(0, h / 2, w, 1)
  })
}

/** Gravel for pads and paths: 4 ft tile. */
export function gravel(): TileTexture {
  return make('gravel', [256, 256], [4, 4], (g, w, h) => {
    g.fillStyle = '#d0d0d0'
    g.fillRect(0, 0, w, h)
    const r = rng(61)
    for (let i = 0; i < 2600; i++) {
      const v = 140 + Math.floor(r() * 115)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.beginPath()
      g.arc(r() * w, r() * h, 0.8 + r() * 2.2, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** A copy of a tile texture repeated so one unit of UV is one foot. */
export function perFoot(tile: TileTexture): Texture {
  const t = tile.texture.clone()
  t.repeat.set(1 / tile.tileFt[0], 1 / tile.tileFt[1])
  t.needsUpdate = true
  return t
}

/** A copy repeated so one unit of UV is one metre (terrain UVs are metres). */
export function perMetre(tile: TileTexture): Texture {
  const t = tile.texture.clone()
  t.repeat.set(1 / (tile.tileFt[0] * 0.3048), 1 / (tile.tileFt[1] * 0.3048))
  t.needsUpdate = true
  return t
}
