import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type {
  MaterialIntentOption,
  MaterialResolved,
} from './types'

interface MaterialIntentSurfaceProps {
  /** The kinds this host offers, each carrying its own builder (see types.ts). */
  options: MaterialIntentOption[]
  /**
   * Skip the picker and jump straight to this kind's builder — the "create from
   * this term" path. The seed term itself is baked into the option's `render`
   * closure by the host (the host owns the ontology ref), so this only selects
   * which builder opens.
   */
  seedKind?: string | null
  /**
   * `inline` (default): the host already provides a dialog; the picker renders
   * in place. `modal`: the surface portals its own picker over a backdrop (for
   * hosts like `MaterialPicker` that have no dialog of their own). Builders
   * manage their own layout either way.
   */
  layout?: 'inline' | 'modal'
  hint?: ReactNode
  /** Label for the cancel/back button. */
  cancelLabel?: string
  onResolved: (material: MaterialResolved) => void
  onCancel: () => void
  onError: (message: string) => void
}

const DEFAULT_HINT =
  'What kind of material are you creating? Each kind has different fields and quantity semantics.'

/**
 * MaterialIntentSurface — the one shared material-creation surface: type
 * selection + the host's per-kind builder. It owns the picker shell, the
 * seed→skip-picker jump, and the modal-vs-inline layout; the host owns the
 * builders (via `options[].render`) and, where relevant, the configure/apply
 * step that follows `onResolved`. Because every builder resolves a local record,
 * this never hands back a bare ontology ref.
 */
export function MaterialIntentSurface({
  options,
  seedKind,
  layout = 'inline',
  hint,
  cancelLabel = 'Back',
  onResolved,
  onCancel,
  onError,
}: MaterialIntentSurfaceProps) {
  const [selected, setSelected] = useState<string | null>(seedKind ?? null)

  const active = selected ? options.find((o) => o.kind === selected) ?? null : null
  if (active?.render) {
    return <>{active.render({ onResolved, onCancel, onError })}</>
  }

  const picker: ReactNode = (
    <div className="add-material-body">
      <div className="add-material-hint">{hint ?? DEFAULT_HINT}</div>
      <ul className="add-material-list">
        {options.map((option) => (
          <li key={option.kind}>
            <button
              type="button"
              className="add-material-row"
              data-category="saved-stock"
              onClick={() => {
                if (option.onSelect) option.onSelect()
                else setSelected(option.kind)
              }}
            >
              <span className="add-material-row-title">{option.title}</span>
              <span className="add-material-row-meta">{option.detail}</span>
            </button>
          </li>
        ))}
      </ul>
      <footer className="add-material-footer">
        <button type="button" className="add-material-btn" onClick={onCancel}>
          {cancelLabel}
        </button>
      </footer>
    </div>
  )

  if (layout === 'modal') {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onCancel}
      >
        <div className="add-material-dialog" onClick={(e) => e.stopPropagation()}>
          {picker}
        </div>
      </div>,
      document.body,
    )
  }

  return picker
}
