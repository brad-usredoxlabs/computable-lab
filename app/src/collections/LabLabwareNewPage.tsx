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

const LABWARE_DEFINITION_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'

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
 */
function buildPayloadFromProposals(
  proposals: SpecSheetProposal[],
  displayName: string,
  schema?: Record<string, unknown>,
  extractedUrl?: string
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
  const provenanceUrl = proposals[0]?.sourceUrl ?? extractedUrl
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

  for (const p of proposals) {
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
        }
      }
    }
    current[leafKey] = value
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

export function LabLabwareNewPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [proposals, setProposals] = useState<SpecSheetProposal[] | null>(null)
  const [state, setState] = useState<
    'idle' | 'extracting' | 'success' | 'not_configured' | 'blocked' | 'no_proposals' | 'error'
  >('idle')
  const [blockInfo, setBlockInfo] = useState<{ url: string; reason: string } | null>(null)
  const [noProposalsInfo, setNoProposalsInfo] = useState<{ url: string; reason: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // D3: freeze the extraction URL at extraction time
  const [extractedFromUrl, setExtractedFromUrl] = useState<string | null>(null)

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

  const handleSave = async () => {
    if (saving || !proposals || proposals.length === 0) return
    setSaving(true)
    try {
      const info = await apiClient.getSchema(LABWARE_DEFINITION_SCHEMA)
      const payload = buildPayloadFromProposals(proposals, name.trim(), info.schema, extractedFromUrl ?? undefined)
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
          Enter a name and a spec-sheet URL, then propose fields from the sheet.
          Only fields extracted from the sheet will be saved.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            data-testid="lab-labware-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Labware name"
            style={{ padding: '0.4rem 0.6rem' }}
          />
          <input
            data-testid="lab-labware-url-input"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Spec-sheet URL"
            style={{ padding: '0.4rem 0.6rem' }}
          />
          <button
            type="button"
            data-testid="lab-labware-propose-button"
            onClick={() => void handleExtract()}
            disabled={!sheetUrl.trim() || state === 'extracting'}
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
                  <tr key={proposal.specId}>
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
            >
              {saving ? 'Saving…' : 'Save labware definition'}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
