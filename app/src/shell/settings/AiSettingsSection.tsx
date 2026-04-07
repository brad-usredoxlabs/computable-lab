/**
 * AiSettingsSection — Editable AI inference & agent configuration.
 *
 * Adds provider presets + connection testing/model discovery so AI settings
 * are validated before save.
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SecretRow, SecretDisplay, InfoRow, resolveSecret, SelectRow } from './EditRow'
import type { AIConfig, AiRuntimeStatus, AiConnectionTestResponse, InferenceConfig } from '../../types/config'
import { REDACTED } from '../../types/config'

interface Props {
  ai: AIConfig | null
  aiStatus: AiRuntimeStatus | null
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  onTest: (req: {
    provider?: 'openai' | 'openai-compatible'
    baseUrl: string
    apiKey?: string
    model?: string
  }) => Promise<AiConnectionTestResponse>
  saving: boolean
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
] as const

const PROVIDER_DEFAULTS: Record<'openai' | 'openai-compatible', { baseUrl: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1' },
  'openai-compatible': { baseUrl: 'http://localhost:8000/v1' },
}

/** Build the PATCH payload from form state. */
function buildAiPatch(
  provider: 'openai' | 'openai-compatible',
  baseUrl: string,
  model: string,
  apiKey: string,
  timeoutMs: string,
  maxTokens: string,
  temperature: string,
  maxTurns: string,
  maxToolCalls: string,
) {
  return {
    ai: {
      inference: {
        provider,
        baseUrl,
        model,
        apiKey: resolveSecret(apiKey),
        timeoutMs: parseInt(timeoutMs, 10) || 120000,
        maxTokens: parseInt(maxTokens, 10) || 4096,
        temperature: parseFloat(temperature) || 0.1,
      },
      agent: {
        maxTurns: parseInt(maxTurns, 10) || 15,
        maxToolCallsPerTurn: parseInt(maxToolCalls, 10) || 5,
      },
    },
  }
}

function inferProvider(inference: InferenceConfig | null | undefined): 'openai' | 'openai-compatible' {
  if (!inference) return 'openai'
  if (inference.provider === 'openai' || inference.provider === 'openai-compatible') return inference.provider
  return inference.baseUrl.includes('api.openai.com') ? 'openai' : 'openai-compatible'
}

const FEEDBACK_COLORS = {
  success: { bg: '#d3f9d8', text: '#2b8a3e', border: '#b2f2bb' },
  error: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffc9c9' },
  restart: { bg: '#fff3bf', text: '#e67700', border: '#ffe066' },
  info: { bg: '#e7f5ff', text: '#1864ab', border: '#a5d8ff' },
}

export function AiSettingsSection({ ai, aiStatus, editingSection, onEditChange, onSave, onTest, saving }: Props) {
  // Inference fields
  const [provider, setProvider] = useState<'openai' | 'openai-compatible'>(inferProvider(ai?.inference))
  const [baseUrl, setBaseUrl] = useState(ai?.inference.baseUrl ?? PROVIDER_DEFAULTS.openai.baseUrl)
  const [model, setModel] = useState(ai?.inference.model ?? '')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [timeoutMs, setTimeoutMs] = useState(String(ai?.inference.timeoutMs ?? 120000))
  const [maxTokens, setMaxTokens] = useState(String(ai?.inference.maxTokens ?? 4096))
  const [temperature, setTemperature] = useState(String(ai?.inference.temperature ?? 0.1))

  // Agent fields
  const [maxTurns, setMaxTurns] = useState(String(ai?.agent?.maxTurns ?? 15))
  const [maxToolCalls, setMaxToolCalls] = useState(String(ai?.agent?.maxToolCallsPerTurn ?? 5))

  // Add-mode state (when ai is null)
  const [addOpen, setAddOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'restart' | 'info'; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [modelOptions, setModelOptions] = useState<string[]>([])

  const resetForm = useCallback(() => {
    const inferredProvider = inferProvider(ai?.inference)
    setProvider(inferredProvider)
    setBaseUrl(ai?.inference.baseUrl ?? PROVIDER_DEFAULTS[inferredProvider].baseUrl)
    setModel(ai?.inference.model ?? '')
    setCustomModel('')
    setApiKey('')
    setTimeoutMs(String(ai?.inference.timeoutMs ?? 120000))
    setMaxTokens(String(ai?.inference.maxTokens ?? 4096))
    setTemperature(String(ai?.inference.temperature ?? 0.1))
    setMaxTurns(String(ai?.agent?.maxTurns ?? 15))
    setMaxToolCalls(String(ai?.agent?.maxToolCallsPerTurn ?? 5))
    setModelOptions([])
  }, [ai])

  const handleProviderChange = useCallback((next: string) => {
    const p = next === 'openai' ? 'openai' : 'openai-compatible'
    setProvider(p)
    setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl)
  }, [])

  const testConnection = useCallback(async () => {
    if (!baseUrl.trim()) {
      setFeedback({ type: 'error', message: 'Base URL is required' })
      return null
    }

    setTesting(true)
    setFeedback(null)
    try {
      const resolvedModel = (model === '__custom__' ? customModel : model).trim()
      const result = await onTest({
        provider,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: resolvedModel || undefined,
      })

      setModelOptions(result.models)
      if (result.available) {
        if (resolvedModel && result.modelWarning) {
          setFeedback({ type: 'info', message: `Connected. ${result.modelWarning}` })
        } else {
          setFeedback({ type: 'success', message: `Connected. ${result.models.length} model(s) available.` })
        }
      } else {
        setFeedback({ type: 'error', message: result.error || 'Connection test failed.' })
      }
      return result
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Connection test failed.' })
      return null
    } finally {
      setTesting(false)
    }
  }, [onTest, provider, baseUrl, apiKey, model, customModel])

  const saveValidated = useCallback(async () => {
    if (!baseUrl.trim()) {
      setFeedback({ type: 'error', message: 'Base URL is required' })
      return { ok: false }
    }
    const resolvedModel = (model === '__custom__' ? customModel : model).trim()
    if (!resolvedModel) {
      setFeedback({ type: 'error', message: 'Model is required' })
      return { ok: false }
    }

    const probe = await testConnection()
    if (!probe?.available) {
      return { ok: false }
    }

    const result = await onSave(
      buildAiPatch(
        provider,
        baseUrl.trim(),
        (model === '__custom__' ? customModel : model).trim(),
        apiKey,
        timeoutMs,
        maxTokens,
        temperature,
        maxTurns,
        maxToolCalls,
      ),
    )

    if (result.restartRequired) {
      setFeedback({ type: 'restart', message: 'AI configuration saved. Restart required.' })
    } else {
      setFeedback({ type: 'success', message: 'AI configuration saved and activated.' })
    }
    return { ok: true, restartRequired: result.restartRequired }
  }, [onSave, provider, baseUrl, model, customModel, apiKey, timeoutMs, maxTokens, temperature, maxTurns, maxToolCalls, testConnection])

  const handleSave = useCallback(async () => {
    await saveValidated()
    return { restartRequired: false }
  }, [saveValidated])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'ai') {
      resetForm()
      setFeedback(null)
    }
    onEditChange(id)
  }, [resetForm, onEditChange])

  const handleAddSave = useCallback(async () => {
    const result = await saveValidated()
    if (result.ok) {
      setAddOpen(false)
    }
  }, [saveValidated])

  const apiKeyConfigured = ai?.inference.apiKey === REDACTED
  const isBusy = saving || testing

  const formFields = (
    <>
      <SelectRow
        label="Provider"
        value={provider}
        onChange={handleProviderChange}
        options={PROVIDER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
      <EditRow label="Base URL" value={baseUrl} onChange={setBaseUrl} mono placeholder="https://api.openai.com/v1" />
      {modelOptions.length > 0 ? (
        <SelectRow
          label="Model"
          value={model}
          onChange={setModel}
          options={[
            ...(model && model !== '__custom__' && !modelOptions.includes(model)
              ? [{ value: model, label: `${model} (current)` }]
              : []),
            ...modelOptions.map((m) => ({ value: m, label: m })),
            { value: '__custom__', label: 'Custom model...' },
          ]}
        />
      ) : (
        <EditRow label="Model" value={model} onChange={setModel} mono placeholder="gpt-5.2" />
      )}
      {model === '__custom__' && (
        <EditRow label="Custom Model" value={customModel} onChange={setCustomModel} mono placeholder="custom-model-id" />
      )}
      <SecretRow label="API Key" value={apiKey} onChange={setApiKey} />
      <div className="settings-ai-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => { void testConnection() }}
          disabled={isBusy}
        >
          {testing ? 'Testing...' : 'Test & Fetch Models'}
        </button>
      </div>
      <EditRow label="Timeout (ms)" value={timeoutMs} onChange={setTimeoutMs} type="number" />
      <EditRow label="Max Tokens" value={maxTokens} onChange={setMaxTokens} type="number" />
      <EditRow label="Temperature" value={temperature} onChange={setTemperature} type="number" />
      <EditRow label="Max Turns" value={maxTurns} onChange={setMaxTurns} type="number" />
      <EditRow label="Max Tool Calls" value={maxToolCalls} onChange={setMaxToolCalls} type="number" />
    </>
  )

  // --- No AI configured: show add form ---
  if (!ai) {
    return (
      <div className="settings-section">
        <div className="settings-section__header">
          <h2>AI Assistant</h2>
          {!addOpen && (
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              onClick={() => { setAddOpen(true); setFeedback(null); resetForm() }}
              disabled={editingSection !== null}
              title={editingSection !== null ? 'Finish editing the other section first' : 'Configure AI'}
            >
              + Configure AI
            </button>
          )}
        </div>

        {feedback && (
          <div
            className="feedback-banner"
            style={{
              background: FEEDBACK_COLORS[feedback.type].bg,
              color: FEEDBACK_COLORS[feedback.type].text,
              borderBottom: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
            }}
          >
            {feedback.message}
            <button className="feedback-banner__dismiss" onClick={() => setFeedback(null)}>×</button>
          </div>
        )}

        <div className="settings-section__content">
          {!addOpen ? (
            <div className="not-configured">
              <p>AI is not configured. Add provider, model, and API key.</p>
            </div>
          ) : (
            formFields
          )}
        </div>

        {addOpen && (
          <div className="settings-section__footer">
            <button className="btn btn-primary" onClick={() => { void handleAddSave() }} disabled={isBusy}>
              {saving ? 'Saving...' : 'Save AI Config'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setAddOpen(false); resetForm(); setFeedback(null) }} disabled={isBusy}>
              Cancel
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- AI configured: show editable section ---
  return (
    <>
      {feedback && (
        <div
          className="feedback-banner"
          style={{
            background: FEEDBACK_COLORS[feedback.type].bg,
            color: FEEDBACK_COLORS[feedback.type].text,
            borderBottom: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
          }}
        >
          {feedback.message}
          <button className="feedback-banner__dismiss" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}
      <EditableSection
        id="ai"
        title="AI Assistant"
        editingSection={editingSection}
        onEditChange={handleEdit}
        saving={isBusy}
        onSave={handleSave}
        onCancel={resetForm}
        readContent={
          <>
            <InfoRow label="Provider" value={ai.inference.provider ?? inferProvider(ai.inference)} />
            <InfoRow label="Base URL" value={ai.inference.baseUrl} mono />
            <InfoRow label="Model" value={ai.inference.model} mono />
            <SecretDisplay label="API Key" configured={apiKeyConfigured} />
            <InfoRow
              label="Runtime"
              value={aiStatus?.available ? 'Available' : (aiStatus?.error ? `Unavailable: ${aiStatus.error}` : 'Unavailable')}
            />
            <InfoRow label="Timeout" value={`${ai.inference.timeoutMs ?? 120000}ms`} />
            <InfoRow label="Max Tokens" value={ai.inference.maxTokens ?? 4096} />
            <InfoRow label="Temperature" value={ai.inference.temperature ?? 0.1} />
            <InfoRow label="Max Turns" value={ai.agent.maxTurns ?? 15} />
            <InfoRow label="Max Tool Calls" value={ai.agent.maxToolCallsPerTurn ?? 5} />
          </>
        }
        editContent={formFields}
      />
      <style>{`
        .settings-ai-actions {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.5rem;
        }

        .feedback-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          font-size: 0.85rem;
        }

        .feedback-banner__dismiss {
          border: none;
          background: transparent;
          cursor: pointer;
          color: inherit;
          font-size: 1rem;
          line-height: 1;
        }
      `}</style>
    </>
  )
}
