/**
 * SequenceSearch — the Sequences ingestion tab (ISEQ-1, spec §6).
 *
 * Searches NCBI Nucleotide/Protein through the /api/biosource proxy
 * (ncbi_nucleotide_search / ncbi_protein_search tools). The server pins
 * canonical RefSeq hits first; this surface renders the first canonical hit
 * in a dedicated Canonical RefSeq card and keeps general hits visible below.
 *
 * Source pills are LOCAL config (OQ3 adjudication): BIO_SOURCES is untouched —
 * nucleotide/protein pills belong to this tab, not the Literature pill bar.
 *
 * Import uses the EXISTING save path only: POST /sequences/actions
 * {operation:'save_sequence', ...} exactly as SequenceImport.tsx does. The
 * alphabet is derived from the FETCHED RESIDUES (U ⇒ iupac_rna), deliberately
 * NOT via GET /sequences/source — sequenceSources.ts hardcodes iupac_dna for
 * the ncbi arm and would fail an rRNA record against alphabets.yaml (the
 * plan's "alphabet trap", spec §3.5; that hardcode is a separate filed defect).
 */
import { useState } from 'react'
import type { BioSourceId, BioSourceResult } from '../types/biosource'
import { fetchBioSourceDetail, searchBioSource } from '../shared/api/biosourceClient'
import { sequenceApi, requestId } from './api'
import '../sequences/SequencesPage.css'

type SequenceSourceId = Extract<BioSourceId, 'ncbi_nucleotide' | 'ncbi_protein'>

// Local pill config (OQ3): this tab's sources, NOT BIO_SOURCES.
const SEQUENCE_PILLS: Array<{ id: SequenceSourceId; label: string; color: string }> = [
  { id: 'ncbi_nucleotide', label: 'Nucleotide', color: '#1971c2' },
  { id: 'ncbi_protein', label: 'Protein', color: '#2b8a3e' },
]

export function SequenceSearch() {
  const [source, setSource] = useState<SequenceSourceId>('ncbi_nucleotide')
  const [canonicalOnly, setCanonicalOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [organism, setOrganism] = useState('')
  const [results, setResults] = useState<BioSourceResult[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importedId, setImportedId] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const canonical = results.find((r) => r.canonical === true) ?? null
  const others = results.filter((r) => r.canonical !== true)

  async function runSearch() {
    if (query.trim().length < 2) return
    setBusy(true)
    setError('')
    setImportedId('')
    try {
      const filters: { organism?: string; canonicalOnly?: boolean } = {}
      if (organism.trim()) filters.organism = organism.trim()
      if (canonicalOnly) filters.canonicalOnly = true
      const response = await searchBioSource(source, query.trim(), 10, filters)
      setResults(response.results)
      setTotal(response.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResults([])
      setTotal(null)
    } finally {
      setBusy(false)
    }
  }

  async function importCanonical() {
    if (!canonical) return
    setImportBusy(true)
    setError('')
    try {
      const detail = await fetchBioSourceDetail(source, canonical.sourceId)
      const fasta = typeof detail.sequence === 'string' ? detail.sequence : ''
      const residues = fasta
        .split('\n')
        .filter((line) => !line.startsWith('>'))
        .join('')
        .replace(/\s/g, '')
      if (!residues) throw new Error('No residues returned for ' + canonical.sourceId)
      // Residues-derived alphabet (spec §3.5): U-containing rRNA must land on
      // iupac_rna, never the sequenceSources.ts iupac_dna hardcode.
      const alphabet = source === 'ncbi_protein' ? 'protein' : /U/i.test(residues) ? 'iupac_rna' : 'iupac_dna'
      const label = canonical.title || canonical.sourceId
      const result = await sequenceApi<{ recordId?: string }>('/actions', {
        operation: 'save_sequence',
        requestId: requestId(),
        sequence: {
          label,
          residues,
          alphabet,
          topology: 'linear',
          source: {
            accession: canonical.sourceId,
            url: canonical.url ?? `https://www.ncbi.nlm.nih.gov/${source === 'ncbi_protein' ? 'protein' : 'nuccore'}/${canonical.sourceId}`,
            retrievedAt: new Date().toISOString(),
          },
        },
      })
      setImportedId(result.recordId ?? canonical.sourceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="sequence-search" data-testid="sequence-search">
      <div className="sequence-search__controls">
        <div className="source-selector" role="group" aria-label="Sequence source">
          {SEQUENCE_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              data-testid={`sequence-pill-${pill.id}`}
              className={`source-pill ${source === pill.id ? 'source-pill--active' : ''}`}
              style={{ '--pill-color': pill.color } as React.CSSProperties}
              onClick={() => setSource(pill.id)}
            >
              {pill.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="sequence-pill-canonical"
            className={`source-pill ${canonicalOnly ? 'source-pill--active' : ''}`}
            style={{ '--pill-color': '#2b8a3e' } as React.CSSProperties}
            aria-pressed={canonicalOnly}
            onClick={() => setCanonicalOnly((v) => !v)}
          >
            Canonical RefSeq only
          </button>
        </div>
        <label className="sequence-search__query">
          Query
          <input
            data-testid="sequence-query-input"
            value={query}
            placeholder="e.g. 16S F Prausnitzi"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sequence-search__organism">
          Organism (optional)
          <input
            data-testid="sequence-organism-input"
            value={organism}
            placeholder="scientific name or taxid"
            onChange={(e) => setOrganism(e.target.value)}
          />
        </label>
        <button
          type="button"
          data-testid="sequence-search-button"
          disabled={busy || query.trim().length < 2}
          onClick={() => void runSearch()}
        >
          Search
        </button>
      </div>

      {busy && <p role="status">Searching {source === 'ncbi_protein' ? 'NCBI Protein' : 'NCBI Nucleotide'}…</p>}
      {error && <p role="alert">{error}</p>}

      {canonical && (
        <div className="sequence-search__canonical" data-testid="sequence-canonical">
          <h3>Canonical RefSeq — {canonical.sourceId}</h3>
          <p>{canonical.title}</p>
          {canonical.subtitle && <p>{canonical.subtitle}</p>}
          <button
            type="button"
            data-testid="sequence-import-button"
            disabled={importBusy}
            onClick={() => void importCanonical()}
          >
            Import as sequence record
          </button>
          {importedId && <p role="status" data-testid="sequence-imported">Imported: {importedId}</p>}
        </div>
      )}

      {total !== null && (
        <div data-testid="sequence-results">
          <p>{results.length} of {total} result(s)</p>
          {others.map((r) => (
            <div key={r.sourceId} className="sequence-search__result">
              <strong>{r.sourceId}</strong>
              <span> {r.title}</span>
              {r.subtitle && <small> {r.subtitle}</small>}
            </div>
          ))}
          {others.length === 0 && !canonical && <p>No results.</p>}
        </div>
      )}
    </div>
  )
}
