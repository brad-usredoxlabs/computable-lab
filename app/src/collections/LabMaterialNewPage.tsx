/**
 * LabMaterialNewPage — /lab/materials/new create surface (L2-LAB-MATERIAL-CREATE-1 u3).
 *
 * Ontology search via the shared useMaterialSearch() resolve spine; every row
 * shows namespace + label (label alone is ambiguous: bare "DMEM" also returns
 * XCO:0001366 'DMEM/F-12'). An explicit row click hands the term to the
 * EXISTING VendorProductBuilderModal, which owns BOTH writes (material concept,
 * then vendor product — the concept ≠ vendor-product hierarchy stays there,
 * CLAUDE.md rule 8). onSave navigates back to /lab/materials.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { useMaterialSearch } from '../event-editor/material/useMaterialSearch'
import { VendorProductBuilderModal } from '../editor/material/VendorProductBuilderModal'
import { ontologyRefFromCandidate, type OntologyRef } from '../shared/ref'

export function LabMaterialNewPage() {
  const navigate = useNavigate()
  const { query, setQuery, ontologyResults, loadingOntology, error, searchOntology } = useMaterialSearch()
  // Set ONLY by an explicit row click — no autopick of the first result.
  const [ontologyRef, setOntologyRef] = useState<OntologyRef | null>(null)
  /**
   * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey): the noun the chat card carried
   * here as a CANDIDATE (?prefillName=). Read ONCE from the URL at first render
   * (lazy initialiser, same discipline as LabLabwareNewPage's u1nounprefill), so
   * a reload of the door URL still shows the person's own noun — it is never
   * minted, never auto-resolved, and no first search result is autopicked.
   */
  const [prefillName] = useState(
    () => new URLSearchParams(window.location.search).get('prefillName')?.trim() ?? '',
  )
  useEffect(() => {
    if (prefillName !== '') setQuery(prefillName)
    // seed ONCE at mount; the person owns the field afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell brand="Add a material">
      <div style={{ padding: '1rem' }} data-testid="lab-material-new-page">
        <h2>Add a material</h2>
        <p>Search the ontologies for the material, then pick the exact term to record its vendor products.</p>
        {prefillName !== '' && (
          <p data-testid="lab-material-journey-candidate" style={{ margin: '0 0 0.5rem' }}>
            Creating <strong>{prefillName}</strong> — your words, not yet a record. Pick the exact term below.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            data-testid="lab-material-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void searchOntology()
            }}
            placeholder="Search ontology terms..."
            style={{ flex: 1, padding: '0.4rem 0.6rem' }}
          />
          <button type="button" data-testid="lab-material-search-button" onClick={() => void searchOntology()}>
            Search ontologies
          </button>
        </div>
        {loadingOntology && <div>Searching ontologies…</div>}
        {error && <div style={{ color: '#b00' }}>{error}</div>}
        <ul data-testid="lab-material-ontology-results" style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          {ontologyResults.map((candidate) => (
            <li key={`${candidate.source}-${candidate.curie}`}>
              <button type="button" data-testid="lab-material-ontology-candidate"
                onClick={() => setOntologyRef(ontologyRefFromCandidate(candidate))}
                style={{ textAlign: 'left', width: '100%', padding: '0.5rem', margin: '0.25rem 0' }}>
                <span data-testid="lab-material-candidate-namespace" style={{ fontWeight: 600 }}>{candidate.namespace}</span>
                {' · '}{candidate.curie}{' — '}{candidate.label}
              </button>
            </li>
          ))}
        </ul>
        {ontologyRef && (
          <div data-testid="lab-material-vendor-builder">
            <VendorProductBuilderModal
              isOpen={true}
              ontologyRef={ontologyRef}
              onClose={() => setOntologyRef(null)}
              onSave={() => navigate('/lab/materials')}
            />
          </div>
        )}
      </div>
    </AppShell>
  )
}
