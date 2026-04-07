import { useMemo } from 'react'
import type { IngestionArtifactRecord, IngestionBundleRecord, IngestionCandidateRecord, IngestionIssueRecord } from '../../types/ingestion'
import { buildCaymanReviewModel } from '../lib/ingestionReview'
import { IngestionCompoundTable } from './IngestionCompoundTable'
import { IngestionPlateBrowser } from './IngestionPlateBrowser'

export function CaymanLibraryReviewPanel(props: {
  artifacts: IngestionArtifactRecord[]
  bundle: IngestionBundleRecord
  candidates: IngestionCandidateRecord[]
  issues: IngestionIssueRecord[]
}) {
  const { artifacts, bundle, candidates, issues } = props
  const model = useMemo(() => buildCaymanReviewModel({ artifacts, bundle, candidates, issues }), [artifacts, bundle, candidates, issues])
  if (!model) return null

  const primaryArtifact = artifacts[0]
  const spreadsheetArtifacts = model.spreadsheetArtifacts

  return (
    <section className="ingestion-section">
      <div className="ingestion-section__head">
        <div>
          <p className="ingestion-section__eyebrow">Screening Library Review</p>
          <h3>{model.bundle.payload.title}</h3>
        </div>
      </div>

      <div className="ingestion-card-grid">
        <article className="ingestion-card">
          <div className="ingestion-card__head">
            <div>
              <h4>Source artifact</h4>
              <p>{primaryArtifact?.payload.file_ref?.file_name || 'Uploaded source'}</p>
            </div>
          </div>
          <div className="ingestion-card__meta">
            <span>{primaryArtifact?.payload.file_ref?.media_type || primaryArtifact?.payload.media_type || 'unknown media type'}</span>
            {primaryArtifact?.payload.table_extracts?.length ? <span>{primaryArtifact.payload.table_extracts.length} extracted tables</span> : null}
          </div>
          {primaryArtifact?.payload.text_extract?.excerpt && <p className="ingestion-card__summary">{primaryArtifact.payload.text_extract.excerpt}</p>}
        </article>

        {spreadsheetArtifacts.length > 0 && (
          <article className="ingestion-card">
            <div className="ingestion-card__head">
              <div>
                <h4>Chemistry enrichment</h4>
                <p>{spreadsheetArtifacts.length === 1 ? 'Attached spreadsheet source' : `${spreadsheetArtifacts.length} attached spreadsheet sources`}</p>
              </div>
            </div>
            <div className="ingestion-card__meta">
              <span>{model.stats.enrichedCompounds} compounds enriched</span>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
              {spreadsheetArtifacts.map((artifact) => (
                <div key={artifact.recordId} style={{ display: 'grid', gap: '0.15rem' }}>
                  <strong>{artifact.payload.file_ref?.file_name || artifact.recordId}</strong>
                  <div className="ingestion-card__meta">
                    <span>{artifact.payload.file_ref?.media_type || artifact.payload.media_type || 'unknown media type'}</span>
                    <span>{artifact.payload.artifact_role.replace(/_/g, ' ')}</span>
                    {artifact.payload.provenance?.note ? <span>{artifact.payload.provenance.note}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}

        <article className="ingestion-card">
          <div className="ingestion-card__head">
            <div>
              <h4>Bundle</h4>
              <p>{model.bundle.payload.summary || 'Reviewable screening library bundle'}</p>
            </div>
          </div>
          <div className="ingestion-card__meta">
            <span>{model.stats.totalCompounds} compounds</span>
            {model.stats.enrichedCompounds > 0 ? <span>{model.stats.enrichedCompounds} chemically enriched</span> : null}
            <span>{model.stats.totalPlates} plates</span>
            <span>{issues.length} issues</span>
          </div>
        </article>
      </div>

      <IngestionCompoundTable model={model} />
      <IngestionPlateBrowser model={model} />
    </section>
  )
}
