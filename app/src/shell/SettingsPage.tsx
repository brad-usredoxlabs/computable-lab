/**
 * SettingsPage - Interactive server configuration and status display.
 *
 * Read-only sections (from /api/meta): Server, Schemas, Validation
 * Editable sections (from /api/config): Repository, Namespace, Sync, JSON-LD, AI
 *
 * Only one section can be edited at a time to prevent conflicting saves.
 */

import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useServerMeta } from '../shared/hooks/useServerMeta'
import { useConfig } from '../shared/hooks/useConfig'
import { apiClient, type LabSettings } from '../shared/api/client'
import { PolicyBundleSelector } from '../components/settings/PolicyBundleSelector'
import {
  RepositorySection,
  AddRepositorySection,
  NamespaceSection,
  SyncSection,
  JsonLdSection,
  AiModelSection,
  ExtractorSettingsSection,
  LabMaterialTrackingSection,
  WebSearchSettingsSection,
  GroupMembershipSection,
  LabProfileSection,
  StorageDevicesSection,
} from './settings'
import { Slot } from '../extensions'
import type { SectionId } from './settings/EditableSection'
import type { ConfigPatchResponse } from '../types/config'

/**
 * Read-only section card component (for Server, Schemas, Validation).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>{title}</h2>
      </div>
      <div className="settings-section__content">
        {children}
      </div>
    </div>
  )
}

/**
 * Read-only info row.
 */
function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span className={`info-row__value ${mono ? 'info-row__value--mono' : ''}`}>{value}</span>
    </div>
  )
}

/**
 * Settings page component.
 */
export function SettingsPage() {
  const { meta, repoStatus, loading: metaLoading, error: metaError, refresh: refreshMeta, sync, syncing } = useServerMeta()
  const { config, loading: configLoading, error: configError, patchConfig, saving, testAiConfig } = useConfig()

  // Lab settings state
  const [labSettings, setLabSettings] = useState<LabSettings | null>(null)
  const [labSettingsLoading, setLabSettingsLoading] = useState(true)
  const [labSettingsError, setLabSettingsError] = useState<string | null>(null)

  // Only one editable section at a time
  const [editingSection, setEditingSection] = useState<SectionId | null>(null)

  // Load lab settings
  useEffect(() => {
    let cancelled = false
    async function loadLabSettings() {
      try {
        const settings = await apiClient.getLabSettings()
        if (!cancelled) setLabSettings(settings)
      } catch (err) {
        if (!cancelled) setLabSettingsError(err instanceof Error ? err.message : 'Failed to load lab settings')
      } finally {
        if (!cancelled) setLabSettingsLoading(false)
      }
    }
    loadLabSettings()
    return () => { cancelled = true }
  }, [])

  // Handle policy bundle change
  const handlePolicyBundleChanged = useCallback(async (bundleId: string) => {
    try {
      await patchConfig({ lab: { policyBundleId: bundleId } })
      const fresh = await apiClient.getLabSettings()
      setLabSettings(fresh)
    } catch (err) {
      alert(`Failed to update policy bundle: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [patchConfig])

  const handleSync = async () => {
    const result = await sync()
    if (result.success) {
      alert(`Sync successful! Pulled ${result.pulledCommits || 0} commits.`)
    } else {
      alert(`Sync failed: ${result.error}`)
    }
  }

  // Shared save handler — delegates to patchConfig, returns restartRequired
  const handleSave = useCallback(async (patch: Record<string, unknown>): Promise<{ restartRequired?: boolean }> => {
    const result: ConfigPatchResponse = await patchConfig(patch)
    // Also refresh meta so status badges stay current
    refreshMeta()
    return { restartRequired: result.restartRequired }
  }, [patchConfig, refreshMeta])

  const repo = config?.repositories[0] ?? null
  const loading = metaLoading || configLoading
  const error = metaError || configError

  return (
    <div className="settings-page">
      <header className="page-header">
        <div className="breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span>Settings</span>
        </div>
        <h1>Settings</h1>
        <p>Server configuration and connection status</p>
      </header>

      {error && (
        <div className="error-banner">
          <strong>Connection Error:</strong> {error}
          <button onClick={refreshMeta} disabled={loading}>Retry</button>
        </div>
      )}

      <div className="settings-grid">
        {/* ---- Read-only: Server ---- */}
        <Section title="Server">
          <InfoRow label="Version" value={meta?.server.version || '—'} mono />
          <InfoRow label="Uptime" value={meta?.server.uptime || '—'} />
          <InfoRow
            label="Status"
            value={loading ? 'Loading...' : error ? 'Error' : 'Connected'}
          />
        </Section>

        {/* ---- Editable: the AI model every surface uses ---- */}
        <Section title="AI model">
          <AiModelSection />
        </Section>

        {/* ---- Editable: Repository ---- */}
        {repo ? (
          <RepositorySection
            repo={repo}
            repoStatus={repoStatus}
            editingSection={editingSection}
            onEditChange={setEditingSection}
            onSave={handleSave}
            saving={saving}
          />
        ) : (
          <AddRepositorySection onSave={handleSave} saving={saving} />
        )}

        {/* ---- Editable: Namespace ---- */}
        {repo && (
          <NamespaceSection
            repo={repo}
            editingSection={editingSection}
            onEditChange={setEditingSection}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {/* ---- Read-only: Lab Profile (THIS lab) ---- */}
        <LabProfileSection />

        {/* ---- Editable: Storage Devices (S3 / NAS / USB) ---- */}
        <StorageDevicesSection
          devices={config?.storageDevices ?? []}
          editingSection={editingSection}
          onEditChange={setEditingSection}
          onSave={handleSave}
          saving={saving}
        />

        {/* ---- Editable: Sync ---- */}
        {repo && (
          <SyncSection
            repo={repo}
            editingSection={editingSection}
            onEditChange={setEditingSection}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {/* ---- Editable: JSON-LD ---- */}
        {repo && (
          <JsonLdSection
            repo={repo}
            editingSection={editingSection}
            onEditChange={setEditingSection}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {/* ---- Read-only: Schemas ---- */}
        <Section title="Schemas">
          <InfoRow label="Source" value={meta?.schemas.source || '—'} />
          <InfoRow label="Total Schemas" value={meta?.schemas.count || '—'} />
          {meta?.schemas.bundledCount !== undefined && (
            <InfoRow label="Bundled" value={meta.schemas.bundledCount} />
          )}
          {meta?.schemas.overlayCount !== undefined && (
            <InfoRow label="Overlay" value={meta.schemas.overlayCount} />
          )}
          {meta?.schemas.overriddenCount !== undefined && meta.schemas.overriddenCount > 0 && (
            <InfoRow label="Overridden" value={meta.schemas.overriddenCount} />
          )}
        </Section>

        {/* ---- Read-only: Validation ---- */}
        <Section title="Validation">
          <InfoRow label="Lint Rules" value={meta?.lint.ruleCount || '—'} />
        </Section>

        {/* ---- Editable: AI Assistant ---- */}
        <Slot
          name="settings.ai-section"
          ai={config?.ai ?? null}
          aiStatus={config?.aiStatus ?? null}
          editingSection={editingSection}
          onEditChange={setEditingSection}
          onSave={handleSave}
          onTest={testAiConfig}
          saving={saving}
        />

        {/* ---- Editable: Extractor Settings ---- */}
        <ExtractorSettingsSection
          extractor={config?.ai?.extractor ?? null}
          editingSection={editingSection}
          onEditChange={setEditingSection}
          onSave={handleSave}
          onTest={testAiConfig}
          saving={saving}
        />

        <WebSearchSettingsSection
          integrations={config?.integrations ?? null}
          editingSection={editingSection}
          onEditChange={setEditingSection}
          onSave={handleSave}
          saving={saving}
        />

        <LabMaterialTrackingSection
          lab={config?.lab ?? null}
          editingSection={editingSection}
          onEditChange={setEditingSection}
          onSave={handleSave}
          saving={saving}
        />

        {/* ---- Groups / collaboration ---- */}
        <GroupMembershipSection />

        {/* ---- Policy Bundle Selector ---- */}
        <Section title="Policy Bundle">
          {labSettingsLoading ? (
            <div className="info-row">
              <span className="info-row__value">Loading...</span>
            </div>
          ) : labSettingsError ? (
            <div className="info-row">
              <span className="info-row__value" style={{ color: 'var(--cl-danger)' }}>{labSettingsError}</span>
            </div>
          ) : labSettings ? (
            <PolicyBundleSelector
              currentBundleId={labSettings.policyBundleId}
              bundles={labSettings.availablePolicyBundles ?? []}
              onBundleChanged={handlePolicyBundleChanged}
            />
          ) : (
            <div className="info-row">
              <span className="info-row__value">Not configured</span>
            </div>
          )}
        </Section>

        {/* ---- Sync controls (from meta) ---- */}
        {meta?.repository && (
          <Section title="Actions">
            <div className="sync-controls">
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className="btn btn-primary"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={refreshMeta}
                disabled={loading}
                className="btn btn-secondary"
              >
                Refresh Status
              </button>
            </div>
          </Section>
        )}
      </div>

      <style>{`
        .settings-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }

        .page-header {
          margin-bottom: 1.5rem;
        }

        .page-header h1 {
          margin: 0.5rem 0;
        }

        .page-header p {
          color: var(--cl-text-dim);
          margin: 0;
        }

        .breadcrumb {
          font-size: 0.875rem;
          color: var(--cl-text-dim);
        }

        .breadcrumb a {
          color: var(--cl-accent);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb-separator {
          margin: 0 0.5rem;
        }

        .error-banner {
          background: var(--cl-danger-soft);
          border: 1px solid var(--cl-danger-border);
          color: var(--cl-danger);
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-banner button {
          padding: 0.25rem 0.75rem;
          border: 1px solid var(--cl-danger);
          border-radius: 4px;
          background: transparent;
          color: var(--cl-danger);
          cursor: pointer;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 1rem;
        }

        /* --- Section card --- */

        .settings-section {
          background: var(--cl-bg-elev);
          border: 1px solid var(--cl-border);
          border-radius: 8px;
          overflow: hidden;
          color: var(--cl-text);
        }

        .settings-section__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--cl-bg-elev-2);
          border-bottom: 1px solid var(--cl-border);
        }

        .settings-section__header h2 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--cl-text);
        }

        .settings-section__content {
          padding: 0.75rem 1rem;
        }

        .settings-section__footer {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--cl-border);
          background: var(--cl-bg-elev-2);
        }

        /* --- Info rows --- */

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--cl-border);
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row__label {
          color: var(--cl-text-dim);
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .info-row__value {
          font-size: 0.85rem;
          text-align: right;
          max-width: 60%;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--cl-text);
        }

        .info-row__value--mono {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.8rem;
        }

        /* --- Edit rows --- */

        .edit-row {
          gap: 1rem;
        }

        .edit-row__input,
        .edit-row__select {
          flex: 1;
          max-width: 60%;
          padding: 0.375rem 0.5rem;
          font-size: 0.85rem;
          border: 1px solid var(--cl-border);
          border-radius: 4px;
          background: var(--cl-bg);
          color: var(--cl-text);
        }

        .edit-row__input::placeholder {
          color: var(--cl-text-faint);
          opacity: 1;
        }

        .edit-row__input:focus,
        .edit-row__select:focus {
          outline: none;
          border-color: var(--cl-accent);
          box-shadow: 0 0 0 2px var(--cl-focus-ring);
        }

        .edit-row__input--mono {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.8rem;
        }

        .edit-row__checkbox-wrapper {
          display: flex;
          align-items: center;
        }

        .edit-row__checkbox-wrapper input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
          accent-color: var(--cl-accent);
        }

        /* --- Badges --- */

        .status-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .secret-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .secret-badge--set {
          background: var(--cl-success-soft);
          color: var(--cl-success);
        }

        .secret-badge--empty {
          background: var(--cl-bg-elev-2);
          color: var(--cl-text-dim);
        }

        /* --- Feedback banner --- */

        .feedback-banner {
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .feedback-banner__dismiss {
          background: none;
          border: none;
          font-size: 1.1rem;
          cursor: pointer;
          padding: 0 0.25rem;
          opacity: 0.7;
          color: inherit;
        }

        .feedback-banner__dismiss:hover {
          opacity: 1;
        }

        /* --- Buttons --- */

        .btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: var(--cl-accent);
          color: var(--cl-on-accent);
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--cl-accent-hover);
        }

        .btn-secondary {
          background: var(--cl-bg-elev-2);
          color: var(--cl-text);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--cl-border);
        }

        .btn-edit {
          padding: 0.25rem 0.75rem;
          font-size: 0.8rem;
          background: transparent;
          border: 1px solid var(--cl-border);
          color: var(--cl-text);
          border-radius: 4px;
        }

        .btn-edit:hover:not(:disabled) {
          background: var(--cl-bg-elev-2);
          border-color: var(--cl-border-strong);
        }

        .btn-edit:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* --- Misc --- */

        .sync-controls {
          display: flex;
          gap: 0.5rem;
        }

        .not-configured {
          color: var(--cl-text-dim);
          font-style: italic;
          font-size: 0.85rem;
        }

        .not-configured .hint {
          margin-top: 0.5rem;
          font-size: 0.8rem;
        }

        .not-configured code {
          background: var(--cl-bg-elev-2);
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-family: 'Monaco', 'Menlo', monospace;
        }

        /* --- Helpers used inside section content --- */

        /* Inline kind tag on a storage device row (e.g. "local-mount"). */
        .storage-device-kind {
          display: inline-block;
          margin-right: 0.4rem;
          padding: 0.05rem 0.4rem;
          border-radius: 9999px;
          font-size: 0.7rem;
          font-family: 'Monaco', 'Menlo', monospace;
          background: var(--cl-bg-elev-2);
          color: var(--cl-text-dim);
        }

        /* "default" marker on the default storage device. */
        .storage-device-default {
          display: inline-block;
          margin-right: 0.4rem;
          padding: 0.05rem 0.4rem;
          border-radius: 9999px;
          font-size: 0.7rem;
          border: 1px solid var(--cl-accent);
          color: var(--cl-accent);
        }

        .storage-device-editor + .storage-device-editor {
          border-top: 1px solid var(--cl-border);
          margin-top: 0.5rem;
          padding-top: 0.5rem;
        }

        .settings-help {
          margin: 0.25rem 0;
          font-size: 0.8rem;
          color: var(--cl-text-dim);
        }

        /* The shell resets ".cl-app button { color: inherit }" (specificity
           0-1-1), which otherwise wins over the 0-1-0 button rules above and
           paints primary-button text with the page ink instead of the
           on-accent ink. Re-assert the fills' ink with a page-scoped
           selector so primary / secondary / ghost labels stay legible
           against their own backgrounds in both themes. */
        .settings-page .btn-primary { color: var(--cl-on-accent); }
        .settings-page .btn-secondary { color: var(--cl-text); }
        .settings-page .btn-edit { color: var(--cl-text); }

        /* index.css owns a global .breadcrumb* pair with a fixed slate
           palette; re-point the page's breadcrumb at the theme tokens. */
        .settings-page .breadcrumb a { color: var(--cl-accent); }
        .settings-page .breadcrumb-separator { color: var(--cl-text-dim); }
      `}</style>
    </div>
  )
}

export default SettingsPage
