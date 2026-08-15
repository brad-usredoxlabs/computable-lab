/**
 * LocalProtocolSetupWidgets — the three plate-setting sections of the
 * local-protocol TapTab form (Labwares / Equipment / Materials).
 *
 * Each row is a biologist-facing binding: { role, description?, ref? }.
 * `role` is the "what it's for" label (biologist language — never the word
 * "binding" in the UI). `ref` is picked with the slash-primed combobox
 * (local-first → ontology → create-new): focusing the pick field primes the
 * right slash command (/l /e /m), so power users get the menu instantly.
 *
 * Reuses ProtocolMentionEditor (ProtocolAuthoringWidgets.tsx) — the same
 * TipTap + slash-menu stack the universal-protocol role widgets use.
 */
import { useRef, useState } from 'react'
import { ProtocolMentionEditor, removeSlashMenuRoots } from './ProtocolAuthoringWidgets'
import { RefBadge, type Ref } from '../../../shared/ref/RefBadge'
import type { SlashMention } from '../../../shared/taptab/slashMenu'

/**
 * One plate-setting row: a biologist-facing role plus (optionally) a
 * concrete binding. `ref` absent = pending pick — the AI drafts the row at
 * local-protocol creation and the user completes it with the combobox.
 */
export interface SetupRow {
  role: string
  description?: string
  ref?: { kind: 'record' | 'ontology'; id: string; type?: string; label?: string; namespace?: string }
}

export type SetupKind = 'labware' | 'equipment' | 'material'

interface SetupSectionWidgetProps {
  kind: SetupKind
  value: unknown
  readOnly: boolean
  onCommit: (rows: SetupRow[]) => void
}

const KIND_COPY: Record<SetupKind, { noun: string; slash: string; pickPlaceholder: string }> = {
  labware: { noun: 'labware', slash: 'l', pickPlaceholder: 'Pick labware (/l)' },
  equipment: { noun: 'equipment', slash: 'e', pickPlaceholder: 'Pick equipment (/e)' },
  material: { noun: 'material', slash: 'm', pickPlaceholder: 'Pick material (/m)' },
}

export function SetupSectionWidget({ kind, value, readOnly, onCommit }: SetupSectionWidgetProps) {
  const rows = Array.isArray(value) ? (value as SetupRow[]) : []
  const copy = KIND_COPY[kind]
  const [adding, setAdding] = useState(false)
  const [roleText, setRoleText] = useState('')
  const [descText, setDescText] = useState('')
  const pendingMention = useRef<SlashMention | null>(null)

  const commit = (next: SetupRow[]) => onCommit(next)

  const addRow = () => {
    const role = roleText.trim()
    if (!role) return
    const row: SetupRow = {
      role,
      ...(descText.trim() ? { description: descText.trim() } : {}),
      ...(pendingMention.current ? { ref: mentionToSetupRef(pendingMention.current, kind) } : {}),
    }
    commit([...rows, row])
    pendingMention.current = null
    setRoleText('')
    setDescText('')
    setAdding(false)
  }

  const updateRowRef = (index: number, mention: SlashMention | null) => {
    const next = [...rows]
    const row = { ...next[index] }
    if (mention) row.ref = mentionToSetupRef(mention, kind)
    else delete row.ref
    next[index] = row
    commit(next)
  }

  return (
    <div className="taptab-protocol-list" data-testid={`setup-section-${kind}`}>
      {rows.length === 0 && !adding && (
        <span className="taptab-widget-empty">Nothing set yet — add what this assay needs.</span>
      )}
      {rows.map((row, i) => (
        <div className="taptab-setup-row" key={`${row.role}-${i}`} data-testid={`setup-row-${i + 1}`}>
          <span className="taptab-setup-row__role">{row.role}</span>
          {row.description ? <span className="taptab-setup-row__desc">{row.description}</span> : null}
          {row.ref ? (
            <RefBadge
              value={toRefBadgeRef(row.ref)}
              size="md"
              showExternalLink={false}
              onRemove={readOnly ? undefined : () => updateRowRef(i, null)}
            />
          ) : (
            !readOnly && (
              <span className="taptab-setup-row__pending" data-testid={`setup-row-pending-${i + 1}`}>
                not set yet
              </span>
            )
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${copy.noun} row`}
              className="taptab-setup-row__x"
            >
              x
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        adding ? (
          <div className="taptab-setup-add" contentEditable={false} data-testid="setup-add-form">
            <input
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
              placeholder="What is it for? (e.g. Sample plate, Plate reader, Treatment medium)"
              className="taptab-setup-add__role"
            />
            <input
              value={descText}
              onChange={(e) => setDescText(e.target.value)}
              placeholder="Note (concentration, lot, why this one) — optional"
              className="taptab-setup-add__desc"
            />
            <ProtocolMentionEditor
              value=""
              placeholder={copy.pickPlaceholder}
              className="taptab-setup-add__pick"
              serialize="readable"
              defaultSlashCommand={copy.slash}
              onCommit={(_text, mentions) => {
                pendingMention.current = mentions[0] ?? null
              }}
            />
            <div className="taptab-setup-add__actions">
              <button type="button" onClick={addRow}>Add</button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  removeSlashMenuRoots()
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="taptab-protocol-add-btn" onClick={() => setAdding(true)}>
            + Add {copy.noun}
          </button>
        )
      )}
    </div>
  )
}

/**
 * Map a slash-menu mention onto the Ref-datatype shape for a setup row.
 *
 * Ontology CURIE picks arrive as material mentions whose `id` is the CURIE
 * (e.g. CHEBI:16236) — record ids (PREFIX-nnnn) never contain a colon, so
 * `id.includes(':')` is the v1 discriminator. The Ref datatype requires
 * kind: 'ontology' + namespace + label for ontology terms; the namespace is
 * derived from the CURIE prefix. (Cleaner fix — a `namespace` field on
 * SlashMention — is flagged in the plan, not scheduled.)
 */
export function mentionToSetupRef(mention: SlashMention, kind: SetupKind): SetupRow['ref'] {
  if (mention.type === 'material') {
    if (mention.id.includes(':')) {
      const [ns] = mention.id.split(':')
      return { kind: 'ontology', id: mention.id, namespace: ns.toUpperCase(), label: mention.label }
    }
    return { kind: 'record', id: mention.id, type: mention.entityKind, label: mention.label }
  }
  if (mention.type === 'labware') {
    return { kind: 'record', id: mention.id, type: 'labware', label: mention.label }
  }
  if (mention.type === 'tube') {
    // Tubes are size literals, not records — store the size label as id.
    return { kind: 'record', id: mention.sizeLabel, type: 'tube', label: mention.label }
  }
  if (mention.type === 'equipment') {
    return { kind: 'record', id: mention.id, type: 'equipment', label: mention.label }
  }
  // protocol/selection mentions are not valid setup picks — caller shouldn't pass them.
  if (mention.type === 'protocol') {
    return { kind: 'record', id: mention.id, type: kind, label: mention.label }
  }
  // selection mentions carry no stable id of their own
  return { kind: 'record', id: mention.labwareId, type: kind, label: mention.label }
}

/** Convert a setup-row ref into the RefBadge's Ref datatype shape. */
export function toRefBadgeRef(ref: NonNullable<SetupRow['ref']>): Ref {
  if (ref.kind === 'ontology') {
    return { kind: 'ontology' as const, id: ref.id, namespace: ref.namespace ?? '', label: ref.label ?? ref.id }
  }
  return { kind: 'record' as const, type: ref.type ?? '', id: ref.id, label: ref.label ?? ref.id }
}
