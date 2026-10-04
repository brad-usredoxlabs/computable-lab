/**
 * AiModelSection — the ONE place the model is chosen.
 *
 * The model used to be a pulldown inside the AI chat (event editor and /chat)
 * and a thinking selector inside the ingestion workflow. That is three places to
 * get wrong, and it produced exactly that: a chat switched to one profile while
 * the ingestion still used another, and an error about a thinking level the
 * configured model never offered. The model is a deployment setting, so it lives
 * here: pick a profile, TEST it against the endpoint it names, then activate it.
 * Every surface — chat, the event editor, ingestion, extraction, compile —
 * follows the active profile.
 *
 * A profile is just "an OpenAI-compatible endpoint + model + optional key", so
 * the same editor points at a local vLLM box or a hosted router such as
 * OpenRouter (https://openrouter.ai/api/v1). "Test & fetch models" reads the
 * endpoint's /models list, so the model is chosen from what the provider
 * actually serves instead of being typed from memory.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { EditRow, SecretRow, SelectRow } from './EditRow'
import type { AiConnectionTestResponse } from '../../types/config'

interface Profile {
  name: string
  provider: string
  baseUrl: string
  model: string
  active: boolean
  hasApiKey?: boolean
  inference?: Record<string, unknown>
}

interface EditorState {
  mode: 'create' | 'edit'
  name: string
  /** The profile's existing inference block, secrets redacted — round-tripped. */
  inference: Record<string, unknown>
}

const PROVIDER_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI-compatible (vLLM / Ollama / OpenRouter)' },
  { value: 'openai', label: 'OpenAI' },
]

/**
 * OpenRouter is a fixed endpoint — one key, hundreds of models. It is offered
 * as a named choice so the URL is never typed (or mistyped) by hand; it stays
 * an openai-compatible provider, which is what it actually is.
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

type EndpointKind = 'openrouter' | 'custom'

const ENDPOINT_OPTIONS = [
  { value: 'openrouter', label: `OpenRouter (${OPENROUTER_BASE_URL})` },
  { value: 'custom', label: 'Custom OpenAI-compatible endpoint' },
]

const CUSTOM_MODEL = '__custom__'

export function AiModelSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activating, setActivating] = useState(false)
  const [test, setTest] = useState<AiConnectionTestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // -- Profile editor ------------------------------------------------------
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<'openai' | 'openai-compatible'>('openai-compatible')
  const [endpointKind, setEndpointKind] = useState<EndpointKind>('openrouter')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [editorNote, setEditorNote] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.listAiProfiles()
      setProfiles(res.profiles)
      setActiveProfile(res.activeProfile)
      setSelected((current) => current || res.activeProfile || res.profiles[0]?.name || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the AI profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const profile = profiles.find((p) => p.name === selected)
  const resolvedModel = (model === CUSTOM_MODEL ? customModel : model).trim()
  const editorBusy = savingProfile || fetchingModels
  /** The URL that will actually be contacted / saved. */
  const effectiveBaseUrl = endpointKind === 'openrouter' ? OPENROUTER_BASE_URL : baseUrl.trim()

  const openCreate = useCallback(() => {
    setEditor({ mode: 'create', name: '', inference: {} })
    setName('')
    setProvider('openai-compatible')
    setEndpointKind('openrouter')
    setBaseUrl('')
    setApiKey('')
    setModel('')
    setCustomModel('')
    setModelOptions([])
    setEditorNote(null)
    setEditorError(null)
  }, [])

  const openEdit = useCallback(() => {
    if (!profile) return
    setEditor({ mode: 'edit', name: profile.name, inference: { ...(profile.inference ?? {}) } })
    setName(profile.name)
    setProvider(profile.provider === 'openai' ? 'openai' : 'openai-compatible')
    setEndpointKind(profile.baseUrl === OPENROUTER_BASE_URL ? 'openrouter' : 'custom')
    setBaseUrl(profile.baseUrl)
    setApiKey('')
    setModel(profile.model)
    setCustomModel('')
    setModelOptions([])
    setEditorNote(
      profile.hasApiKey
        ? 'A key is stored for this profile. Leave the field blank to keep it.'
        : 'No API key stored for this profile.',
    )
    setEditorError(null)
  }, [profile])

  const closeEditor = useCallback(() => {
    setEditor(null)
    setEditorNote(null)
    setEditorError(null)
  }, [])

  const fetchModels = useCallback(async () => {
    if (!effectiveBaseUrl) {
      setEditorError('Base URL is required')
      return
    }
    setFetchingModels(true)
    setEditorError(null)
    try {
      const result = await apiClient.testAiConfig({
        provider,
        baseUrl: effectiveBaseUrl,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(resolvedModel ? { model: resolvedModel } : {}),
      })
      setModelOptions(result.models)
      if (result.models.length > 0 && (!resolvedModel || !result.models.includes(resolvedModel))) {
        setModel(result.models[0] ?? '')
        setCustomModel('')
      }
      if (result.available) {
        setEditorNote(
          result.modelWarning
            ? `Connected. ${result.modelWarning}`
            : `Connected. ${result.models.length} model(s) available.`,
        )
      } else {
        setEditorError(result.error || 'Connection test failed.')
      }
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Connection test failed.')
    } finally {
      setFetchingModels(false)
    }
  }, [provider, effectiveBaseUrl, apiKey, resolvedModel])

  const saveProfile = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setEditorError('Profile name is required')
      return
    }
    if (!effectiveBaseUrl) {
      setEditorError('Base URL is required')
      return
    }
    if (!resolvedModel) {
      setEditorError('Model is required')
      return
    }
    if (!editor) return

    setSavingProfile(true)
    setEditorError(null)
    try {
      // Start from the profile's stored inference so fields this form does not
      // expose (timeoutMs, maxTokens, enableThinking, …) survive the write —
      // PUT replaces the whole object. A blank key field leaves the stored
      // (redacted) key in place.
      const inference: Record<string, unknown> = {
        ...(editor.mode === 'edit' ? editor.inference : {}),
        provider,
        baseUrl: effectiveBaseUrl,
        model: resolvedModel,
      }
      if (apiKey.trim()) inference.apiKey = apiKey.trim()

      await apiClient.saveAiProfile(trimmedName, { inference })
      await load()
      setSelected(trimmedName)
      closeEditor()
      setTest(null)
      setNote(`Profile “${trimmedName}” saved. Test it, then activate it.`)
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Could not save that profile')
    } finally {
      setSavingProfile(false)
    }
  }, [name, effectiveBaseUrl, resolvedModel, editor, provider, apiKey, load, closeEditor])

  const deleteProfile = useCallback(async () => {
    if (!editor || editor.mode !== 'edit') return
    if (!window.confirm(`Delete the AI profile “${editor.name}”?`)) return
    setSavingProfile(true)
    setEditorError(null)
    try {
      await apiClient.deleteAiProfile(editor.name)
      closeEditor()
      setSelected('')
      setTest(null)
      await load()
      setNote(`Profile “${editor.name}” deleted.`)
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Could not delete that profile')
    } finally {
      setSavingProfile(false)
    }
  }, [editor, load, closeEditor])

  // -- Test / activate the selected profile --------------------------------

  const runTest = useCallback(async () => {
    if (!profile) return
    setTesting(true)
    setTest(null)
    setError(null)
    setNote(null)
    try {
      const result = await apiClient.testAiConfig({
        provider: profile.provider === 'openai' ? 'openai' : 'openai-compatible',
        baseUrl: profile.baseUrl,
        model: profile.model,
      })
      setTest(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test could not be run')
    } finally {
      setTesting(false)
    }
  }, [profile])

  const activate = useCallback(async () => {
    if (!profile) return
    setActivating(true)
    setError(null)
    setNote(null)
    try {
      const res = await apiClient.activateAiProfile(profile.name)
      if (!res.success) {
        setError(res.message ?? 'Could not activate that profile')
        return
      }
      setNote(`“${profile.name}” is now the model every surface uses.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate that profile')
    } finally {
      setActivating(false)
    }
  }, [profile, load])

  return (
    <div className="settings-ai" data-testid="settings-ai-model">
      <p className="settings-help">
        One model for the whole deployment: chat, the event editor, ingestion, extraction and compile all use the
        active profile. Test it before you activate it.
      </p>

      {loading ? <p className="settings-help">Reading the configured model…</p> : null}

      {!loading && profiles.length === 0 && !editor ? (
        <p className="settings-help" data-testid="settings-ai-empty">
          No AI profiles are configured. Add one below.
        </p>
      ) : null}

      {/* Always reachable: a fresh install has no profiles to select, so the
          only way in must not live inside the picker row. */}
      <div className="settings-ai__profile-actions">
        {profiles.length > 0 ? (
          <button
            type="button"
            className="settings-ai__button"
            onClick={openEdit}
            disabled={!profile || editorBusy}
            data-testid="settings-ai-edit-profile"
          >
            Edit profile
          </button>
        ) : null}
        <button
          type="button"
          className="settings-ai__button"
          onClick={openCreate}
          disabled={editorBusy}
          data-testid="settings-ai-new-profile"
        >
          + New profile
        </button>
      </div>

      {profiles.length > 0 ? (
        <div className="settings-ai__row">
          <label className="settings-ai__field">
            <span>Profile</span>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                setTest(null)
                setNote(null)
              }}
              aria-label="AI profile"
              data-testid="settings-ai-profile"
            >
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.active ? ' — active' : ''}
                </option>
              ))}
            </select>
          </label>

          {profile ? (
            <dl className="settings-ai__details" data-testid="settings-ai-details">
              <div>
                <dt>Endpoint</dt>
                <dd>{profile.baseUrl}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{profile.model}</dd>
              </div>
              <div>
                <dt>API key</dt>
                <dd>{profile.hasApiKey ? 'stored' : 'not set'}</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{profile.active ? 'yes' : `no — “${activeProfile ?? 'none'}” is`}</dd>
              </div>
            </dl>
          ) : null}

          <div className="settings-ai__actions">
            <button
              type="button"
              className="settings-ai__button"
              onClick={() => void runTest()}
              disabled={testing || !profile}
              data-testid="settings-ai-test"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              className="settings-ai__button settings-ai__button--primary"
              onClick={() => void activate()}
              disabled={activating || !profile || profile.active}
              data-testid="settings-ai-activate"
            >
              {activating ? 'Activating…' : profile?.active ? 'In use' : 'Use this model'}
            </button>
          </div>
        </div>
      ) : null}

      {editor ? (
        <div className="settings-ai__editor" data-testid="settings-ai-editor">
          <h3 className="settings-ai__editor-title">
            {editor.mode === 'create' ? 'New profile' : `Edit “${editor.name}”`}
          </h3>
          <p className="settings-help">
            Any OpenAI-compatible endpoint: a local vLLM / Ollama box, or a hosted router such as OpenRouter.
          </p>

          <EditRow
            label="Name"
            value={name}
            onChange={setName}
            mono
            placeholder="openrouter"
            disabled={editor.mode === 'edit'}
          />
          <SelectRow
            label="Endpoint"
            value={endpointKind}
            onChange={(v) => setEndpointKind(v === 'custom' ? 'custom' : 'openrouter')}
            options={ENDPOINT_OPTIONS}
          />
          {endpointKind === 'custom' ? (
            <EditRow
              label="Base URL"
              value={baseUrl}
              onChange={setBaseUrl}
              mono
              placeholder="http://thunderbeast:8889/v1"
            />
          ) : null}
          <SelectRow
            label="Provider"
            value={provider}
            onChange={(v) => setProvider(v === 'openai' ? 'openai' : 'openai-compatible')}
            options={PROVIDER_OPTIONS}
          />
          <SecretRow label="API key" value={apiKey} onChange={setApiKey} />
          <p className="settings-help">
            An environment-variable reference such as {'${OPENROUTER_API_KEY}'} is resolved by the server when it
            loads config, so the secret itself never has to sit in config.yaml.
          </p>
          {modelOptions.length > 0 ? (
            <SelectRow
              label="Model"
              value={model}
              onChange={setModel}
              options={[
                ...(model && model !== CUSTOM_MODEL && !modelOptions.includes(model)
                  ? [{ value: model, label: `${model} (current)` }]
                  : []),
                ...modelOptions.map((m) => ({ value: m, label: m })),
                { value: CUSTOM_MODEL, label: 'Custom model…' },
              ]}
            />
          ) : (
            <EditRow
              label="Model"
              value={model}
              onChange={setModel}
              mono
              placeholder="openai/gpt-4o-mini"
            />
          )}
          {model === CUSTOM_MODEL ? (
            <EditRow label="Custom model" value={customModel} onChange={setCustomModel} mono placeholder="vendor/model-id" />
          ) : null}

          <div className="settings-ai__editor-actions">
            <button
              type="button"
              className="settings-ai__button"
              onClick={() => void fetchModels()}
              disabled={editorBusy}
              data-testid="settings-ai-fetch-models"
            >
              {fetchingModels ? 'Fetching…' : 'Test & fetch models'}
            </button>
            <button
              type="button"
              className="settings-ai__button settings-ai__button--primary"
              onClick={() => void saveProfile()}
              disabled={editorBusy}
              data-testid="settings-ai-save-profile"
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
            {editor.mode === 'edit' ? (
              <button
                type="button"
                className="settings-ai__button"
                onClick={() => void deleteProfile()}
                disabled={editorBusy}
                data-testid="settings-ai-delete-profile"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="settings-ai__button"
              onClick={closeEditor}
              disabled={editorBusy}
              data-testid="settings-ai-cancel-edit"
            >
              Cancel
            </button>
          </div>

          {editorNote ? (
            <p className="settings-ok" role="status" data-testid="settings-ai-editor-note">
              {editorNote}
            </p>
          ) : null}
          {editorError ? (
            <p className="settings-error" role="alert" data-testid="settings-ai-editor-error">
              {editorError}
            </p>
          ) : null}
        </div>
      ) : null}

      {test ? (
        <p
          className={test.available ? 'settings-ok' : 'settings-error'}
          role={test.available ? 'status' : 'alert'}
          data-testid="settings-ai-test-result"
        >
          {test.available
            ? `Reached ${test.baseUrl}${test.model ? ` — it serves ${test.model}` : ''}${
                test.modelKnown ? '' : test.modelWarning ? ` (${test.modelWarning})` : ''
              }`
            : `Cannot reach ${test.baseUrl}${test.error ? `: ${test.error}` : ''}`}
        </p>
      ) : null}
      {note ? (
        <p className="settings-ok" role="status" data-testid="settings-ai-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="settings-error" role="alert" data-testid="settings-ai-error">
          {error}
        </p>
      ) : null}

      <style>{`
        .settings-ai {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .settings-ai__row {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .settings-ai__field {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .settings-ai__field > span {
          flex: 0 0 auto;
          font-size: 0.8rem;
          color: var(--cl-text-dim);
        }

        /* The pulldown is styled explicitly rather than left to the native
           widget: an unstyled select inherits the page ink but keeps the
           platform's light surface, so the closed control and its option
           list render light-grey-on-white in dark mode. Setting the surface,
           ink and option colours from the theme tokens keeps both the control
           and the popup on the active palette. */
        .settings-ai__field select {
          flex: 1;
          min-width: 0;
          font: inherit;
          font-size: 0.85rem;
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--cl-border);
          border-radius: 4px;
          background: var(--cl-bg);
          color: var(--cl-text);
        }

        .settings-ai__field select:focus {
          outline: none;
          border-color: var(--cl-accent);
          box-shadow: 0 0 0 2px var(--cl-focus-ring);
        }

        .settings-ai__field select option {
          background: var(--cl-bg-elev);
          color: var(--cl-text);
        }

        .settings-ai__details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin: 0;
          font-size: 0.8rem;
        }

        .settings-ai__details > div {
          display: grid;
          grid-template-columns: 5.5rem 1fr;
          gap: 0.5rem;
          align-items: baseline;
        }

        .settings-ai__details dt {
          color: var(--cl-text-dim);
        }

        .settings-ai__details dd {
          margin: 0;
          color: var(--cl-text);
          overflow-wrap: anywhere;
        }

        .settings-ai__editor {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          border: 1px solid var(--cl-border);
          border-radius: 6px;
          background: var(--cl-bg-elev-2);
        }

        .settings-ai__editor-title {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--cl-text);
        }

        .settings-ai__profile-actions,
        .settings-ai__actions,
        .settings-ai__editor-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        /* Two classes so the button ink beats the shell reset
           ".cl-app button { color: inherit }" (0-1-1). */
        .settings-ai .settings-ai__button {
          font: inherit;
          font-size: 0.85rem;
          padding: 0.45rem 0.9rem;
          border-radius: 6px;
          background: var(--cl-bg);
          border: 1px solid var(--cl-border);
          color: var(--cl-text);
          cursor: pointer;
        }

        .settings-ai .settings-ai__button:hover:not(:disabled) {
          border-color: var(--cl-border-strong);
        }

        .settings-ai .settings-ai__button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-ai .settings-ai__button--primary {
          background: var(--cl-accent);
          border-color: var(--cl-accent);
          color: var(--cl-on-accent);
        }

        .settings-ok {
          margin: 0;
          font-size: 0.8rem;
          color: var(--cl-success);
        }

        .settings-error {
          margin: 0;
          font-size: 0.8rem;
          color: var(--cl-danger);
        }
      `}</style>
    </div>
  )
}
