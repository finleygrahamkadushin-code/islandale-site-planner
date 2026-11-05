import type { ReactNode } from 'react'
import { GLOSSARY, type GlossaryTerm } from './glossary'
import { Tip } from './Tip'

/**
 * A glossary word (4C): dotted underline, focusable, and its one-line
 * definition on hover or focus. `children` is the word as written; the
 * definition comes from `GLOSSARY`.
 */
export function Term({ term, children }: { readonly term: GlossaryTerm; readonly children: ReactNode }) {
  return (
    <Tip label={GLOSSARY[term]}>
      <span className="term" tabIndex={0} data-term={term}>
        {children}
      </span>
    </Tip>
  )
}
