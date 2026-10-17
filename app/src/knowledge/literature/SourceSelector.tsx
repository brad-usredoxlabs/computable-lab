/**
 * SourceSelector — Horizontal pill bar for selecting the active bio-source.
 */

import { BIO_SOURCES } from '../../types/biosource'
import type { BioSourceId } from '../../types/biosource'

interface SourceSelectorProps {
  selected: BioSourceId
  onSelect: (source: BioSourceId) => void
}

export function SourceSelector({ selected, onSelect }: SourceSelectorProps) {
  return (
    <>
      <div className="source-selector">
        {BIO_SOURCES.map((src) => (
          <button
            key={src.id}
            className={`source-pill ${selected === src.id ? 'source-pill--active' : ''}`}
            style={{
              '--pill-color': src.color,
            } as React.CSSProperties}
            onClick={() => onSelect(src.id)}
          >
            {src.label}
          </button>
        ))}
      </div>

      <style>{`
        .source-selector {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .source-pill {
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          border: 1.5px solid color-mix(in srgb, var(--pill-color) 70%, var(--cl-border, #d0d7de));
          background: color-mix(in srgb, var(--pill-color) 14%, var(--cl-bg, #ffffff));
          color: color-mix(in srgb, var(--pill-color) 65%, var(--cl-text, #1f2328));
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .source-pill:hover {
          background: color-mix(in srgb, var(--pill-color) 26%, var(--cl-bg, #ffffff));
        }
        .source-pill--active {
          background: var(--pill-color);
          color: var(--cl-on-accent, #0e1116);
          border-color: var(--pill-color);
          font-weight: 600;
        }
        .source-pill--active:hover {
          background: var(--pill-color);
          opacity: 0.9;
        }
      `}</style>
    </>
  )
}
