import type { EditorMode } from '../../types/editorMode'

interface EditorModeSwitcherProps {
  mode: EditorMode
  onChange: (mode: EditorMode) => void
}

const LABELS: Record<EditorMode, string> = {
  plan: 'Plan',
  biology: 'Biology',
  readouts: 'Readouts',
  results: 'Results',
}

export function EditorModeSwitcher({ mode, onChange }: EditorModeSwitcherProps) {
  return (
    <div className="editor-mode-switcher" role="tablist" aria-label="Editor mode">
      {(Object.keys(LABELS) as EditorMode[]).map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={mode === item}
          className={`editor-mode-switcher__button ${mode === item ? 'is-active' : ''}`}
          onClick={() => onChange(item)}
        >
          {LABELS[item]}
        </button>
      ))}

      <style>{`
        .editor-mode-switcher {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem;
          border: 1px solid #d0d7de;
          border-radius: 999px;
          background: #ffffff;
        }

        .editor-mode-switcher__button {
          border: none;
          background: transparent;
          color: #57606a;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.45rem 0.8rem;
          border-radius: 999px;
          cursor: pointer;
        }

        .editor-mode-switcher__button.is-active {
          background: #1f6feb;
          color: #ffffff;
        }
      `}</style>
    </div>
  )
}
