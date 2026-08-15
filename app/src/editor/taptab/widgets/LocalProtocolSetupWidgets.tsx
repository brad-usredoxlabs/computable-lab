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
import { useEffect, useRef, useState } from 'react'
import { ProtocolMentionEditor, removeSlashMenuRoots } from './ProtocolAuthoringWidgets'
import { RefBadge, type Ref } from '../../../shared/ref/RefBadge'
import { API_BASE } from '../../../shared/api/base'
import type { SlashMention } from '../../../shared/taptab/slashMenu'
// This widget renders the setup rows AND the ProtocolMentionEditor slash-combobox
// inside them. Its styles live in taptab.css. Import that stylesheet HERE so the
// widget is fully styled in EVERY context it renders (the right-pane Protocol tab
// of protocol-planning mode imports no taptab.css on its own) — a reusable
// component must own its stylesheet, not depend on a parent consumer importing it.
import '../taptab.css'

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
  /**
   * Indices (into `value`) of rows that are GHOSTED SUGGESTIONS — seeded from
   * the inherited universal protocol's declared roles and not yet confirmed
   * with a concrete binding (no `ref`). Rendered with a dashed "suggested"
   * badge instead of the "not set yet" pending affordance, so the biologist
   * can tell a suggestion apart from a row they added that's simply awaiting a
   * pick. Absent/empty = no suggestions.
   */
  suggestionRows?: number[]
}

const KIND_COPY: Record<SetupKind, { title: string; noun: string; slash: string; pickPlaceholder: string }> = {
  labware: { title: 'Labwares', noun: 'labware', slash: 'l', pickPlaceholder: 'Pick labware (/l)' },
  equipment: { title: 'Equipment', noun: 'equipment', slash: 'e', pickPlaceholder: 'Pick equipment (/e)' },
  material: { title: 'Materials', noun: 'material', slash: 'm', pickPlaceholder: 'Pick material (/m)' },
}

export function SetupSectionWidget({ kind, value, readOnly, onCommit, suggestionRows }: SetupSectionWidgetProps) {
  const rows = Array.isArray(value) ? (value as SetupRow[]) : []
  const copy = KIND_COPY[kind]
  const suggestionSet = new Set(suggestionRows ?? [])
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

  /**
   * Commit an EDITED rich-text line. `text` is the human-readable line content
   * (may be the picked term label, or the role the user typed); `mentions[0]`
   * is the concrete labware/equipment/material the slash-combobox resolved to
   * (local-first → ontology → create-new), which becomes the row's binding.
   * Editing a suggested row to a concrete term replaces its ghost role label
   * (kept as description) and binds the ref; a row the user leaves unbound
   * keeps its role text as the role.
   */
  const commitRow = (index: number, text: string, mentions: SlashMention[]) => {
    const next = [...rows]
    const row = { ...next[index] }
    const label = text.trim()
    const mention = mentions[0] ?? null
    if (mention) {
      row.ref = mentionToSetupRef(mention, kind)
      row.description = mention.label || label || row.description
    } else {
      delete row.ref
      if (label && label !== row.role) row.description = label
    }
    next[index] = row
    commit(next)
  }

  const rowIsSuggestion = (i: number, row: SetupRow) => suggestionSet.has(i) && !row.ref

  return (
    <div className="taptab-protocol-list taptab-setup-doc" data-testid={`setup-section-${kind}`}>
      <h4 className="protocol-setup-sections__subtitle">{copy.title}</h4>
      {rows.length === 0 && !adding && (
        <span className="taptab-widget-empty">Nothing set yet — add what this assay needs.</span>
      )}
      {rows.map((row, i) => (
        <div
          key={`${row.role}-${i}`}
          className={`taptab-setup-line${rowIsSuggestion(i, row) ? ' taptab-setup-line--suggested' : ''}`}
          data-testid={`setup-row-${i + 1}`}
        >
          {readOnly ? (
            /* Read-only preview (universal-protocol role view): plain text + suggested tag */
            <>
              <span className="taptab-setup-row__role">{row.description ?? row.role}</span>
              {row.ref ? (
                <RefBadge value={toRefBadgeRef(row.ref)} size="md" showExternalLink={false} />
              ) : rowIsSuggestion(i, row) ? (
                <span className="taptab-setup-row__suggested" data-testid={`setup-row-suggested-${i + 1}`}>suggested</span>
              ) : null}
            </>
          ) : row.ref ? (
            /* Bound row: role label + the concrete term badge (removable clears the binding) */
            <>
              <span className="taptab-setup-row__role">{row.role}</span>
              <RefBadge
                value={toRefBadgeRef(row.ref)}
                size="md"
                showExternalLink={false}
                onRemove={() => updateRowRef(i, null)}
              />
            </>
          ) : (
            /* Unbound row — an editable rich-text document line. Focusing it
               primes the section's slash-combobox (/l /e /m) pre-filtered to the
               ghosted label (e.g. "proteinase K" opens `/m proteinase K`). */
            <>
              <ProtocolMentionEditor
                key={`line-${i}-${row.description ?? row.role}`}
                value={row.description ?? row.role}
                placeholder={copy.pickPlaceholder}
                className="taptab-setup-line__editor"
                serialize="readable"
                defaultSlashCommand={copy.slash}
                defaultSlashQuery={row.description ?? row.role}
                onCommit={(text, mentions) => commitRow(i, text, mentions)}
              />
              {rowIsSuggestion(i, row) && (
                <span className="taptab-setup-row__suggested" data-testid={`setup-row-suggested-${i + 1}`}>suggested</span>
              )}
            </>
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

interface LocalProtocolStep {
  stepId: string
  label?: string
  description?: string
}

/**
 * LocalProtocolStepsWidget — read-only list of the inherited universal
 * protocol's steps. The UI spec feeds this widget the `inherits_from.id`
 * string (record id of the universal protocol); the widget fetches
 * GET /api/protocols/{id}/steps. Display-only: editing steps belongs to the
 * universal protocol's own TapTab form. `onCommit` is part of the
 * WidgetRenderer contract and intentionally unused.
 */
export function LocalProtocolStepsWidget({
  value,
  readOnly,
  onCommit,
}: {
  value: unknown
  readOnly: boolean
  onCommit: (v: unknown) => void
}) {
  const protocolId = typeof value === 'string' ? value : ''
  const [steps, setSteps] = useState<LocalProtocolStep[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')

  useEffect(() => {
    if (!protocolId) return
    let cancelled = false
    setState('loading')
    fetch(`${API_BASE}/protocols/${encodeURIComponent(protocolId)}/steps`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { steps?: LocalProtocolStep[] }) => {
        if (cancelled) return
        setSteps(Array.isArray(data.steps) ? data.steps : [])
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [protocolId])

  void readOnly
  void onCommit

  if (!protocolId) return <span className="taptab-widget-empty">No inherited protocol linked.</span>
  if (state === 'loading') return <span className="taptab-widget-empty">Loading steps…</span>
  if (state === 'error') return <span className="taptab-widget-empty">Could not load steps.</span>
  if (steps.length === 0) return <span className="taptab-widget-empty">The inherited protocol has no steps yet.</span>
  return (
    <ol className="taptab-protocol-numbered-list" data-testid="local-protocol-steps">
      {steps.map((s, i) => (
        <li key={s.stepId ?? i} className="taptab-protocol-step-item">
          <span className="taptab-protocol-step">{`${i + 1}. ${s.label ?? s.description ?? s.stepId}`}</span>
          {s.description && s.label ? <span className="taptab-setup-row__desc">{s.description}</span> : null}
        </li>
      ))}
    </ol>
  )
}
