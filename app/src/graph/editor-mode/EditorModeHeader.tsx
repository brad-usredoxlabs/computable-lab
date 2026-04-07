import { Link } from 'react-router-dom'
import { EditorModeSwitcher } from './EditorModeSwitcher'
import type { EditorMode } from '../../types/editorMode'

interface EditorModeHeaderProps {
  title: string
  subtitle?: string
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  backHref?: string
  saveState?: 'idle' | 'saving' | 'success' | 'error'
  onToggleDrawer?: () => void
  showDrawerToggle?: boolean
}

function saveStateLabel(saveState: EditorModeHeaderProps['saveState']): string {
  switch (saveState) {
    case 'saving':
      return 'Saving'
    case 'success':
      return 'Saved'
    case 'error':
      return 'Save Error'
    default:
      return 'Draft'
  }
}

export function EditorModeHeader({
  title,
  subtitle,
  mode,
  onModeChange,
  backHref,
  saveState = 'idle',
  onToggleDrawer,
  showDrawerToggle = false,
}: EditorModeHeaderProps) {
  return (
    <div className="editor-mode-header">
      <div className="editor-mode-header__row">
        <div className="editor-mode-header__meta">
          {backHref && (
            <Link to={backHref} className="editor-mode-header__back">
              Back to Run Workspace
            </Link>
          )}
          <div className="editor-mode-header__title-row">
            <h2>{title}</h2>
            <span className={`editor-mode-header__save editor-mode-header__save--${saveState}`}>
              {saveStateLabel(saveState)}
            </span>
          </div>
          {subtitle && <p>{subtitle}</p>}
        </div>

        <div className="editor-mode-header__controls">
          <EditorModeSwitcher mode={mode} onChange={onModeChange} />
          {showDrawerToggle && onToggleDrawer && (
            <button type="button" className="editor-mode-header__drawer-btn" onClick={onToggleDrawer}>
              Workspace Drawer
            </button>
          )}
        </div>
      </div>

      <style>{`
        .editor-mode-header {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #ffffff 0%, #f6f8fa 100%);
          border: 1px solid #d8dee4;
          border-radius: 16px;
          margin-bottom: 1rem;
        }

        .editor-mode-header__row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .editor-mode-header__meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .editor-mode-header__back {
          font-size: 0.82rem;
          font-weight: 600;
          color: #1f6feb;
          text-decoration: none;
        }

        .editor-mode-header__title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .editor-mode-header__meta h2 {
          margin: 0;
          color: #24292f;
          font-size: 1.15rem;
        }

        .editor-mode-header__meta p {
          margin: 0;
          color: #57606a;
          font-size: 0.9rem;
          max-width: 60rem;
        }

        .editor-mode-header__save {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 0.25rem 0.55rem;
          border-radius: 999px;
          background: #eaeef2;
          color: #57606a;
        }

        .editor-mode-header__save--saving {
          background: #fff8c5;
          color: #9a6700;
        }

        .editor-mode-header__save--success {
          background: #dafbe1;
          color: #1a7f37;
        }

        .editor-mode-header__save--error {
          background: #ffebe9;
          color: #cf222e;
        }

        .editor-mode-header__controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .editor-mode-header__drawer-btn {
          border: 1px solid #d0d7de;
          background: #ffffff;
          color: #24292f;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.55rem 0.9rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
