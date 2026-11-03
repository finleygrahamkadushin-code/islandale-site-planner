import { envelopeOf } from './envelope'
import * as G from './geom'
import type { Floor, RoomType } from './types'

/**
 * Each cabin's room program and the checklist against it (old
 * INT.model.PROGRAMS, cabinTypeOf and checkProgram). Areas in square feet.
 */
interface ProgramItem {
  readonly key: string
  readonly label: string
  readonly types: readonly RoomType[]
  /** A room whose name matches is preferred for this item. */
  readonly re: RegExp | null
  readonly min: number
  readonly target: number
  /** Shortest side the room must have, feet. */
  readonly minSide?: number
}

export interface Program {
  readonly label: string
  readonly total: number
  readonly items: readonly ProgramItem[]
}

export const PROGRAMS: Readonly<Record<string, Program>> = {
  gathering: {
    label: 'Gathering cabin',
    total: 650,
    items: [
      { key: 'kitchen', label: 'Kitchen', types: ['kitchen'], re: null, min: 90, target: 150 },
      { key: 'pantry', label: 'Pantry', types: ['pantry', 'closet'], re: /pantry/i, min: 12, target: 32 },
      { key: 'dining', label: 'Dining for 8', types: ['dining'], re: null, min: 110, target: 160, minSide: 9 },
      { key: 'lounge', label: 'Lounge', types: ['living'], re: null, min: 130, target: 210 },
      { key: 'powder', label: 'Powder room', types: ['bath'], re: null, min: 18, target: 28 },
      { key: 'entry', label: 'Entry', types: ['entry', 'mudroom'], re: null, min: 24, target: 45 },
    ],
  },
  family: {
    label: 'Family cabin · Maya, Ren, Leo & Ana',
    total: 270,
    items: [
      { key: 'parents', label: "Parents' room", types: ['bedroom'], re: /parent|maya|primary/i, min: 100, target: 110 },
      { key: 'bunks', label: "Kids' bunk room", types: ['bedroom'], re: /bunk|leo|ana|kids/i, min: 65, target: 75 },
      { key: 'bath', label: 'Bath', types: ['bath'], re: null, min: 35, target: 40 },
      { key: 'storage', label: 'Storage', types: ['closet', 'utility', 'laundry', 'pantry'], re: null, min: 10, target: 20 },
      { key: 'hall', label: 'Hall', types: ['hall'], re: null, min: 16, target: 40 },
    ],
  },
  familyAll: {
    label: 'Family sleeping cabin',
    total: 500,
    items: [
      { key: 'parents', label: "Parents' room", types: ['bedroom'], re: /parent|maya|primary/i, min: 100, target: 120 },
      { key: 'bunks', label: "Kids' bunk room", types: ['bedroom'], re: /bunk|leo|ana|kids/i, min: 65, target: 90 },
      { key: 'daniel', label: "Daniel's room", types: ['bedroom'], re: /daniel/i, min: 50, target: 70 },
      { key: 'sofia', label: "Sofia's room", types: ['bedroom'], re: /sofia/i, min: 50, target: 70 },
      { key: 'bath', label: 'Bath', types: ['bath'], re: null, min: 35, target: 45 },
      { key: 'storage', label: 'Storage', types: ['closet', 'utility', 'laundry', 'pantry'], re: null, min: 10, target: 20 },
      { key: 'hall', label: 'Hall', types: ['hall'], re: null, min: 16, target: 40 },
    ],
  },
  twin: {
    label: 'Twin cabin · Daniel & Sofia',
    total: 210,
    items: [
      { key: 'daniel', label: "Daniel's room", types: ['bedroom'], re: /daniel/i, min: 50, target: 70 },
      { key: 'sofia', label: "Sofia's room", types: ['bedroom'], re: /sofia/i, min: 50, target: 70 },
      { key: 'bath', label: 'Bath', types: ['bath'], re: null, min: 35, target: 40 },
      { key: 'entry', label: 'Entry', types: ['entry', 'hall'], re: null, min: 16, target: 20 },
    ],
  },
  elders: {
    label: "Elders' accessible cabin",
    total: 450,
    items: [
      { key: 'bedroom', label: 'Bedroom', types: ['bedroom'], re: null, min: 105, target: 150 },
      { key: 'abath', label: 'Accessible bath (5 ft turn, 60×60 shower)', types: ['bath'], re: null, min: 60, target: 75, minSide: 7.5 },
      { key: 'sitting', label: 'Sitting room', types: ['living'], re: null, min: 70, target: 150 },
      { key: 'wardrobe', label: 'Wardrobe', types: ['closet'], re: null, min: 12, target: 30 },
    ],
  },
}

/** Which program a cabin follows: its own `intCabin`, else guessed from its name and size as the old planner does. */
export function cabinTypeOf(name: string, params: Record<string, unknown>, otherNames: readonly string[]): string {
  if (typeof params.intCabin === 'string' && PROGRAMS[params.intCabin]) return params.intCabin
  if (/gather|prow|hearth|fan|lodge|kitchen/i.test(name)) return 'gathering'
  if (/twin|daniel|sofia/i.test(name)) return 'twin'
  if (/family|lantern|pods?\b|kids|bunk/i.test(name)) return otherNames.some((n) => /twin|daniel|sofia/i.test(n)) ? 'family' : 'familyAll'
  if (/elder|accessible|wedge|grand/i.test(name)) return 'elders'
  const a = envelopeOf(params, 0).area
  return a >= 600 ? 'gathering' : a <= 470 ? 'elders' : 'family'
}

export interface ProgramRow {
  readonly key: string
  readonly label: string
  readonly target: number
  readonly ok: boolean
  readonly room: { readonly id: number; readonly name: string; readonly area: number; readonly fi: number } | null
}

/** Each item of the program, and the room on any floor that meets it (named matches first, then the smallest that is big enough). */
export function checkProgram(program: Program, floors: readonly Floor[]): ProgramRow[] {
  const cand = floors.flatMap((f, fi) =>
    f.rooms
      .filter((r) => r.type !== 'porch')
      .map((r) => {
        const ob = G.obb(r.pts)
        return { r, fi, area: G.area(r.pts), side: ob ? Math.min(ob.w, ob.d) : 0 }
      }),
  )
  type Cand = (typeof cand)[number]
  const qual = (it: ProgramItem, c: Cand) => it.types.includes(c.r.type) && c.area >= it.min && (it.minSide == null || c.side >= it.minSide)
  const used = new Set<Cand>()
  const got: (ProgramRow['room'] | null)[] = program.items.map(() => null)
  const take = (k: number, c: Cand) => {
    got[k] = { id: c.r.id, name: c.r.name, area: c.area, fi: c.fi }
    used.add(c)
  }
  program.items.forEach((it, k) => {
    if (!it.re) return
    const c = cand.find((c) => !used.has(c) && qual(it, c) && it.re!.test(c.r.name))
    if (c) take(k, c)
  })
  program.items.forEach((it, k) => {
    if (got[k]) return
    const c = cand.filter((c) => !used.has(c) && qual(it, c)).sort((x, y) => x.area - y.area)[0]
    if (c) take(k, c)
  })
  // clothing storage can be a wardrobe in a bedroom, household storage a built-in cabinet in a hall or entry
  const inRoom = (key: string, types: readonly RoomType[], prefix: string) =>
    program.items.forEach((it, k) => {
      if (got[k] || it.key !== key) return
      floors.some((f, fi) =>
        f.furniture.some((w) => {
          if (w.type !== 'wardrobe') return false
          const r = f.rooms.find((r) => types.includes(r.type) && G.pointInPoly(r.pts, w.x, w.z))
          if (r) got[k] = { id: r.id, name: `${prefix} in ${r.name}`, area: w.w * w.d, fi }
          return !!r
        }),
      )
    })
  inRoom('wardrobe', ['bedroom'], 'Wardrobe')
  inRoom('storage', ['hall', 'entry'], 'Cabinet')
  return program.items.map((it, k) => ({ key: it.key, label: it.label, target: it.target, ok: !!got[k], room: got[k] }))
}
