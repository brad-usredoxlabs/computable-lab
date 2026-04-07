import { useEffect, useMemo, useState } from 'react'
import type { CaymanReviewCompound, CaymanReviewModel, IngestionMaterialStatus } from '../lib/ingestionReview'
import { IngestionCompoundHoverCard } from './IngestionCompoundHoverCard'

const PAGE_SIZE = 50

function statusTone(status: IngestionMaterialStatus): string {
  if (status === 'existing_local') return 'green'
  if (status === 'new_clean') return 'blue'
  return 'amber'
}

function statusLabel(status: IngestionMaterialStatus): string {
  if (status === 'existing_local') return 'Saved locally'
  if (status === 'new_clean') return 'Ready'
  return 'Needs review'
}

export function IngestionCompoundTable({ model }: { model: CaymanReviewModel }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | IngestionMaterialStatus>('all')
  const [collapsed, setCollapsed] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return model.compounds.filter((compound) => {
      const matchesStatus = statusFilter === 'all' || compound.status === statusFilter
      const matchesQuery = !query.trim() || [
        compound.normalizedName,
        compound.sourceName,
        compound.catalogNumber,
        compound.localMatches[0]?.label,
        compound.ontologyMatches[0]?.id,
        compound.ontologyMatches[0]?.label,
      ].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())
      return matchesStatus && matchesQuery
    })
  }, [model.compounds, query, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  return (
    <section className="ingestion-section">
      <div className="ingestion-section__head">
        <div>
          <p className="ingestion-section__eyebrow">Compound Review</p>
          <button type="button" className="ingestion-section-toggle" onClick={() => setCollapsed((value) => !value)}>
            <span className={`ingestion-section-toggle__chevron${collapsed ? '' : ' ingestion-section-toggle__chevron--open'}`}>▸</span>
            <span>{collapsed ? `${filtered.length} compounds available` : `${filtered.length} compounds shown`}</span>
          </button>
        </div>
        <div className="ingestion-review-summary">
          <span className="ingestion-summary-chip ingestion-summary-chip--green">{model.stats.existingLocal} saved locally</span>
          <span className="ingestion-summary-chip ingestion-summary-chip--blue">{model.stats.newClean} ready</span>
          <span className="ingestion-summary-chip ingestion-summary-chip--amber">{model.stats.newWithIssues} need review</span>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="ingestion-review-toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search compound, catalog number, or local material…"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | IngestionMaterialStatus)}>
              <option value="all">All statuses</option>
              <option value="existing_local">Saved locally</option>
              <option value="new_clean">Ready to create</option>
              <option value="new_with_issues">Need review</option>
            </select>
          </div>

          <div className="ingestion-review-pagination">
            <span>Page {page} of {totalPages}</span>
            <span>{filtered.length} filtered compounds</span>
            <div className="ingestion-review-pagination__actions">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>

          <div className="ingestion-table-wrap">
            <table className="ingestion-table">
              <thead>
                <tr>
                  <th>Compound</th>
                  <th>Catalog</th>
                  <th>Local material</th>
                  <th>Status</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((compound) => (
                  <CompoundRow key={compound.materialId} compound={compound} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <style>{`
        .ingestion-review-summary { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .ingestion-summary-chip { border-radius: 999px; padding: 0.3rem 0.65rem; font-size: 0.78rem; font-weight: 600; }
        .ingestion-summary-chip--green { background: #ebfbee; color: #2b8a3e; }
        .ingestion-summary-chip--blue { background: #e7f5ff; color: #1864ab; }
        .ingestion-summary-chip--amber { background: #fff4e6; color: #d9480f; }
        .ingestion-section-toggle {
          display: inline-flex; align-items: center; gap: 0.5rem; border: 0; padding: 0; background: transparent;
          font: inherit; font-weight: 700; color: #111827; cursor: pointer;
        }
        .ingestion-section-toggle__chevron {
          display: inline-block; font-size: 0.95rem; color: #64748b; transform: rotate(0deg); transition: transform 120ms ease;
        }
        .ingestion-section-toggle__chevron--open { transform: rotate(90deg); }
        .ingestion-review-toolbar { display: flex; gap: 0.75rem; margin: 0.75rem 0; }
        .ingestion-review-toolbar input, .ingestion-review-toolbar select {
          border: 1px solid #d0d7de; border-radius: 8px; padding: 0.55rem 0.75rem; font-size: 0.9rem; background: white;
        }
        .ingestion-review-toolbar input { flex: 1; min-width: 240px; }
        .ingestion-review-pagination { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; color: #64748b; font-size: 0.84rem; }
        .ingestion-review-pagination__actions { display: flex; gap: 0.5rem; }
        .ingestion-review-pagination__actions button {
          border: 1px solid #ced4da; border-radius: 8px; background: white; padding: 0.45rem 0.75rem; font-size: 0.84rem;
        }
        .ingestion-review-pagination__actions button:disabled { opacity: 0.45; }
        .ingestion-table-wrap { overflow: auto; border: 1px solid #e9ecef; border-radius: 12px; background: white; }
        .ingestion-table { width: 100%; border-collapse: collapse; min-width: 760px; }
        .ingestion-table th, .ingestion-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #edf2f7; vertical-align: top; }
        .ingestion-table th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; background: #f8f9fa; }
        .ingestion-table__row--green { background: #f8fff9; }
        .ingestion-table__row--blue { background: #f8fbff; }
        .ingestion-table__row--amber { background: #fffdf8; }
        .ingestion-table__primary { font-weight: 600; color: #1f2937; }
        .ingestion-table__secondary { color: #6b7280; font-size: 0.83rem; margin-top: 0.2rem; }
        .ingestion-status-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; }
        .ingestion-status-pill--green { background: #ebfbee; color: #2b8a3e; }
        .ingestion-status-pill--blue { background: #e7f5ff; color: #1864ab; }
        .ingestion-status-pill--amber { background: #fff4e6; color: #d9480f; }
        .ingestion-hover-anchor { position: relative; display: inline-block; min-width: 240px; }
        .ingestion-hover-anchor__card {
          display: none; position: absolute; z-index: 20; left: calc(100% + 12px); top: 0; width: 340px;
          background: white; border: 1px solid #d0d7de; border-radius: 12px; box-shadow: 0 18px 38px rgba(15, 23, 42, 0.15);
          padding: 0.8rem;
        }
        .ingestion-hover-anchor:hover .ingestion-hover-anchor__card { display: block; }
        .ingestion-hover-card { font-size: 0.85rem; color: #334155; }
        .ingestion-hover-card__section + .ingestion-hover-card__section { margin-top: 0.65rem; }
        .ingestion-hover-card__label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.15rem; }
        .ingestion-hover-card__value { line-height: 1.4; }
        .ingestion-hover-card__muted { color: #64748b; font-size: 0.8rem; margin-top: 0.35rem; }
        .ingestion-hover-card__issues { margin: 0.35rem 0 0; padding-left: 1rem; }
        @media (max-width: 960px) {
          .ingestion-review-toolbar, .ingestion-review-pagination { flex-direction: column; align-items: stretch; }
          .ingestion-review-pagination__actions { justify-content: flex-end; }
        }
      `}</style>
    </section>
  )
}

function CompoundRow({ compound }: { compound: CaymanReviewCompound }) {
  const tone = statusTone(compound.status)

  return (
    <tr className={`ingestion-table__row ingestion-table__row--${tone}`}>
      <td>
        <div className="ingestion-hover-anchor">
          <div className="ingestion-table__primary">{compound.normalizedName}</div>
          {compound.sourceName !== compound.normalizedName && <div className="ingestion-table__secondary">{compound.sourceName}</div>}
          <div className="ingestion-hover-anchor__card">
            <IngestionCompoundHoverCard compound={compound} />
          </div>
        </div>
      </td>
      <td>{compound.catalogNumber ?? '—'}</td>
      <td>
        <div>{compound.localMatches[0]?.label ?? 'Will create new local material'}</div>
        {compound.ontologyMatches[0]?.id && (
          <div className="ingestion-table__secondary">{compound.ontologyMatches[0].id}</div>
        )}
      </td>
      <td><span className={`ingestion-status-pill ingestion-status-pill--${tone}`}>{statusLabel(compound.status)}</span></td>
      <td>{compound.issueCount > 0 ? compound.issueCount : '—'}</td>
    </tr>
  )
}
