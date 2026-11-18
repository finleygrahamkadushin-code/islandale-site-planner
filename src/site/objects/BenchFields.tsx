import { ColourInput } from '../../ui/ColourInput'
import { benchCushionColour, benchFacing, benchHasBack, benchHasCushion, type BenchFacing } from './bench'

/**
 * The inspector's bench controls: backrest, which side it faces, cushions and
 * the cushion colour. Each change is one `set` call, which the store applies
 * as one undo step and refuses when the bench is locked.
 */
export function BenchFields({ p, disabled, set }: { readonly p: Readonly<Record<string, unknown>>; readonly disabled: boolean; readonly set: (patch: Readonly<Record<string, unknown>>) => void }) {
  const back = benchHasBack(p)
  const cushion = benchHasCushion(p)
  const facing = benchFacing(p)
  const colour = benchCushionColour(p)
  const faces = (f: BenchFacing) => set({ facing: f })
  return (
    <div className="grid2" data-testid="bench-fields">
      <label className="row">
        <input type="checkbox" checked={back} disabled={disabled} data-testid="bench-back" onChange={(e) => set({ back: e.target.checked })} />
        <span>Backrest</span>
      </label>
      <div className="row" role="group" aria-label="Faces">
        <span>Faces</span>
        {(['out', 'in'] as const).map((f) => (
          <button
            key={f}
            aria-pressed={facing === f}
            className={facing === f ? 'on' : ''}
            disabled={disabled}
            data-testid={`bench-faces-${f}`}
            onClick={() => faces(f)}
          >
            {f === 'out' ? 'Out' : 'In'}
          </button>
        ))}
      </div>
      <label className="row">
        <input type="checkbox" checked={cushion} disabled={disabled} data-testid="bench-cushion" onChange={(e) => set({ cushion: e.target.checked })} />
        <span>Cushions</span>
      </label>
      <label className="row">
        <span>Cushion colour</span>
        <ColourInput key={colour} value={colour} disabled={disabled} testId="bench-cushion-colour" label="Cushion colour" onCommit={(c) => set({ cushionColor: c })} />
      </label>
    </div>
  )
}
