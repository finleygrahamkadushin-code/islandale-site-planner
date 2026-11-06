import { memo } from 'react'
import type { Scheme } from '../schemes'
import type { Site } from '../types'
import { schemeThumb, type SchemeThumb as ThumbPaths } from './thumbPaths'

/**
 * A scheme's plan thumbnail on its archive card (5F): north up, metres.
 * Colours come from the `thumb-*` classes in the app's CSS, so both themes
 * work. The paths are worked out once per scheme id.
 */

interface SchemeThumbProps {
  readonly scheme: Scheme
  readonly site: Site
}

const thumbs = new Map<string, ThumbPaths>()

/** A scheme's thumbnail paths, worked out once per scheme (also called ahead of time by `warmArchive`). */
export function thumbOf(scheme: Scheme, site: Site): ThumbPaths {
  const hit = thumbs.get(scheme.id)
  if (hit) return hit
  const t = schemeThumb(scheme, site)
  thumbs.set(scheme.id, t)
  return t
}

function SchemeThumbSvg({ scheme, site }: SchemeThumbProps) {
  const t = thumbOf(scheme, site)
  return (
    <svg className="scheme-thumb" role="img" aria-label={`Plan of ${scheme.name}`} viewBox={t.viewBox} preserveAspectRatio="xMidYMid meet">
      <path className="thumb-lot" d={t.lot} vectorEffect="non-scaling-stroke" />
      {t.grounds.map((d, i) => (
        <path key={`g${i}`} className="thumb-ground" d={d} vectorEffect="non-scaling-stroke" />
      ))}
      <path className="thumb-buffer" d={t.buffer} fill="none" vectorEffect="non-scaling-stroke" />
      {t.trees.map((c, i) => (
        <circle key={`t${i}`} className="thumb-tree" cx={c.cx} cy={c.cy} r={c.r} />
      ))}
      {t.buildings.map((d, i) => (
        <path key={`b${i}`} className="thumb-building" d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

export const SchemeThumb = memo(SchemeThumbSvg, (a, b) => a.scheme.id === b.scheme.id && a.site === b.site)
