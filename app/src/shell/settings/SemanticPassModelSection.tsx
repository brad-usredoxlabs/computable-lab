/**
 * SemanticPassModelSection — the /settings exposure of the ai.semanticPass
 * config block (W2-9 §3 R4, OQ3 ruling: the section binds the MERGED block's
 * keys ONLY — server/src/config/types.ts SemanticPassConfig + loader
 * validation — NEVER the active-profile activate route).
 *
 * The block is OPTIONAL with MISSING = fallback (the shadowRouter kill-switch
 * precedent, types.ts:180-189): with no block the semantic pass runs on the
 * active profile's inference. Every field merges OVER the profile, so naming
 * only `model` swaps the model and keeps the endpoint. Model/host/thinking are
 * DATA here — read from GET /api/config and written through PATCH /api/config
 * (configHandlers mergeConfigPatch: unrelated ai.* fields ride through
 * byte-preserved; a REDACTED placeholder preserves the stored secret).
 *
 * Honesty (spec §8 bait 9): this override changes the SEMANTIC PASS only —
 * chat, drafting, and every other surface keep following the active profile.
 * The section says exactly that; it never claims a fully distinct stack.
 * thinkingLevels is a structured map the pass consumes verbatim — this section
 * never sends it, so an existing map rides the PATCH untouched.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { REDACTED, type ConfigResponse } from '../../types/config'
import { EditRow, SecretRow, SelectRow } from './EditRow'

interface BlockView {
  baseUrl: string
  model: string
  apiKey: string
  maxTokens: string
  temperature: string
  enableThinking: '' | 'true' | 'false'
  defaultThinkingLevel: string
}

const EMPTY: BlockView = {
  baseUrl: '',
  model: '',
  apiKey: '',
  maxTokens: '',
  temperature: '',
  enableThinking: '',
  defaultThinkingLevel: '',
}

function blockFromConfig(config: ConfigResponse | null): Record<string, unknown> | null {
  const sp = (config?.ai as Record<string, unknown> | undefined)?.semanticPass
  return sp && typeof sp === 'object' && !Array.isArray(sp) ? (sp as Record<string, unknown>) : null
}

function viewFromBlock(block: Record<string, unknown> | null): BlockView {
  if (!block) return { ...EMPTY }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    baseUrl: str(block.baseUrl),
    model: str(block.model),
    apiKey: str(block.apiKey) === REDACTED ? '' : str(block.apiKey),
    maxTokens: typeof block.maxTokens === 'number' ? String(block.maxTokens) : '',
    temperature: typeof block.temperature === 'number' ? String(block.temperature) : '',
    enableThinking: typeof block.enableThinking === 'boolean' ? (block.enableThinking ? 'true' : 'false') : '',
    defaultThinkingLevel: str(block.defaultThinkingLevel),
  }
}

export function SemanticPassModelSection() {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState<BlockView>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getConfig()
      .then((c) => {
        if (cancelled) return
        setConfig(c)
        setView(viewFromBlock(blockFromConfig(c)))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load config')
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const block = blockFromConfig(config)
  const hasBlock = block !== null

  const setField = useCallback(<K extends keyof BlockView>(key: K, value: BlockView[K]) => {
    setView((prev) => ({ ...prev, [key]: value }))
  }, [])

  const startEdit = useCallback(() => {
    setView(viewFromBlock(blockFromConfig(config)))
    setEditing(true)
    setError(null)
    setNote(null)
  }, [config])

  /**
   * The PATCH body is the semanticPass subtree ONLY — never activeProfile,
   * never inference, never profiles. Empty inputs are OMITTED (the server
   * merge cannot delete a key; omitting leaves the stored value untouched).
   * A blank API key over an EXISTING stored key sends the REDACTED
   * placeholder, which mergeConfigPatch skips — the secret is preserved.
   */
  const buildPatchBody = useCallback((): { ai: { semanticPass: Record<string, unknown> } } => {
    const semanticPass: Record<string, unknown> = {}
    if (view.baseUrl.trim()) semanticPass.baseUrl = view.baseUrl.trim()
    if (view.model.trim()) semanticPass.model = view.model.trim()
    if (view.apiKey.trim()) semanticPass.apiKey = view.apiKey.trim()
    else if (blockFromConfig(config)?.apiKey !== undefined) semanticPass.apiKey = REDACTED
    if (view.maxTokens.trim() !== '') semanticPass.maxTokens = Number(view.maxTokens)
    if (view.temperature.trim() !== '') semanticPass.temperature = Number(view.temperature)
    if (view.enableThinking !== '') semanticPass.enableThinking = view.enableThinking === 'true'
    if (view.defaultThinkingLevel.trim()) semanticPass.defaultThinkingLevel = view.defaultThinkingLevel.trim()
    return { ai: { semanticPass } }
  }, [view, config])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const response = await apiClient.patchConfig(buildPatchBody())
      setConfig(response.config)
      setView(viewFromBlock(blockFromConfig(response.config)))
      setEditing(false)
      setNote('Saved. The next semantic pass uses this block (a running server picks it up on its next resolution).')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the semantic-pass model')
    } finally {
      setSaving(false)
    }
  }, [buildPatchBody])

  return (
    <div className="semantic-pass-model" data-testid="semantic-pass-model-section">
      <p className="semantic-pass-model__disclosure" data-testid="semantic-pass-disclosure">
        This override changes the semantic pass ONLY — chat, drafting, and every other surface keep following the active profile. The block is optional: with no override the pass follows the active profile's model.
      </p>

      {!loaded ? (
        <div className="info-row">
          <span className="info-row__value">Loading…</span>
        </div>
      ) : !hasBlock ? (
        <div className="info-row" data-testid="semantic-pass-fallback" role="status">
          <span className="info-row__label">Semantic-pass model</span>
          <span className="info-row__value">No override set — follows the active profile</span>
        </div>
      ) : (
        <div className="info-row" data-testid="semantic-pass-current" role="status">
          <span className="info-row__label">Semantic-pass override</span>
          <span className="info-row__value info-row__value--mono" data-testid="semantic-pass-current-model">
            {view.model || view.baseUrl || 'set (no model named)'}
          </span>
        </div>
      )}

      {!editing ? (
        <button type="button" data-testid="semantic-pass-edit" onClick={startEdit} disabled={!loaded}>
          {hasBlock ? 'Edit override' : 'Set override'}
        </button>
      ) : (
        <div className="semantic-pass-model__editor">
          <EditRow label="Base URL" value={view.baseUrl} onChange={(v) => setField('baseUrl', v)} placeholder="https://provider.example/v1" mono />
          <EditRow label="Model" value={view.model} onChange={(v) => setField('model', v)} placeholder="model-name" mono />
          <SecretRow label="API key" value={view.apiKey} onChange={(v) => setField('apiKey', v)} />
          <EditRow label="Max tokens" value={view.maxTokens} onChange={(v) => setField('maxTokens', v)} type="number" />
          <EditRow label="Temperature" value={view.temperature} onChange={(v) => setField('temperature', v)} type="number" />
          <SelectRow
            label="Enable thinking"
            value={view.enableThinking}
            onChange={(v) => setField('enableThinking', (v === 'true' || v === 'false' ? v : '') as BlockView['enableThinking'])}
            options={[
              { value: '', label: 'Not set (profile default)' },
              { value: 'true', label: 'On' },
              { value: 'false', label: 'Off' },
            ]}
          />
          <EditRow label="Default thinking level" value={view.defaultThinkingLevel} onChange={(v) => setField('defaultThinkingLevel', v)} placeholder="low" mono />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" data-testid="semantic-pass-save" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save override'}
            </button>
            <button type="button" data-testid="semantic-pass-cancel" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {note ? (
        <div className="info-row" data-testid="semantic-pass-note" role="status">
          <span className="info-row__value">{note}</span>
        </div>
      ) : null}
      {error ? (
        <div className="info-row" data-testid="semantic-pass-error" role="alert">
          <span className="info-row__value" style={{ color: 'var(--cl-danger)' }}>{error}</span>
        </div>
      ) : null}
    </div>
  )
}
