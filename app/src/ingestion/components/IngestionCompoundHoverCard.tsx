import { useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { CaymanReviewCompound } from '../lib/ingestionReview'

function statusLabel(status: CaymanReviewCompound['status']): string {
  if (status === 'existing_local') return 'Already saved locally'
  if (status === 'new_clean') return 'Ready to create'
  return 'Needs review'
}

export function IngestionCompoundHoverCard({ compound }: { compound: CaymanReviewCompound }) {
  const primaryMatch = compound.localMatches[0]
  const primaryOntologyMatch = compound.ontologyMatches[0]
  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!primaryMatch?.id) {
      setRecord(null)
      return
    }
    setLoading(true)
    apiClient.getRecord(primaryMatch.id)
      .then((response) => {
        if (!cancelled) setRecord(response)
      })
      .catch(() => {
        if (!cancelled) setRecord(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [primaryMatch?.id])

  const definition = typeof record?.payload.definition === 'string' ? record.payload.definition : undefined
  const synonyms = Array.isArray(record?.payload.synonyms)
    ? record?.payload.synonyms.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const ontologyDefinition = definition ?? compound.definition ?? primaryOntologyMatch?.description
  const ontologySynonyms = synonyms.length > 0 ? synonyms : (compound.synonyms ?? primaryOntologyMatch?.synonyms ?? [])

  return (
    <div className="ingestion-hover-card">
      <div className="ingestion-hover-card__section">
        <div className="ingestion-hover-card__label">Source term</div>
        <div className="ingestion-hover-card__value">{compound.sourceName}</div>
      </div>
      <div className="ingestion-hover-card__section">
        <div className="ingestion-hover-card__label">Review status</div>
        <div className="ingestion-hover-card__value">{statusLabel(compound.status)}</div>
      </div>
      <div className="ingestion-hover-card__section">
        <div className="ingestion-hover-card__label">Local material</div>
        <div className="ingestion-hover-card__value">{primaryMatch ? primaryMatch.label : 'No local match yet'}</div>
      </div>
      {primaryMatch?.id && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Local record ID</div>
          <div className="ingestion-hover-card__value">{primaryMatch.id}</div>
        </div>
      )}
      {primaryOntologyMatch && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Ontology term</div>
          <div className="ingestion-hover-card__value">
            {primaryOntologyMatch.uri
              ? <a href={primaryOntologyMatch.uri} target="_blank" rel="noreferrer">{primaryOntologyMatch.id}</a>
              : primaryOntologyMatch.id}
            <span className="ingestion-hover-card__muted"> {primaryOntologyMatch.label}</span>
          </div>
        </div>
      )}
      {loading && <div className="ingestion-hover-card__muted">Loading local material details…</div>}
      {ontologyDefinition && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Definition</div>
          <div className="ingestion-hover-card__value">{ontologyDefinition}</div>
        </div>
      )}
      {ontologySynonyms.length > 0 && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Synonyms</div>
          <div className="ingestion-hover-card__value">{ontologySynonyms.slice(0, 6).join(', ')}</div>
        </div>
      )}
      {compound.catalogNumber && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Catalog number</div>
          <div className="ingestion-hover-card__value">{compound.catalogNumber}</div>
        </div>
      )}
      {compound.molecularWeight && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Molecular weight</div>
          <div className="ingestion-hover-card__value">{compound.molecularWeight.value} {compound.molecularWeight.unit}</div>
        </div>
      )}
      {compound.chemicalProperties?.molecularFormula && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Molecular formula</div>
          <div className="ingestion-hover-card__value">{compound.chemicalProperties.molecularFormula}</div>
        </div>
      )}
      {compound.chemicalProperties?.casNumber && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">CAS number</div>
          <div className="ingestion-hover-card__value">{compound.chemicalProperties.casNumber}</div>
        </div>
      )}
      {compound.chemicalProperties?.solubility && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Solubility</div>
          <div className="ingestion-hover-card__value">{compound.chemicalProperties.solubility}</div>
        </div>
      )}
      {compound.chemistryEnrichmentSources.length > 0 && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Chemistry provenance</div>
          <div className="ingestion-hover-card__value">
            {compound.chemistryEnrichmentSources.map((source) => (
              <div key={source.artifactId} style={{ marginBottom: '0.35rem' }}>
                <div>{source.fileName}</div>
                <div className="ingestion-hover-card__muted">
                  {source.mediaType ? source.mediaType : 'spreadsheet source'}
                  {source.note ? ` • ${source.note}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {compound.issues.length > 0 && (
        <div className="ingestion-hover-card__section">
          <div className="ingestion-hover-card__label">Issues</div>
          <ul className="ingestion-hover-card__issues">
            {compound.issues.slice(0, 4).map((issue) => <li key={issue.recordId}>{issue.payload.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
