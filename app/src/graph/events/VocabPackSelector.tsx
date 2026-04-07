/**
 * VocabPackSelector - Dropdown to switch between vocabulary packs.
 * 
 * Allows switching between e.g., liquid-handling and animal-handling packs.
 */

import { useState, useMemo } from 'react'
import type { VocabPack } from '../../shared/vocab/types'
import { vocabRegistry } from '../../shared/vocab/registry'

export interface VocabPackSelectorProps {
  /** Currently selected pack ID */
  value?: string
  /** Callback when pack is selected */
  onChange: (packId: string) => void
  /** Compact mode */
  compact?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Custom className */
  className?: string
}

export function VocabPackSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
  className = '',
}: VocabPackSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Get all available packs
  const packs = useMemo(() => vocabRegistry.getAllPacks(), [])

  // Get selected pack
  const selectedPack = useMemo((): VocabPack | null => {
    if (!value) return packs[0] || null
    return vocabRegistry.getPack(value) || packs[0] || null
  }, [value, packs])

  const handleSelect = (packId: string) => {
    onChange(packId)
    setIsOpen(false)
  }

  if (packs.length === 0) {
    return <span className="vocab-pack-selector error">No packs</span>
  }

  // If only one pack, don't show selector
  if (packs.length === 1) {
    return (
      <span className={`vocab-pack-selector single ${className}`}>
        <span className="pack-icon">📦</span>
        <span className="pack-name">{packs[0].displayName}</span>
      </span>
    )
  }

  return (
    <div className={`vocab-pack-selector ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''} ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        className="vocab-pack-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="pack-icon">📦</span>
        {!compact && <span className="pack-name">{selectedPack?.displayName || 'Select...'}</span>}
        <span className="pack-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="vocab-pack-dropdown">
          {packs.map(pack => (
            <button
              key={pack.packId}
              type="button"
              className={`vocab-pack-option ${pack.packId === selectedPack?.packId ? 'selected' : ''}`}
              onClick={() => handleSelect(pack.packId)}
            >
              <span className="pack-icon">
                {pack.defaultRenderStyle === 'wells' ? '🔬' :
                 pack.defaultRenderStyle === 'cages' ? '🐁' : '📦'}
              </span>
              <div className="pack-info">
                <span className="pack-name">{pack.displayName}</span>
                <span className="pack-desc">{pack.description}</span>
              </div>
              <span className="pack-verb-count">{pack.verbs.length} verbs</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .vocab-pack-selector {
          position: relative;
          display: inline-block;
        }

        .vocab-pack-selector.disabled {
          opacity: 0.6;
          pointer-events: none;
        }

        .vocab-pack-selector.error {
          color: #c92a2a;
        }

        .vocab-pack-selector.single {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: #f1f3f5;
          border-radius: 4px;
          font-size: 12px;
          color: #495057;
        }

        .vocab-pack-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }

        .vocab-pack-trigger:hover {
          border-color: #adb5bd;
        }

        .vocab-pack-trigger:focus {
          outline: none;
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.2);
        }

        .vocab-pack-selector.compact .vocab-pack-trigger {
          padding: 4px 8px;
        }

        .pack-icon {
          font-size: 14px;
        }

        .pack-name {
          font-weight: 500;
        }

        .pack-chevron {
          font-size: 9px;
          color: #868e96;
        }

        .vocab-pack-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          min-width: 280px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
        }

        .vocab-pack-option {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          background: none;
          border: none;
          border-bottom: 1px solid #e9ecef;
          cursor: pointer;
          text-align: left;
        }

        .vocab-pack-option:last-child {
          border-bottom: none;
        }

        .vocab-pack-option:hover {
          background: #f1f3f5;
        }

        .vocab-pack-option.selected {
          background: #e7f5ff;
        }

        .pack-info {
          flex: 1;
        }

        .pack-info .pack-name {
          display: block;
          font-size: 13px;
        }

        .pack-desc {
          display: block;
          font-size: 11px;
          color: #868e96;
          margin-top: 2px;
        }

        .pack-verb-count {
          font-size: 10px;
          padding: 2px 6px;
          background: #e9ecef;
          border-radius: 10px;
          color: #495057;
        }
      `}</style>
    </div>
  )
}

export default VocabPackSelector
