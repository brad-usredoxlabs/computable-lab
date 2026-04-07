/**
 * SearchResultCard — Single search result from a bio-source.
 */

import type { BioSourceResult } from '../../types/biosource'

interface SearchResultCardProps {
  result: BioSourceResult
  onExtract: (result: BioSourceResult) => void
  extracting?: boolean
}

export function SearchResultCard({ result, onExtract, extracting }: SearchResultCardProps) {
  const truncatedDesc = result.description
    ? result.description.length > 250
      ? result.description.slice(0, 250) + '...'
      : result.description
    : null

  return (
    <>
      <div className="search-result-card">
        <div className="search-result-card__header">
          <h4 className="search-result-card__title">{result.title || '(No title)'}</h4>
          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="search-result-card__link"
              title="Open in new tab"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>

        {result.subtitle && (
          <p className="search-result-card__subtitle">{result.subtitle}</p>
        )}

        {result.badges && result.badges.length > 0 && (
          <div className="search-result-card__badges">
            {result.badges.map((b, i) => (
              <span
                key={i}
                className="search-result-card__badge"
                style={{ background: `${b.color}18`, color: b.color, borderColor: `${b.color}40` }}
              >
                {b.label}
              </span>
            ))}
            {result.date && (
              <span className="search-result-card__date">{result.date}</span>
            )}
          </div>
        )}

        {truncatedDesc && (
          <p className="search-result-card__desc">{truncatedDesc}</p>
        )}

        <div className="search-result-card__actions">
          <button
            className="search-result-card__extract-btn"
            onClick={() => onExtract(result)}
            disabled={extracting}
          >
            {extracting ? 'Extracting...' : 'Extract Knowledge'}
          </button>
        </div>
      </div>

      <style>{`
        .search-result-card {
          padding: 0.75rem;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: white;
          transition: border-color 0.15s;
        }
        .search-result-card:hover {
          border-color: #adb5bd;
        }
        .search-result-card__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .search-result-card__title {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: #212529;
          line-height: 1.3;
        }
        .search-result-card__link {
          flex-shrink: 0;
          color: #868e96;
          padding: 2px;
        }
        .search-result-card__link:hover {
          color: #228be6;
        }
        .search-result-card__subtitle {
          margin: 0.25rem 0 0;
          font-size: 0.75rem;
          color: #868e96;
          line-height: 1.3;
        }
        .search-result-card__badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-top: 0.5rem;
          align-items: center;
        }
        .search-result-card__badge {
          display: inline-block;
          padding: 1px 6px;
          font-size: 0.7rem;
          font-weight: 500;
          border-radius: 4px;
          border: 1px solid;
          font-family: ui-monospace, monospace;
        }
        .search-result-card__date {
          font-size: 0.7rem;
          color: #adb5bd;
        }
        .search-result-card__desc {
          margin: 0.5rem 0 0;
          font-size: 0.75rem;
          color: #495057;
          line-height: 1.5;
        }
        .search-result-card__actions {
          margin-top: 0.5rem;
          display: flex;
          justify-content: flex-end;
        }
        .search-result-card__extract-btn {
          padding: 0.3rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          border: 1px solid #228be6;
          border-radius: 6px;
          background: white;
          color: #228be6;
          cursor: pointer;
          transition: all 0.15s;
        }
        .search-result-card__extract-btn:hover:not(:disabled) {
          background: #228be6;
          color: white;
        }
        .search-result-card__extract-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  )
}
