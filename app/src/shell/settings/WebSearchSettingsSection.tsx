import { useCallback, useState } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { CheckboxRow, EditRow, InfoRow, SecretDisplay, SecretRow, SelectRow, resolveSecret } from './EditRow'
import type { ExaConfig, ExaContentMode, ExaSearchType, IntegrationsConfig } from '../../types/config'
import { REDACTED } from '../../types/config'

const DEFAULT_BASE_URL = 'https://api.exa.ai'

const SEARCH_TYPE_OPTIONS: Array<{ value: ExaSearchType; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'fast', label: 'Fast' },
  { value: 'instant', label: 'Instant' },
  { value: 'deep', label: 'Deep' },
  { value: 'deep-reasoning', label: 'Deep reasoning' },
]

const CONTENT_MODE_OPTIONS: Array<{ value: ExaContentMode; label: string }> = [
  { value: 'highlights', label: 'Highlights' },
  { value: 'text', label: 'Full text' },
  { value: 'summary', label: 'Summary' },
]

interface Props {
  integrations: IntegrationsConfig | null
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

function getExaConfig(integrations: IntegrationsConfig | null): ExaConfig | null {
  return integrations?.exa ?? null
}

export function WebSearchSettingsSection({ integrations, editingSection, onEditChange, onSave, saving }: Props) {
  const exa = getExaConfig(integrations)
  const apiKeyConfigured = exa?.apiKey === REDACTED
  const [enabled, setEnabled] = useState(exa?.enabled ?? false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(exa?.baseUrl ?? DEFAULT_BASE_URL)
  const [defaultSearchType, setDefaultSearchType] = useState<ExaSearchType>(exa?.defaultSearchType ?? 'auto')
  const [defaultContentMode, setDefaultContentMode] = useState<ExaContentMode>(exa?.defaultContentMode ?? 'highlights')
  const [defaultMaxCharacters, setDefaultMaxCharacters] = useState(String(exa?.defaultMaxCharacters ?? 4000))
  const [userLocation, setUserLocation] = useState(exa?.userLocation ?? 'US')
  const [timeoutMs, setTimeoutMs] = useState(String(exa?.timeoutMs ?? 20000))

  const resetForm = useCallback(() => {
    const next = getExaConfig(integrations)
    setEnabled(next?.enabled ?? false)
    setApiKey('')
    setBaseUrl(next?.baseUrl ?? DEFAULT_BASE_URL)
    setDefaultSearchType(next?.defaultSearchType ?? 'auto')
    setDefaultContentMode(next?.defaultContentMode ?? 'highlights')
    setDefaultMaxCharacters(String(next?.defaultMaxCharacters ?? 4000))
    setUserLocation(next?.userLocation ?? 'US')
    setTimeoutMs(String(next?.timeoutMs ?? 20000))
  }, [integrations])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'web-search') resetForm()
    onEditChange(id)
  }, [onEditChange, resetForm])

  const handleSave = useCallback(async () => {
    if (enabled && !apiKeyConfigured && apiKey.trim() === '') {
      throw new Error('API Key is required when enabling Exa web search.')
    }

    return onSave({
      integrations: {
        exa: {
          enabled,
          apiKey: resolveSecret(apiKey),
          baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
          defaultSearchType,
          defaultContentMode,
          defaultMaxCharacters: parseInt(defaultMaxCharacters, 10) || 4000,
          userLocation: userLocation.trim() || 'US',
          timeoutMs: parseInt(timeoutMs, 10) || 20000,
        },
      },
    })
  }, [
    apiKey,
    apiKeyConfigured,
    baseUrl,
    defaultContentMode,
    defaultMaxCharacters,
    defaultSearchType,
    enabled,
    onSave,
    timeoutMs,
    userLocation,
  ])

  return (
    <EditableSection
      id="web-search"
      title="Web Search"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <>
          <InfoRow label="Provider" value="Exa" />
          <InfoRow label="Enabled" value={enabled ? 'Yes' : 'No'} />
          <InfoRow label="Base URL" value={baseUrl} mono />
          <SecretDisplay label="API Key" configured={apiKeyConfigured} />
          <InfoRow label="Default Search Type" value={SEARCH_TYPE_OPTIONS.find((option) => option.value === defaultSearchType)?.label ?? defaultSearchType} />
          <InfoRow label="Default Content Mode" value={CONTENT_MODE_OPTIONS.find((option) => option.value === defaultContentMode)?.label ?? defaultContentMode} />
          <InfoRow label="Default Max Characters" value={defaultMaxCharacters} />
          <InfoRow label="User Location" value={userLocation || '—'} mono />
          <InfoRow label="Timeout" value={`${timeoutMs}ms`} />
        </>
      }
      editContent={
        <>
          <CheckboxRow label="Enable Exa Web Search" checked={enabled} onChange={setEnabled} />
          <SecretRow label="API Key" value={apiKey} onChange={setApiKey} />
          <EditRow label="Base URL" value={baseUrl} onChange={setBaseUrl} mono placeholder={DEFAULT_BASE_URL} />
          <SelectRow
            label="Default Search Type"
            value={defaultSearchType}
            onChange={(value) => setDefaultSearchType(value as ExaSearchType)}
            options={SEARCH_TYPE_OPTIONS}
          />
          <SelectRow
            label="Default Content Mode"
            value={defaultContentMode}
            onChange={(value) => setDefaultContentMode(value as ExaContentMode)}
            options={CONTENT_MODE_OPTIONS}
          />
          <EditRow
            label="Default Max Characters"
            value={defaultMaxCharacters}
            onChange={setDefaultMaxCharacters}
            type="number"
            placeholder="4000"
          />
          <EditRow
            label="User Location"
            value={userLocation}
            onChange={setUserLocation}
            mono
            placeholder="US"
          />
          <EditRow
            label="Timeout (ms)"
            value={timeoutMs}
            onChange={setTimeoutMs}
            type="number"
            placeholder="20000"
          />
        </>
      }
    />
  )
}
