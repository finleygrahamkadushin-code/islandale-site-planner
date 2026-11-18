import { ColourInput } from '../../ui/ColourInput'
import { firepitHasCushion, firepitShape, LOUNGE_CUSHION_COLOUR, type FirepitShape } from './firepit'

/**
 * The inspector's fire pit controls: the shape (round, square or lounge),
 * cushions and the cushion colour. Each change is one `set` call, which the
 * store applies as one undo step and refuses when the pit is locked.
 */
const SHAPES: readonly { readonly id: FirepitShape; readonly label: string }[] = [
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'lounge', label: 'Lounge' },
]

export function FirepitFields({ p, disabled, set }: { readonly p: Readonly<Record<string, unknown>>; readonly disabled: boolean; readonly set: (patch: Readonly<Record<string, unknown>>) => void }) {
  const shape = firepitShape(p)
  const cushion = firepitHasCushion(p)
  const colour = typeof p.cushionColor === 'string' ? p.cushionColor : LOUNGE_CUSHION_COLOUR
  return (
    <div className="grid2" data-testid="firepit-fields">
      <div className="row" role="group" aria-label="Shape">
        <span>Shape</span>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            aria-pressed={shape === s.id}
            className={shape === s.id ? 'on' : ''}
            disabled={disabled}
            data-testid={`firepit-shape-${s.id}`}
            onClick={() => set({ shape: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="row">
        <input type="checkbox" checked={cushion} disabled={disabled} data-testid="firepit-cushion" onChange={(e) => set({ cushion: e.target.checked })} />
        <span>Cushions</span>
      </label>
      <label className="row">
        <span>Cushion colour</span>
        <ColourInput key={colour} value={colour} disabled={disabled} testId="firepit-cushion-colour" label="Cushion colour" onCommit={(c) => set({ cushionColor: c })} />
      </label>
    </div>
  )
}
