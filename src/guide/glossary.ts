/**
 * One-line definitions for the words a newcomer may not know (4C). A `Term`
 * shows the definition on hover or keyboard focus wherever the word appears.
 */
export const GLOSSARY = {
  setback: 'The distance a building must stay back from a lot line or the shore.',
  ohwm: 'Ordinary high water mark: the line the water normally reaches, which shoreline rules measure from.',
  navd88: 'The height datum every elevation here uses: 0 ft is about mean sea level (NAVD88).',
  pitch: 'How steep a roof is: inches of rise for every 12 inches across.',
  overhang: 'How far the roof reaches past the walls.',
  contour: 'A line joining ground of the same height; close lines mean steep ground.',
  berm: 'A raised bank of earth, built up to shape the ground or hold back water.',
  coverage: 'Lot coverage: how much of the lot is under roofs and decks.',
  'top-of-bank': 'Where the shore bank levels off; on the east shore the shoreline setback is measured from here, not from the water.',
  'lot-width': 'Lot-width rule: buildings may cover at most half the lot width through their most seaward point (40 ft on a lot under 80 ft wide).',
  'tree-zone': 'Tree protection zone: no trees may be removed within 35 ft of the water, and only some from 35 to 110 ft.',
  'accessible-route': 'A path someone in a wheelchair can use: firm, wide enough and no steeper than 1 in 12.',
} as const

export type GlossaryTerm = keyof typeof GLOSSARY

export const GLOSSARY_TERMS = Object.keys(GLOSSARY) as GlossaryTerm[]
