/**
 * ExtractorSettingsSection — Editable extractor profile configuration.
 *
 * Allows users to configure the AI-powered extraction backend settings.
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SecretRow, SecretDisplay, resolveSecret, SelectRow, CheckboxRow, InfoRow } from './EditRow'
import type { ExtractorProfileConfig } from '../../types/config'

interface Props {
  extractor: ExtractorProfileConfig | null
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
] as const

const PROVIDER_DEFAULTS: Record<'openai' | 'openai-compatible', { baseUrl: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1' },
  'openai-compatible': { baseUrl: 'http://thunderbeast:8889/v1' },
}

function inferProvider(extractor: ExtractorProfileConfig | null | undefined): 'openai' | 'openai-compatible' {
  if (!extractor) return 'openai-compatible'
  if (extractor.provider === 'openai' || extractor.provider === 'openai-compatible') return extractor.provider
  return extractor.baseUrl.includes('api.openai.com') ? 'openai' : 'openai-compatible'
}

const FEEDBACK_COLORS = {
  success: { bg: '#d3f9d8', text: '#2b8a3e', border: '#b2f2bb' },
  error: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffc9c9' },
  restart: { bg: '#fff3bf', text: '#e67700', border: '#ffe066' },
  info: { bg: '#e7f5ff', text: '#1864ab', border: '#a5d8ff' },
}

export function ExtractorSettingsSection({ extractor, editingSection, onEditChange, onSave, saving }: Props) {
  // Extractor fields
  const [enabled, setEnabled] = useState(extractor?.enabled ?? false)
  const [provider, setProvider] = useState<'openai' | 'openai-compatible'>(inferProvider(extractor))
  const [baseUrl, setBaseUrl] = useState(extractor?.baseUrl ?? PROVIDER_DEFAULTS['openai-compatible'].baseUrl)
  const [model, setModel] = useState(extractor?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(String(extractor?.temperature ?? 0.0))
  const [maxTokens, setMaxTokens] = useState(String(extractor?.max_tokens ?? 2048))

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'restart' | 'info'; message: string } | null>(null)

  const resetForm = useCallback(() => {
    const inferredProvider = inferProvider(extractor)
    setEnabled(extractor?.enabled ?? false)
    setProvider(inferredProvider)
    setBaseUrl(extractor?.baseUrl ?? PROVIDER_DEFAULTS[inferredProvider].baseUrl)
    setModel(extractor?.model ?? '')
    setApiKey('')
    setTemperature(String(extractor?.temperature ?? 0.0))
    setMaxTokens(String(extractor?.max_tokens ?? 2048))
    setFeedback(null)
  }, [extractor])

  const handleProviderChange = useCallback((next: string) => {
    const p = next === 'openai' ? 'openai' : 'openai-compatible'
    setProvider(p)
    setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl)
  }, [])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'extractor') {
      resetForm()
    }
    onEditChange(id)
  }, [resetForm, onEditChange])

  const saveValidated = useCallback(async (): Promise<{ ok: boolean; restartRequired?: boolean }> => {
    if (!baseUrl.trim()) {
      setFeedback({ type: 'error', message: 'Base URL is required' })
      return { ok: false }
    }

    if (!model.trim()) {
      setFeedback({ type: 'error', message: 'Model is required' })
      return { ok: false }
    }

    const temp = parseFloat(temperature)
    if (isNaN(temp) || temp < 0 || temp > 2) {
      setFeedback({ type: 'error', message: 'Temperature must be between 0 and 2' })
      return { ok: false }
    }

    const tokens = parseInt(maxTokens, 10)
    if (isNaN(tokens) || tokens < 1) {
      setFeedback({ type: 'error', message: 'Max tokens must be at least 1' })
      return { ok: false }
    }

    const result = await onSave(
      {
        ai: {
          extractor: {
            enabled,
            provider,
            baseUrl: baseUrl.trim(),
            apiKey: resolveSecret(apiKey),
            model: model.trim(),
            temperature: temp,
            max_tokens: tokens,
          },
        },
      },
    )

    if (result.restartRequired) {
      setFeedback({ type: 'restart', message: 'Extractor configuration saved. Restart required.' })
    } else {
      setFeedback({ type: 'success', message: 'Extractor configuration saved and activated.' })
    }
    return { ok: true, restartRequired: result.restartRequired }
  }, [onSave, enabled, provider, baseUrl, model, apiKey, temperature, maxTokens])

  const handleSave = useCallback(async () => {
    await saveValidated()
    return { restartRequired: false }
  }, [saveValidated])

  const apiKeyConfigured = extractor?.apiKey !== undefined && extractor?.apiKey !== ''
  const isBusy = saving

  // Read mode content
  const readContent = (
    <>
      {feedback && (
        <div
          style={{
            background: FEEDBACK_COLORS[feedback.type].bg,
            color: FEEDBACK_COLORS[feedback.type].text,
            border: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
            borderRadius: '4px',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem',
          }}
        >
          {feedback.message}
          <button
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}
            onClick={() => setFeedback(null)}
          >
            ×
          </button>
        </div>
      )}
      <CheckboxRow label="Enabled" checked={enabled} onChange={setEnabled} disabled={true} />
      <InfoRow label="Provider" value={provider} />
      <InfoRow label="Base URL" value={baseUrl} mono />
      <SecretDisplay label="API Key" configured={apiKeyConfigured} />
      <InfoRow label="Model" value={model} mono />
      <InfoRow label="Temperature" value={extractor?.temperature ?? 0.0} />
      <InfoRow label="Max Tokens" value={extractor?.max_tokens ?? 2048} />
    </>
  )

  // Edit mode content
  const editContent = (
    <>
      {feedback && (
        <div
          style={{
            background: FEEDBACK_COLORS[feedback.type].bg,
            color: FEEDBACK_COLORS[feedback.type].text,
            border: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
            borderRadius: '4px',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem',
          }}
        >
          {feedback.message}
          <button
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}
            onClick={() => setFeedback(null)}
          >
            ×
          </button>
        </div>
      )}
      <CheckboxRow label="Enabled" checked={enabled} onChange={setEnabled} />
      <SelectRow
        label="Provider"
        value={provider}
        onChange={handleProviderChange}
        options={PROVIDER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
      <EditRow label="Base URL" value={baseUrl} onChange={setBaseUrl} mono placeholder="http://thunderbeast:8889/v1" />
      <SecretRow label="API Key" value={apiKey} onChange={setApiKey} />
      <EditRow label="Model" value={model} onChange={setModel} mono placeholder="Qwen/Qwen3.5-9B-Instruct" />
      <EditRow
        label="Temperature"
        value={temperature}
        onChange={setTemperature}
        type="number"
        placeholder="0.0"
      />
      <EditRow
        label="Max Tokens"
        value={maxTokens}
        onChange={setMaxTokens}
        type="number"
        placeholder="2048"
      />
    </>
  )

  return (
    <EditableSection
      id="extractor"
      title="Extractor Settings"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={isBusy}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={readContent}
      editContent={editContent}
    />
  )
}


