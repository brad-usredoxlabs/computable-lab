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
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { useMaterialSearch } from '../event-editor/material/useMaterialSearch'
import { VendorProductBuilderModal } from '../editor/material/VendorProductBuilderModal'
import type { OntologyRef } from '../shared/ref'
import type { ResolveCandidate } from '../shared/api/client'

/** Map a resolve-spine candidate onto the ref shape the builder declares. */
function candidateToOntologyRef(c: ResolveCandidate): OntologyRef {
  return {
    kind: 'ontology', id: c.curie, namespace: c.namespace, label: c.label,
    ...(c.uri ? { uri: c.uri } : {}),
  }
}

export function LabMaterialNewPage() {
  const navigate = useNavigate()
  const { query, setQuery, ontologyResults, loadingOntology, error, searchOntology } = useMaterialSearch()
  // Set ONLY by an explicit row click — no autopick of the first result.
  const [ontologyRef, setOntologyRef] = useState<OntologyRef | null>(null)

  return (
    <AppShell brand="Add a material">
      <div style={{ padding: '1rem' }} data-testid="lab-material-new-page">
        <h2>Add a material</h2>
        <p>Search the ontologies for the material, then pick the exact term to record its vendor products.</p>
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
                onClick={() => setOntologyRef(candidateToOntologyRef(candidate))}
                style={{ textAlign: 'left', width: '100%', padding: '0.5rem', margin: '0.25rem 0' }}>
                <span style={{ fontWeight: 600 }}>{candidate.namespace}</span>
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
