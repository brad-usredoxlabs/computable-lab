/**
 * LabLabwareNewPage — /lab/labware/new create surface (L2-SPEC-SHEET-INGEST-1 doorB1).
 *
 * Calls the EXISTING extractSpecSheetProposals endpoint with recordKind: 'labware',
 * renders every proposal with its citation, and saves a labware-definition built ONLY
 * from proposals. Refuses with a named reason when schema-required fields have no
 * proposal.
 *
 * Outcome arms: Success (proposals rendered), NotConfigured (no save affordance),
 * Blocked (name the block), NoProposals (honest empty state), and thrown error.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { SpecSheetProposal } from '../shared/api/client'
import { useMaterialSearch } from '../event-editor/material/useMaterialSearch'
import { ontologyRefFromCandidate, type OntologyRef } from '../shared/ref'

const LABWARE_DEFINITION_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'

/**
 * u2geom — the manual geometry section: the EXACT schema fields a person can
 * declare by hand when no spec-sheet URL was extracted (schema/workflow/
 * labware-definition.schema.yaml). Every input starts as the EMPTY STRING:
 * a blank entry contributes no manual row, hence no key in the payload.
 * "Never invent a value" (CLAUDE.md Hard Boundary) — there are no defaults
 * anywhere in this list.
 */
const MANUAL_GEOMETRY_FIELDS: Array<{
  testid: string
  label: string
  targetField: string
  kind: 'select' | 'text'
  options?: string[]
}> = [
  { testid: 'addressing', label: 'Addressing', targetField: 'topology.addressing', kind: 'select', options: ['grid', 'linear', 'single'] },
  { testid: 'rows', label: 'Rows', targetField: 'topology.rows', kind: 'text' },
  { testid: 'columns', label: 'Columns', targetField: 'topology.columns', kind: 'text' },
  { testid: 'linear-count', label: 'Linear count', targetField: 'topology.linear_count', kind: 'text' },
  { testid: 'well-pitch', label: 'Well pitch (mm)', targetField: 'topology.well_pitch_mm', kind: 'text' },
  { testid: 'row-pitch', label: 'Row pitch (mm)', targetField: 'topology.row_pitch_mm', kind: 'text' },
  { testid: 'col-pitch', label: 'Column pitch (mm)', targetField: 'topology.col_pitch_mm', kind: 'text' },
  { testid: 'max-volume', label: 'Max well volume (µL)', targetField: 'capacity.max_well_volume_uL', kind: 'text' },
  { testid: 'min-volume', label: 'Min working volume (µL)', targetField: 'capacity.min_working_volume_uL', kind: 'text' },
  { testid: 'length', label: 'Overall length (mm)', targetField: 'physical_geometry.overall_dimensions_mm.length', kind: 'text' },
  { testid: 'width', label: 'Overall width (mm)', targetField: 'physical_geometry.overall_dimensions_mm.width', kind: 'text' },
]

/** Mint a LW-<8 hex uppercase> recordId */
function mintRecordId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return `LW-${hex}`
}

/**
 * Seed the name input from the declared ?prefillName= query value (u1nounprefill),
 * so the journey can open this create surface with the noun already filled in —
 * no re-typing (D8 ghost-first). Same convention as FormulationsPage's
 * prefillName param. Read ONCE at first render (lazy useState initialiser —
 * never an effect, which would clobber typed input on re-render). Missing,
 * empty, or whitespace-only values yield '' exactly as before; no extraction,
 * save, or network call happens on load.
 */
function initialPrefillName(): string {
  const prefill = new URLSearchParams(window.location.search).get('prefillName')
  return (prefill ?? '').trim().slice(0, 120)
}

/** Unit token -> multiplier into microlitres (the schema's volume unit). */
const UNIT_TO_UL: Record<string, number> = {
  nl: 0.001,
  ul: 1,
  'µl': 1,
  ml: 1000,
  l: 1000000,
}

// The unit token must END the token: not followed by another letter ("100 lb",
// "100mLx") or a compound-unit separator ("1 L/min"). Otherwise the bare-L arm
// silently turns a mass or a rate into litres.
const QUANTITY_UNIT_RE = /(-?\d+(?:\.\d+)?)\s*(nL|µL|uL|mL|L)(?![A-Za-z/])/gi

/**
 * Parse a SINGLE unambiguous "<number><unit>" quantity out of a string bound for
 * a schema `number` field. "100mL" -> 100000. Returns undefined when the string
 * carries two or more quantities ("195 mL, 185 mL"), another number, or no
 * recognisable unit — the raw string is then kept so the save pre-flight can
 * refuse it by name rather than guess.
 */
function parseUnitQuantity(raw: string): number | undefined {
  const matches = [...raw.matchAll(QUANTITY_UNIT_RE)]
  if (matches.length !== 1) return undefined
  const match = matches[0]
  if (/\d/.test(raw.replace(match[0], ''))) return undefined
  const factor = UNIT_TO_UL[match[2].toLowerCase()]
  if (factor === undefined) return undefined
  const quantity = Number(match[1]) * factor
  return Number.isFinite(quantity) ? quantity : undefined
}

/**
 * Build a nested payload from flat proposal targetField paths, coercing values
 * to the schema-declared types (integer, number) when the schema is available.
 * e.g. "topology.rows" → { topology: { rows: value } }
 * Optional fields (citation, etc.) are OMITTED when absent — never undefined.
 *
 * D3: provenance URL is frozen at extraction time — never read from mutable
 *      state. Prefer the first proposal's sourceUrl (the backend declares it);
 *      fall back to the frozen extraction URL.
 * D4: kind, type, read_only, and source.kind are derived from the schema
 *      properties. Hardcoded literals remain as fallback when schema is absent
 *      or does not declare those keys.
 * u3anchor: the ontology anchor is the EXPLICIT, resolved term the person
 *      picked (ontologyRefFromCandidate over the resolve spine) — threaded in
 *      by the page and written here. This ONE builder stays the one builder;
 *      no second mapper, no CURIE minted from the name, no key without a pick.
 */
function buildPayloadFromProposals(
  proposals: SpecSheetProposal[],
  displayName: string,
  schema?: Record<string, unknown>,
  extractedUrl?: string,
  ontologyRef?: OntologyRef
): Record<string, unknown> {
  const recordId = mintRecordId()

  // D4: derive kind/type from schema const, fallback to literals
  const props: Record<string, unknown> | undefined =
    typeof schema?.properties === 'object' && schema?.properties !== null
      ? schema.properties as Record<string, unknown>
      : undefined
  const kindVal: string =
    props?.kind && typeof (props.kind as any).const === 'string'
      ? (props.kind as any).const
      : 'labware-definition'
  const typeVal: string =
    props?.type && typeof (props.type as any).const === 'string'
      ? (props.type as any).const
      : 'labware_definition'

  const payload: Record<string, unknown> = {
    kind: kindVal,
    recordId,
    type: typeVal,
    id: recordId,
    display_name: displayName,
  }

  // D4: set read_only: true only when schema declares read_only as boolean
  if (props?.read_only &&
      typeof props.read_only === 'object' &&
      props.read_only !== null &&
      (props.read_only as Record<string, unknown>).type === 'boolean'
  ) {
    payload.read_only = true
  }

  // D3: freeze provenance — use proposal.sourceUrl first, then extractedUrl
  const provenanceUrl = proposals[0]?.sourceUrl || extractedUrl
  if (provenanceUrl) {
    // D4: source.kind from schema enum (prefer 'imported'), fallback to literal
    const sourceNode = props?.source
    const sourceProps: Record<string, unknown> | undefined =
      typeof sourceNode === 'object' && sourceNode !== null &&
      typeof (sourceNode as Record<string, unknown>).properties === 'object' &&
      (sourceNode as Record<string, unknown>).properties !== null
        ? (sourceNode as Record<string, unknown>).properties as Record<string, unknown>
        : undefined
    const kindNode: unknown = sourceProps?.kind
    const sourceKindEnum: string[] | undefined =
      typeof kindNode === 'object' && kindNode !== null &&
      Array.isArray((kindNode as Record<string, unknown>).enum)
        ? (kindNode as Record<string, unknown>).enum as string[]
        : undefined
    const sourceKind: string =
      sourceKindEnum?.includes('imported')
        ? 'imported'
        : sourceKindEnum?.[0] ?? 'imported'
    payload.source = { kind: sourceKind, url: provenanceUrl }
  }

  // g6 D1: the schema REQUIRES topology.addressing, but real spec sheets state array
  // facts (rows/columns/linear_count) without ever naming an addressing type. Derive it
  // deterministically from what the document DID yield; an extractor-supplied value wins.
  // g6topofix1: 'single' is derivable ONLY when the sheet yielded no array facts at all.
  // A partial array (exactly one of rows/columns, no linear_count) is a reachable outcome,
  // and 'single' would contradict it (Opentrons maps 'single' -> one well). Add nothing so
  // the pre-flight refuses by name instead of inventing a value.
  const hasField = (field: string) => proposals.some((p) => p.targetField === field)
  const addressingValue: 'grid' | 'linear' | 'single' | undefined =
    hasField('topology.rows') && hasField('topology.columns')
      ? 'grid'
      : hasField('topology.linear_count')
        ? 'linear'
        : !hasField('topology.rows') && !hasField('topology.columns')
          ? 'single'
          : undefined
  const loopProposals: SpecSheetProposal[] =
    hasField('topology.addressing') || addressingValue === undefined
      ? proposals
      : [
          ...proposals,
          {
            targetField: 'topology.addressing',
            value: addressingValue,
            sourceUrl: proposals[0]?.sourceUrl ?? '',
            passage: '',
            specId: 'derived-topology-addressing',
          },
        ]

  for (const p of loopProposals) {
    if (p.targetField === 'display_name') continue // already set from the name input
    const parts = p.targetField.split('.')
    let current: Record<string, unknown> = payload
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }
    const leafKey = parts[parts.length - 1]
    // Coerce to schema-declared type when schema is available
    let value: unknown = p.value
    if (schema && typeof p.value === 'string' && p.value !== '') {
      const declaredType = resolveSchemaType(schema, parts)
      if (declaredType === 'integer' || declaredType === 'number') {
        const num = Number(p.value)
        if (!Number.isNaN(num)) {
          if (declaredType === 'integer' && Number.isInteger(num)) {
            value = num
          } else if (declaredType === 'number') {
            value = num
          }
        } else if (declaredType === 'number') {
          // "100mL" style quantities: convert the unit to uL when unambiguous.
          const withUnit = parseUnitQuantity(p.value)
          if (withUnit !== undefined) value = withUnit
        }
      }
    }
    current[leafKey] = value
  }

  // u3anchor: the declared ontology anchor, written only when the person picked
  // one. The ref shape is exactly the schema's ontology_ref (kind/id/namespace/
  // label[,uri]) — additionalProperties:false — and `uri` is absent, never
  // undefined, when the candidate carries no IRI (ontologyRefFromCandidate).
  if (ontologyRef) {
    payload.ontology_ref = ontologyRef
  }

  return payload
}

/** Walk the schema properties chain to find the declared type for a path */
function resolveSchemaType(
  schema: Record<string, unknown>,
  path: string[]
): string | undefined {
  const props = schema.properties
  if (typeof props !== 'object' || props === null) return undefined
  let current: Record<string, unknown> | undefined = props as Record<string, unknown>
  for (let i = 0; i < path.length; i++) {
    const key = path[i]
    if (!current || !(key in current)) return undefined
    const node: unknown = current[key]
    // For intermediate nodes, descend into properties
    if (typeof node === 'object' && node !== null && 'properties' in node) {
      current = (node as Record<string, unknown>).properties as Record<string, unknown>
      continue
    }
    // Only return type for the final leaf node
    if (i === path.length - 1 && typeof node === 'object' && node !== null && 'type' in node) {
      return (node as Record<string, unknown>).type as string
    }
    return undefined
  }
  return undefined
}

/** Root required keys the payload builder always sets; never worth pre-flighting. */
const PAYLOAD_BUILT_REQUIRED = new Set([
  'state',
  'recordId',
  'type',
  'id',
  'kind',
  'display_name',
])

/**
 * Walk a schema node's `required` list against the built payload and collect the
 * field paths that are absent/empty, or non-numeric where the schema says number
 * or integer. Descends into a nested `required` list only when the parent value
 * is present, so a wholly absent group is named by its own root path.
 */
function collectInvalidRequiredPaths(
  node: Record<string, unknown>,
  value: unknown,
  prefix: string[],
  invalid: string[]
): void {
  const required = node.required
  const props = node.properties
  if (!Array.isArray(required) || typeof props !== 'object' || props === null) return
  const propsRec = props as Record<string, unknown>
  for (const rawKey of required) {
    if (typeof rawKey !== 'string') continue
    if (prefix.length === 0 && PAYLOAD_BUILT_REQUIRED.has(rawKey)) continue
    const path = [...prefix, rawKey]
    const child =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[rawKey]
        : undefined
    if (child === undefined || child === null || child === '') {
      invalid.push(path.join('.'))
      continue
    }
    const childSchema = propsRec[rawKey]
    if (typeof childSchema !== 'object' || childSchema === null) continue
    const childNode = childSchema as Record<string, unknown>
    if (
      (childNode.type === 'number' && (typeof child !== 'number' || Number.isNaN(child))) ||
      (childNode.type === 'integer' && (typeof child !== 'number' || !Number.isInteger(child)))
    ) {
      invalid.push(path.join('.'))
      continue
    }
    collectInvalidRequiredPaths(childNode, child, path, invalid)
  }
}

export function LabLabwareNewPage() {
  const navigate = useNavigate()

  const [name, setName] = useState(() => initialPrefillName())
  const [sheetUrl, setSheetUrl] = useState('')
  const [proposals, setProposals] = useState<SpecSheetProposal[] | null>(null)
  const [state, setState] = useState<
    'idle' | 'extracting' | 'success' | 'not_configured' | 'blocked' | 'no_proposals' | 'error'
  >('idle')
  const [blockInfo, setBlockInfo] = useState<{ url: string; reason: string } | null>(null)
  const [noProposalsInfo, setNoProposalsInfo] = useState<{ url: string; reason: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // u2geom: the person's manual geometry declarations — the EXACT fields the
  // schema declares, every value seeded to '' (no defaults, no invented values)
  const [manualGeometry, setManualGeometry] = useState<Record<string, string>>(() =>
    Object.fromEntries(MANUAL_GEOMETRY_FIELDS.map((f) => [f.targetField, ''])),
  )
  // D3: freeze the extraction URL at extraction time
  const [extractedFromUrl, setExtractedFromUrl] = useState<string | null>(null)
  // u3anchor — the ontology anchor: the EXISTING resolve spine (same
  // useMaterialSearch the materials create surface uses; consumed, not forked).
  // The hook owns the query state; the input binds to it. Set ONLY by an
  // explicit row click — no autopick of the first result
  // (LabMaterialNewPage precedent; D8 ghost-first).
  const { query, setQuery, ontologyResults, loadingOntology, error: ontologyError, searchOntology } = useMaterialSearch()
  const [ontologyRef, setOntologyRef] = useState<OntologyRef | null>(null)

  // u2geom — each NON-EMPTY manual entry becomes a SpecSheetProposal-shaped row
  // (data, not a second builder) so it enters the SAME buildPayloadFromProposals
  // loop: one mapping path, one coercion site. A blank entry produces no row,
  // hence no key in the payload.
  const manualRows: SpecSheetProposal[] = MANUAL_GEOMETRY_FIELDS.flatMap((f) => {
    const value = (manualGeometry[f.targetField] ?? '').trim()
    return value === ''
      ? []
      : [{ targetField: f.targetField, value, sourceUrl: '', passage: '', specId: 'manual-geometry' }]
  })
  const extractedRows: SpecSheetProposal[] = proposals ?? []
  // One last-writer-wins loop downstream: extracted rows first, manual rows
  // after — a field the person typed keeps their value; nothing is deleted.
  const allProposals: SpecSheetProposal[] = [...extractedRows, ...manualRows]
  const mergedSaveReady: boolean = allProposals.length > 0

  const handleExtract = async () => {
    if (!sheetUrl.trim()) return
    setState('extracting')
    setProposals(null)
    setExtractedFromUrl(null)
    setBlockInfo(null)
    setNoProposalsInfo(null)
    setErrorMessage(null)
    const frozenUrl = sheetUrl.trim()
    try {
      const result = await apiClient.extractSpecSheetProposals({
        url: frozenUrl,
        recordKind: 'labware',
      })

      if (result.configured === false) {
        setState('not_configured')
        setProposals([])
        return
      }

      if ('blocked' in result) {
        setState('blocked')
        setBlockInfo(result.blocked)
        setProposals([])
        return
      }

      const resultAny = result as unknown
      if (
        typeof resultAny === 'object' &&
        resultAny !== null &&
        'noProposals' in resultAny
      ) {
        const rp = resultAny as { noProposals: { url: string; reason: string } }
        setState('no_proposals')
        setNoProposalsInfo(rp.noProposals)
        setProposals([])
        return
      }

      setState('success')
      setProposals(result.proposals)
      setExtractedFromUrl(frozenUrl)
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSearchAnchor = () => {
    // A new search invalidates a stale pick: the person re-picks from the rows
    // that answer THIS query (no autopick, no carried-over first result).
    setOntologyRef(null)
    void searchOntology()
  }

  const handleSave = async () => {
    // u2geom: gate on the MERGED rows (extracted + manual) — a declaration with
    // no spec-sheet URL still commits; a wholly blank form does not.
    if (saving || !mergedSaveReady) return
    setSaving(true)
    try {
      const info = await apiClient.getSchema(LABWARE_DEFINITION_SCHEMA)
      const payload = buildPayloadFromProposals(allProposals, name.trim(), info.schema, extractedFromUrl ?? undefined, ontologyRef ?? undefined)
      // u3anchor: a labware definition without a declared ontology anchor is
      // refused by NAME before the POST — the same named-refusal discipline as
      // the required-field pre-flight beside it (Ajv stays the sole validator).
      // Never invent a value: the anchor exists only as the explicit term the
      // person picked from the resolve spine.
      if (!ontologyRef) {
        setErrorMessage('Cannot save: no ontology anchor chosen. Search for the labware term and pick the row that names it.')
        return
      }
      // Named refusal before the POST: Ajv on the server stays the sole validator,
      // but a payload that cannot satisfy the schema's required fields is refused
      // here by field name instead of round-tripping a 422.
      if (info.schema && typeof info.schema === 'object') {
        const invalid: string[] = []
        collectInvalidRequiredPaths(info.schema as Record<string, unknown>, payload, [], invalid)
        if (invalid.length > 0) {
          setErrorMessage(`Cannot save: missing or invalid: ${invalid.join(', ')}`)
          return
        }
      }
      await apiClient.createRecord(LABWARE_DEFINITION_SCHEMA, payload)
      navigate('/lab/labware')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell brand="Add a labware definition">
      <div style={{ padding: '1rem' }} data-testid="lab-labware-new-page">
        <h2>Add a labware definition</h2>
        <p>
          Enter a name and a spec-sheet URL, then propose fields from the sheet. Without a sheet,
          declare the geometry you know below — only fields you fill in are saved; blank fields
          are left out of the record.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            data-testid="lab-labware-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Labware name"
            style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)' }}
          />
          <input
            data-testid="lab-labware-url-input"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Spec-sheet URL"
            style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)' }}
          />
          <button
            type="button"
            data-testid="lab-labware-propose-button"
            onClick={() => void handleExtract()}
            disabled={!sheetUrl.trim() || state === 'extracting'}
            style={{ padding: '0.4rem 0.8rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)', cursor: 'pointer' }}
          >
            Propose fields
          </button>
        </div>

        {errorMessage && (
          <div data-testid="lab-labware-error" style={{ color: '#b00', marginBottom: '0.75rem' }}>
            {errorMessage}
          </div>
        )}

        {state === 'extracting' && (
          <div data-testid="lab-labware-extracting">Extracting proposals…</div>
        )}

        {state === 'not_configured' && (
          <div data-testid="lab-labware-not-configured">
            Spec-sheet extraction is not configured. No proposals can be generated.
          </div>
        )}

        {state === 'blocked' && blockInfo && (
          <div data-testid="lab-labware-blocked">
            <p>
              Fetch blocked for URL <code>{blockInfo.url}</code>: {blockInfo.reason}
            </p>
          </div>
        )}

        {state === 'no_proposals' && noProposalsInfo && (
          <div data-testid="lab-labware-no-proposals">
            <p>
              {noProposalsInfo.reason === 'empty_document'
                ? 'The document contained no extractable content.'
                : 'No fields on the sheet matched the labware extraction spec.'}
            </p>
            <p>URL: {noProposalsInfo.url}</p>
          </div>
        )}

        {/* u2geom — the manual geometry section. Always rendered: with or
            without an extraction, the person declares what they know here and
            blank entries stay out of the payload (never an invented value). */}
        <div
          data-testid="lab-labware-geometry"
          style={{ border: '1px solid var(--cl-border)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}
        >
          <h3 style={{ marginTop: 0 }}>Declare the geometry you know</h3>
          <p style={{ color: '#666', margin: '0.25rem 0 0.75rem', fontSize: '0.85rem' }}>
            No spec sheet, or the sheet did not state a field? Fill in only what you know.
            Blank fields are left out of the record.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            {MANUAL_GEOMETRY_FIELDS.map((field) => (
              <label
                key={field.testid}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}
              >
                {field.label}
                {field.kind === 'select' ? (
                  <select
                    data-testid={`lab-labware-geometry-${field.testid}`}
                    value={manualGeometry[field.targetField]}
                    onChange={(e) =>
                      setManualGeometry((m) => ({ ...m, [field.targetField]: e.target.value }))
                    }
                    style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)' }}
                  >
                    <option value="">—</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    data-testid={`lab-labware-geometry-${field.testid}`}
                    value={manualGeometry[field.targetField]}
                    onChange={(e) =>
                      setManualGeometry((m) => ({ ...m, [field.targetField]: e.target.value }))
                    }
                    style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)' }}
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* u3anchor — the ontology anchor. Rendered by the page route: search
            the EXISTING resolve spine, see namespace · curie — label per row,
            and pick ONE row. Nothing is picked without a click (D8 ghost-first);
            save refuses by name when no row was picked. */}
        <div
          data-testid="lab-labware-ontology"
          style={{ border: '1px solid var(--cl-border)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem' }}
        >
          <h3 style={{ marginTop: 0 }}>Ontology anchor</h3>
          <p style={{ color: '#666', margin: '0.25rem 0 0.75rem', fontSize: '0.85rem' }}>
            Pick the term that names this labware. The anchor is saved only for the row you pick —
            nothing is chosen without a click.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              data-testid="lab-labware-ontology-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAnchor() }}
              placeholder="Search ontology terms..."
              style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)' }}
            />
            <button
              type="button"
              data-testid="lab-labware-ontology-search-button"
              onClick={handleSearchAnchor}
              style={{ padding: '0.4rem 0.8rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)', cursor: 'pointer' }}
            >
              Search ontology
            </button>
          </div>
          {loadingOntology && <div>Searching ontologies…</div>}
          {ontologyError && <div style={{ color: '#b00' }}>{ontologyError}</div>}
          <ul data-testid="lab-labware-ontology-results" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {ontologyResults.map((candidate) => (
              <li key={`${candidate.source}-${candidate.curie}`}>
                <button
                  type="button"
                  data-testid="lab-labware-ontology-candidate"
                  onClick={() => setOntologyRef(ontologyRefFromCandidate(candidate))}
                  style={{ textAlign: 'left', width: '100%', padding: '0.5rem', margin: '0.25rem 0', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)', cursor: 'pointer' }}
                >
                  <span data-testid="lab-labware-ontology-namespace" style={{ fontWeight: 600 }}>{candidate.namespace}</span>
                  {' · '}{candidate.curie}{' — '}{candidate.label}
                </button>
              </li>
            ))}
          </ul>
          {ontologyRef ? (
            <div data-testid="lab-labware-ontology-anchor" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              <span style={{ fontWeight: 600 }}>{ontologyRef.namespace}</span>
              {' · '}{ontologyRef.id}{' — '}{ontologyRef.label}
            </div>
          ) : (
            <div data-testid="lab-labware-ontology-none" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
              No anchor picked yet.
            </div>
          )}
        </div>

        {/* u2geom — save affordance for the manual-declaration leg (no
            extraction, or extraction with no rows). The extracted-leg button
            lives with the proposals block; exactly one is rendered.
            L2-P1B-PRODUCT-IDENTITY-1: rendered in EVERY state of this leg —
            disabled with a visible one-line reason when nothing is declared,
            so a person always sees the control (and why it is idle) instead
            of a missing save button. It never invents a default payload:
            disabled means handleSave's mergedSaveReady gate returns early. */}
        {!(state === 'success' && proposals !== null && proposals.length > 0) && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              data-testid="lab-labware-save-button"
              onClick={() => void handleSave()}
              disabled={saving || !mergedSaveReady}
              style={{ padding: '0.4rem 0.8rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)', cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save labware definition'}
            </button>
            {!mergedSaveReady && (
              <div
                data-testid="lab-labware-save-disabled-reason"
                style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: '#666' }}
              >
                Nothing declared yet — enter a field below or propose fields from a spec sheet.
              </div>
            )}
          </div>
        )}

        {state === 'success' && proposals && proposals.length > 0 && (
          <div data-testid="lab-labware-proposals">
            <h3>Proposed fields</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.25rem' }}>Field</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem' }}>Value</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem' }}>Citation</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.targetField}>
                    <td style={{ padding: '0.25rem' }}>{proposal.targetField}</td>
                    <td style={{ padding: '0.25rem' }}>
                      {proposal.passage ? (
                        <span>{proposal.value}</span>
                      ) : null}
                    </td>
                    <td style={{ padding: '0.25rem', fontSize: '0.85rem' }}>
                      {proposal.passage ? (
                        <span data-testid={`citation-${proposal.targetField}`}>
                          {proposal.sourceUrl}: {proposal.passage}
                        </span>
                      ) : (
                        <span style={{ color: '#999' }}>No citation available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              type="button"
              data-testid="lab-labware-save-button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ padding: '0.4rem 0.8rem', border: '1px solid var(--cl-border)', borderRadius: '6px', background: 'var(--cl-bg-elev)', cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save labware definition'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
