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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Best-effort display name: title > name > recordId */
function extractName(payload: Record<string, unknown>, fallback: string): string {
  if (typeof payload.title === 'string' && payload.title) return payload.title as string
  if (typeof payload.name === 'string' && payload.name) return payload.name as string
  return fallback
}

/** Status badge variant — maps status strings to CSS-safe tokens */
function statusVariant(status?: string): string {
  switch (status) {
    case 'active':
    case 'completed':
    case 'approved':
      return 'active'
    case 'proposed':
    case 'draft':
    case 'in_review':
      return 'draft'
    case 'rejected':
    case 'deprecated':
    case 'retired':
    case 'out_of_service':
      return 'deprecated'
    case 'maintenance':
      return 'maintenance'
    default:
      return 'neutral'
  }
}

/** Extract info-dense helper tokens for the card subtitle row. */
function extractHelperTokens(
  kind: string,
  payload: Record<string, unknown>
): Array<{ text: string; tag?: string; curie?: boolean }> {
  const tokens: Array<{ text: string; tag?: string; curie?: boolean }> = []
  const p = payload

  switch (kind) {
    case 'material': {
      const domain = typeof p.domain === 'string' ? p.domain : undefined
      if (domain) tokens.push({ text: domain.replace(/_/g, ' ') })
      // Primary CURIE
      const cls = p.class as Array<{ id?: string; curie?: string; label?: string; namespace?: string }> | undefined
      if (cls && cls.length > 0) {
        const first = cls[0]
        const curieId = first?.id ?? first?.curie ?? ''
        if (curieId) {
          tokens.push({ text: curieId, curie: true })
        }
      } else {
        const prov = p.provenance as { sourceCurie?: string } | undefined
        if (prov?.sourceCurie) {
          tokens.push({ text: prov.sourceCurie, curie: true })
        }
      }
      const def = typeof p.definition === 'string' ? p.definition : undefined
      if (def) {
        const truncated = def.length > 120 ? def.slice(0, 117) + '…' : def
        tokens.push({ text: truncated })
      }
      const st = typeof p.status === 'string' ? p.status : undefined
      if (st) tokens.push({ text: st, tag: statusVariant(st) })
      break
    }

    case 'labware': {
      const lwType = typeof p.labwareType === 'string' ? p.labwareType : undefined
      if (lwType) tokens.push({ text: lwType.replace(/_/g, ' ') })
      const fmt = p.format as { rows?: number; cols?: number } | undefined
      if (fmt?.rows && fmt?.cols) {
        tokens.push({ text: `${fmt.rows}×${fmt.cols}` })
      }
      const mfr = p.manufacturer as { name?: string; catalogNumber?: string } | undefined
      if (mfr?.name) {
        let mfrText = mfr.name
        if (mfr.catalogNumber) mfrText += ` #${mfr.catalogNumber}`
        tokens.push({ text: mfrText })
      }
      const notes = typeof p.notes === 'string' ? p.notes : undefined
      if (notes) {
        const truncated = notes.length > 60 ? notes.slice(0, 57) + '…' : notes
        tokens.push({ text: truncated })
      }
      break
    }

    case 'equipment': {
      const st = typeof p.status === 'string' ? p.status : undefined
      if (st) tokens.push({ text: st, tag: statusVariant(st) })
      if (typeof p.manufacturer === 'string') tokens.push({ text: p.manufacturer })
      if (typeof p.model === 'string') tokens.push({ text: p.model })
      if (typeof p.location === 'string') tokens.push({ text: `📍 ${p.location}` })
      const eqClass = p.equipmentClassRef as { curie?: string; label?: string } | undefined
      if (eqClass) {
        tokens.push({ text: eqClass.curie ?? eqClass.label ?? '' })
      }
      break
    }

    case 'protocol': {
      const st = typeof p.status === 'string' ? p.status : undefined
      if (st) tokens.push({ text: st, tag: statusVariant(st) })
      const desc = typeof p.description === 'string' ? p.description : undefined
      if (desc) {
        const truncated = desc.length > 80 ? desc.slice(0, 77) + '…' : desc
        tokens.push({ text: truncated })
      }
      break
    }

    case 'person': {
      if (typeof p.role === 'string') tokens.push({ text: p.role })
      if (typeof p.organisation === 'string') tokens.push({ text: p.organisation })
      if (typeof p.email === 'string') tokens.push({ text: p.email })
      break
    }

    case 'document': {
      const st = typeof p.status === 'string' ? p.status : undefined
      if (st) tokens.push({ text: st, tag: statusVariant(st) })
      if (typeof p.documentType === 'string') tokens.push({ text: p.documentType })
      const desc = typeof p.description === 'string' ? p.description : undefined
      if (desc) {
        const truncated = desc.length > 80 ? desc.slice(0, 77) + '…' : desc
        tokens.push({ text: truncated })
      }
      break
    }
  }

  return tokens
}

export type SortField = 'name' | 'date_created' | 'date_updated'
export type SortDirection = 'asc' | 'desc'

// ── Component ────────────────────────────────────────────────────────────────

export function LabCollectionView({ embedded = false }: { embedded?: boolean } = {}) {
  const { category: categoryParam } = useParams<{ category?: string }>()
  const navigate = useNavigate()
  const activeCategory = (CATEGORIES.find((c) => c.id === categoryParam) ?? CATEGORIES[0])!.id

  const [records, setRecords] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Filter by search query, then sort
  const query = searchQuery.toLowerCase().trim()
  const filteredRecords = query
    ? records.filter((record) => {
        const payload = record.payload as Record<string, unknown>
        const name = extractName(payload, record.recordId).toLowerCase()
        const cls = payload.class as Array<{ id?: string; label?: string }> | undefined
        const curies = cls?.map((c) => `${c.id ?? ''} ${c.label ?? ''}`.toLowerCase()).join(' ') ?? ''
        const def = (typeof payload.definition === 'string' ? payload.definition : '').toLowerCase()
        const desc = (typeof payload.description === 'string' ? payload.description : '').toLowerCase()
        const synonyms = Array.isArray(payload.synonyms) ? payload.synonyms.join(' ').toLowerCase() : ''
        const searchable = `${name} ${curies} ${def} ${desc} ${synonyms}`
        return searchable.includes(query)
      })
    : records

  // Sort records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const payloadA = a.payload as Record<string, unknown>
    const payloadB = b.payload as Record<string, unknown>
    
    let comparison = 0
    switch (sortField) {
      case 'name': {
        const nameA = extractName(payloadA, a.recordId).toLowerCase()
        const nameB = extractName(payloadB, b.recordId).toLowerCase()
        comparison = nameA.localeCompare(nameB)
        break
      }
      case 'date_created': {
        // Check payload first, then top-level record field
        const createdA = (payloadA.createdAt as string) ?? (a as { createdAt?: string }).createdAt ?? ''
        const createdB = (payloadB.createdAt as string) ?? (b as { createdAt?: string }).createdAt ?? ''
        comparison = createdA.localeCompare(createdB)
        break
      }
      case 'date_updated': {
        // Check payload first, then meta, then fall back to createdAt
        const updatedA = (payloadA.updatedAt as string) ?? (a as { updatedAt?: string }).updatedAt ?? (payloadA.createdAt as string) ?? (a as { createdAt?: string }).createdAt ?? ''
        const updatedB = (payloadB.updatedAt as string) ?? (b as { updatedAt?: string }).updatedAt ?? (payloadB.createdAt as string) ?? (b as { createdAt?: string }).createdAt ?? ''
        comparison = updatedA.localeCompare(updatedB)
        break
      }
    }
    
    return sortDirection === 'asc' ? comparison : -comparison
  })

  // Handle sort field change
  const handleSortFieldChange = (field: SortField) => {
    if (field === sortField) {
      // Toggle direction when clicking the same field
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Sort control UI with search
  const sortControls = (
    <div className="lab-collection__sort-controls">
      <input
        type="text"
        className="lab-collection__search"
        placeholder="Filter…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Filter records"
      />
      <span className="lab-collection__sort-label">Sort:</span>
      <div className="lab-collection__sort-buttons">
        {(['name', 'date_created', 'date_updated'] as SortField[]).map(field => (
          <button
            key={field}
            type="button"
            className={`lab-collection__sort-btn ${sortField === field ? 'lab-collection__sort-btn--active' : ''}`}
            onClick={() => handleSortFieldChange(field)}
            title={`Sort by ${field.replace('_', ' ')}`}
          >
            {field === 'name' ? 'Name' : field === 'date_created' ? 'Date Created' : 'Date Updated'}
            {sortField === field && (
              <span className="lab-collection__sort-arrow">
                {sortDirection === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )

  const collectionContent = (
    <div className="lab-collection" data-testid="lab-collection-view">
      <header className="lab-collection__header">
        <h1 className="lab-collection__title">Lab</h1>
        {sortControls}
      </header>

      <div className="lab-collection__body">
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

        {error ? (
          <p className="lab-collection__error">{error}</p>
        ) : loading ? (
          <p className="lab-collection__hint">Loading {activeKind} records…</p>
        ) : sortedRecords.length === 0 ? (
          <p className="lab-collection__hint">
            No {activeKind} records found.
          </p>
        ) : (
          <ul className="lab-collection__list">
            {sortedRecords.map((record) => {
              const payload = record.payload as Record<string, unknown>
              const displayName = extractName(payload, record.recordId)
              const helperTokens = extractHelperTokens(activeKind, payload)

              return (
                <li key={record.recordId}>
                  <button
                    type="button"
                    className="lab-entity-card"
                    data-testid={`lab-entity-${record.recordId}`}
                    onClick={() => navigate(`/lab/${activeCategory}/${record.recordId}`)}
                  >
                    <div className="lab-entity-card__type-badge">
                      {activeCategory.charAt(0).toUpperCase()}
                    </div>
                    <div className="lab-entity-card__body">
                      <span className="lab-entity-card__title" title={displayName}>
                        {displayName}
                      </span>
                      {helperTokens.length > 0 && (
                        <span className="lab-entity-card__helper">
                          {helperTokens.map((tok, i) => (
                            <span
                              key={i}
                              className={
                                tok.curie
                                  ? 'lab-entity-card__token lab-entity-card__token--curie'
                                  : tok.tag
                                    ? `lab-entity-card__token lab-entity-card__token--${tok.tag}`
                                    : 'lab-entity-card__token'
                              }
                            >
                              {tok.text}
                            </span>
                          ))}
                        </span>
                      )}
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

  if (embedded) return collectionContent

  return (
    <AppShell
      brand="Lab"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}
