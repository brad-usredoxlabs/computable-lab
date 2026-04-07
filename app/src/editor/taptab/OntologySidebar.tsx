/**
 * OntologySidebar - A slide-in panel for reviewing ontology term details.
 * 
 * Displays term information and provides options to add to local vocabulary or cancel.
 */

/**
 * Ontology term details to display in the sidebar.
 */
export interface OntologyTerm {
  /** Human-readable label for the term */
  label: string;
  /** Full IRI of the term */
  iri: string;
  /** Definition/description of the term (optional) */
  definition?: string;
  /** Synonyms for the term (optional) */
  synonyms?: string[];
  /** Source ontology name (optional) */
  ontology?: string;
}

/**
 * Props for the OntologySidebar component.
 */
export interface OntologySidebarProps {
  /** The ontology term to display */
  term: OntologyTerm;
  /** Callback when user adds term to local vocabulary */
  onAddToVocab: (term: { label: string; iri: string }) => void;
  /** Callback when user closes the sidebar */
  onClose: () => void;
  /** Whether the sidebar is open/visible */
  open: boolean;
}

/**
 * OntologySidebar component - A slide-in panel for reviewing ontology term details.
 * 
 * When a user selects an ontology term from a RefCombobox, this sidebar displays
 * the term's details (label, IRI, definition, synonyms, source ontology) and
 * provides options to add it to the local vocabulary or cancel.
 */
export function OntologySidebar({ term, onAddToVocab, onClose, open }: OntologySidebarProps) {
  const handleAddToVocab = () => {
    onAddToVocab({
      label: term.label,
      iri: term.iri,
    });
  };

  return (
    <>
      {/* Overlay - darkens the background when sidebar is open */}
      <div
        className={`ontology-sidebar-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div className={`ontology-sidebar ${open ? 'open' : ''}`}>
        <div className="ontology-sidebar-content">
          {/* Header with title and close button */}
          <div className="ontology-sidebar-header">
            <h2 className="ontology-sidebar-title">{term.label}</h2>
            <button
              type="button"
              className="ontology-sidebar-close"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* IRI display */}
          <div className="ontology-sidebar-iri">
            <code>{term.iri}</code>
          </div>

          {/* Definition */}
          {term.definition && (
            <div className="ontology-sidebar-definition">
              <h3 className="ontology-sidebar-section-title">Definition</h3>
              <p className="ontology-sidebar-text">{term.definition}</p>
            </div>
          )}

          {/* Synonyms */}
          {term.synonyms && term.synonyms.length > 0 && (
            <div className="ontology-sidebar-synonyms">
              <h3 className="ontology-sidebar-section-title">Synonyms</h3>
              <p className="ontology-sidebar-text">
                {term.synonyms.join(', ')}
              </p>
            </div>
          )}

          {/* Source ontology */}
          {term.ontology && (
            <div className="ontology-sidebar-ontology">
              <h3 className="ontology-sidebar-section-title">Source Ontology</h3>
              <p className="ontology-sidebar-text">{term.ontology}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="ontology-sidebar-actions">
            <button
              type="button"
              className="ontology-sidebar-btn ontology-sidebar-btn-primary"
              onClick={handleAddToVocab}
            >
              Add to Local Vocabulary
            </button>
            <button
              type="button"
              className="ontology-sidebar-btn ontology-sidebar-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default OntologySidebar;
