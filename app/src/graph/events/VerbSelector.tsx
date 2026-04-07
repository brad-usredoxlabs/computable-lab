/**
 * VerbSelector Component
 * 
 * Dropdown selector for verbs from the active VocabPack.
 * Groups verbs by category (primitives vs macros) and shows
 * icons, labels, and ontology info.
 */

import { useState, useMemo } from 'react'
import type { VerbDefinition, VocabPack } from '../../shared/vocab/types'
import { isMacroVerb } from '../../shared/vocab/types'
import { vocabRegistry } from '../../shared/vocab/registry'

// =============================================================================
// Types
// =============================================================================

export interface VerbSelectorProps {
  /** Currently selected verb ID */
  value?: string
  /** Callback when verb is selected */
  onChange: (verb: string) => void
  /** Vocab pack to use (defaults to first available) */
  vocabPackId?: string
  /** Filter to show only primitives or macros */
  filter?: 'all' | 'primitive' | 'macro'
  /** Show ontology info */
  showOntology?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Custom className */
  className?: string
}

// =============================================================================
// Helper Components
// =============================================================================

interface VerbOptionProps {
  verbDef: VerbDefinition
  selected: boolean
  showOntology: boolean
  onClick: () => void
}

function VerbOption({ verbDef, selected, showOntology, onClick }: VerbOptionProps) {
  const isMacro = isMacroVerb(verbDef)
  
  return (
    <button
      type="button"
      className={`verb-option ${selected ? 'selected' : ''}`}
      onClick={onClick}
      title={verbDef.displayName}
    >
      <span className="verb-icon">{verbDef.icon}</span>
      <span className="verb-label">{verbDef.displayName}</span>
      {isMacro && <span className="verb-badge macro">macro</span>}
      {showOntology && verbDef.ontologyTerm && (
        <span className="verb-ontology" title={verbDef.ontologyTerm.iri}>
          {verbDef.ontologyTerm.label}
        </span>
      )}
    </button>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function VerbSelector({
  value,
  onChange,
  vocabPackId,
  filter = 'all',
  showOntology = false,
  disabled = false,
  className = '',
}: VerbSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Get vocab pack
  const vocabPack = useMemo((): VocabPack | null => {
    if (vocabPackId) {
      return vocabRegistry.getPack(vocabPackId) || null
    }
    // Get first available pack
    const allPacks = vocabRegistry.getAllPacks()
    return allPacks.length > 0 ? allPacks[0] : null
  }, [vocabPackId])

  // Filter verbs
  const verbs = useMemo((): VerbDefinition[] => {
    if (!vocabPack) return []
    
    let allVerbs = vocabPack.verbs
    
    if (filter === 'primitive') {
      allVerbs = allVerbs.filter(v => v.eventKind === 'primitive')
    } else if (filter === 'macro') {
      allVerbs = allVerbs.filter(v => v.eventKind === 'macro')
    }
    
    return allVerbs
  }, [vocabPack, filter])

  // Group verbs by category
  const groupedVerbs = useMemo(() => {
    const primitives = verbs.filter(v => v.eventKind === 'primitive')
    const macros = verbs.filter(v => v.eventKind === 'macro')
    return { primitives, macros }
  }, [verbs])

  // Get selected verb
  const selectedVerb = useMemo(() => {
    if (!value || !vocabPack) return null
    return vocabPack.verbs.find(v => v.verb === value) || null
  }, [value, vocabPack])

  // Handle selection
  const handleSelect = (verb: string) => {
    onChange(verb)
    setIsOpen(false)
  }

  if (!vocabPack) {
    return (
      <div className={`verb-selector error ${className}`}>
        <span>No vocab pack available</span>
      </div>
    )
  }

  return (
    <div className={`verb-selector ${disabled ? 'disabled' : ''} ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        className="verb-selector-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {selectedVerb ? (
          <>
            <span className="verb-icon">{selectedVerb.icon}</span>
            <span className="verb-label">{selectedVerb.displayName}</span>
            {isMacroVerb(selectedVerb) && <span className="verb-badge macro">macro</span>}
          </>
        ) : (
          <span className="verb-placeholder">Select action...</span>
        )}
        <span className="verb-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="verb-selector-dropdown">
          {/* Primitives */}
          {groupedVerbs.primitives.length > 0 && filter !== 'macro' && (
            <div className="verb-group">
              <div className="verb-group-header">Primitives</div>
              {groupedVerbs.primitives.map(verbDef => (
                <VerbOption
                  key={verbDef.verb}
                  verbDef={verbDef}
                  selected={value === verbDef.verb}
                  showOntology={showOntology}
                  onClick={() => handleSelect(verbDef.verb)}
                />
              ))}
            </div>
          )}

          {/* Macros */}
          {groupedVerbs.macros.length > 0 && filter !== 'primitive' && (
            <div className="verb-group">
              <div className="verb-group-header">Macros</div>
              {groupedVerbs.macros.map(verbDef => (
                <VerbOption
                  key={verbDef.verb}
                  verbDef={verbDef}
                  selected={value === verbDef.verb}
                  showOntology={showOntology}
                  onClick={() => handleSelect(verbDef.verb)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Styles */}
      <style>{`
        .verb-selector {
          position: relative;
          display: inline-block;
          min-width: 180px;
        }
        
        .verb-selector.disabled {
          opacity: 0.6;
          pointer-events: none;
        }
        
        .verb-selector.error {
          color: #c92a2a;
        }
        
        .verb-selector-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          text-align: left;
        }
        
        .verb-selector-trigger:hover {
          border-color: #adb5bd;
        }
        
        .verb-selector-trigger:focus {
          outline: none;
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.2);
        }
        
        .verb-icon {
          font-size: 16px;
        }
        
        .verb-label {
          flex: 1;
          font-weight: 500;
        }
        
        .verb-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 10px;
          text-transform: uppercase;
          font-weight: 600;
        }
        
        .verb-badge.macro {
          background: #e7f5ff;
          color: #1c7ed6;
        }
        
        .verb-placeholder {
          color: #868e96;
        }
        
        .verb-chevron {
          color: #868e96;
          font-size: 10px;
        }
        
        .verb-selector-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .verb-group {
          padding: 4px 0;
        }
        
        .verb-group:not(:last-child) {
          border-bottom: 1px solid #e9ecef;
        }
        
        .verb-group-header {
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: #868e96;
        }
        
        .verb-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          text-align: left;
        }
        
        .verb-option:hover {
          background: #f1f3f4;
        }
        
        .verb-option.selected {
          background: #e7f5ff;
        }
        
        .verb-ontology {
          font-size: 10px;
          color: #868e96;
          font-family: monospace;
        }
      `}</style>
    </div>
  )
}

export default VerbSelector
