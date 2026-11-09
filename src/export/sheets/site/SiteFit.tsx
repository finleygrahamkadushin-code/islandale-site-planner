import { PAPERS, SITE_SCALE_LABEL, type PaperId, type SiteScale } from '../types'
import type { SiteSheetBuild } from './SiteSheet'

const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`

/** The site plan's line in the modal's fit note: how many pages it takes on this paper, and the paper that holds it on one. */
export function siteFitText(build: SiteSheetBuild, paper: PaperId, scale: SiteScale): string {
  const l = build.layout
  const on = `${PAPERS[paper].label}`
  const head = `Site plan at ${SITE_SCALE_LABEL[scale]}`
  const one = l.onePagePaper ? `the drawing and its notes fit one page of ${PAPERS[l.onePagePaper].label}` : 'no paper here holds the drawing and its notes on one page'
  if (l.mode === 'beside') return `${head}: 1 page on ${on}, the notes beside the drawing.`
  if (l.mode === 'notesPage') return `${head}: 2 pages on ${on}, the drawing then its notes; ${one}.`
  return `${head}: ${pages(l.pages)} on ${on}, the drawing on ${pages(l.drawingPages)} to tape edge to edge, then its notes; ${one}.`
}

export function SiteFit({ build, paper, scale }: { readonly build: SiteSheetBuild; readonly paper: PaperId; readonly scale: SiteScale }) {
  return (
    <p className="sheets-fit" aria-live="polite" data-testid="site-fit">
      <span>{siteFitText(build, paper, scale)}</span>
    </p>
  )
}
