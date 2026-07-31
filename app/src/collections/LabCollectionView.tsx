/**
 * LabCollectionView — collection view for /lab with category navigation.
 *
 * Categories: Protocols, Materials, Labware, Instruments & Equipment, People, Documents.
 * Each category maps to a record kind that's fetched via listRecordsByKind.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §8.1
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import './LabCollectionView.css'

type LabCategory = 'protocols' | 'materials' | 'labware' | 'equipment' | 'people' | 'documents'

const CATEGORIES: { id: LabCategory; label: string; kind: string }[] = [
  { id: 'protocols', label: 'Protocols', kind: 'protocol' },
  { id: 'materials', label: 'Materials', kind: 'material' },
  { id: 'labware', label: 'Labware', kind: 'labware' },
  { id: 'equipment', label: 'Instruments & Equipment', kind: 'equipment' },
  { id: 'people', label: 'People', kind: 'person' },
  { id: 'documents', label: 'Documents', kind: 'document' },
]

export function LabCollectionView() {
  const { category: categoryParam } = useParams<{ category?: string }>()
  const navigate = useNavigate()
  const activeCategory = (CATEGORIES.find((c) => c.id === categoryParam) ?? CATEGORIES[0])!.id

  const [records, setRecords] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeKind = CATEGORIES.find((c) => c.id === activeCategory)?.kind ?? 'protocol'

  const fetchRecords = useCallback(async (kind: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listRecordsByKind(kind, 200)
      setRecords(result.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRecords(activeKind)
  }, [activeKind, fetchRecords])

  const collectionContent = (
    <div className="lab-collection" data-testid="lab-collection-view">
        <header className="lab-collection__header">
          <h1 className="lab-collection__title">Lab</h1>
        </header>

        <nav className="lab-collection__categories" role="navigation">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={
                cat.id === activeCategory
                  ? 'lab-collection__category lab-collection__category--active'
                  : 'lab-collection__category'
              }
              data-testid={`lab-category-${cat.id}`}
              onClick={() => navigate(`/lab/${cat.id}`)}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        <div className="lab-collection__body">
          {error ? (
            <p className="lab-collection__error">{error}</p>
          ) : loading ? (
            <p className="lab-collection__hint">Loading {activeKind} records…</p>
          ) : records.length === 0 ? (
            <p className="lab-collection__hint">
              No {activeKind} records found.
            </p>
          ) : (
            <ul className="lab-collection__list">
              {records.map((record) => {
                const payload = record.payload as Record<string, unknown>
                const title = typeof payload.title === 'string' ? payload.title : record.recordId
                return (
                  <li key={record.recordId}>
                    <button
                      type="button"
                      className="lab-entity-card"
                      data-testid={`lab-entity-${record.recordId}`}
                      onClick={() => navigate(`/lab/${record.recordId}`)}
                    >
                      <div className="lab-entity-card__type-badge">L</div>
                      <div className="lab-entity-card__body">
                        <span className="lab-entity-card__title">{title}</span>
                        <span className="lab-entity-card__id">{record.recordId}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
  )

  return (
    <AppShell
      brand="Lab"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}