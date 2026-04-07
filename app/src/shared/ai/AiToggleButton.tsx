/**
 * AiToggleButton — Shared toggle button used by all pages to open the AI panel.
 *
 * Shows a badge/pulse when the AI has a pending preview or unresolved suggestion.
 */

interface AiToggleButtonProps {
  open: boolean
  onClick: () => void
  hasPreview?: boolean
  className?: string
}

export function AiToggleButton({
  open,
  onClick,
  hasPreview = false,
  className = '',
}: AiToggleButtonProps) {
  return (
    <>
      <button
        className={`ai-toggle-btn ${open ? 'ai-toggle-btn--active' : ''} ${hasPreview ? 'ai-toggle-btn--preview' : ''} ${className}`}
        onClick={onClick}
        title="AI Assistant"
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
      >
        <span className="ai-toggle-btn__label">AI</span>
        {hasPreview && <span className="ai-toggle-btn__badge" />}
      </button>

      <style>{`
        .ai-toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.375rem 0.75rem;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          background: white;
          color: #495057;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
        }

        .ai-toggle-btn:hover {
          border-color: #339af0;
          color: #1971c2;
          background: #e7f5ff;
        }

        .ai-toggle-btn--active {
          border-color: #339af0;
          color: #1971c2;
          background: #d0ebff;
        }

        .ai-toggle-btn--preview {
          animation: ai-toggle-pulse 2s infinite;
        }

        .ai-toggle-btn__label {
          line-height: 1;
        }

        .ai-toggle-btn__badge {
          position: absolute;
          top: -3px;
          right: -3px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f03e3e;
          border: 2px solid white;
        }

        @keyframes ai-toggle-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(51, 154, 240, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(51, 154, 240, 0); }
        }
      `}</style>
    </>
  )
}
