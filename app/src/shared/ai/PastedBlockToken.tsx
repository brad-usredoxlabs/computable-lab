import { useState } from 'react'

interface PastedBlockTokenProps {
  lineCount: number
  content: string
  onRemove: () => void
}

export function PastedBlockToken({ lineCount, content, onRemove }: PastedBlockTokenProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="pasted-block-token">
      <span
        className="pasted-block-token__pill"
        onClick={() => setExpanded(!expanded)}
        title={expanded ? 'Click to collapse' : 'Click to preview pasted content'}
      >
        [ pasted {lineCount} lines ]
        <button
          type="button"
          className="pasted-block-token__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove pasted content"
        >
          &times;
        </button>
      </span>
      {expanded && (
        <pre className="pasted-block-token__preview">{content}</pre>
      )}

      <style>{`
        .pasted-block-token {
          margin-top: 0.35rem;
        }

        .pasted-block-token__pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
          font-size: 0.78rem;
          color: #475569;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          padding: 3px 10px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s;
        }

        .pasted-block-token__pill:hover {
          background: #e2e8f0;
        }

        .pasted-block-token__remove {
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 1rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }

        .pasted-block-token__remove:hover {
          color: #ef4444;
        }

        .pasted-block-token__preview {
          margin-top: 0.35rem;
          max-height: 200px;
          overflow-y: auto;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          font-size: 0.78rem;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
          color: #334155;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  )
}
