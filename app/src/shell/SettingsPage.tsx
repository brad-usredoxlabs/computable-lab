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
  AiSettingsSection,
  LabMaterialTrackingSection,
  WebSearchSettingsSection,
} from './settings'
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
      const updated = await apiClient.patchLabSettings({ policyBundleId: bundleId })
      setLabSettings(updated)
    } catch (err) {
      alert(`Failed to update policy bundle: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [])

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
        <AiSettingsSection
          ai={config?.ai ?? null}
          aiStatus={config?.aiStatus ?? null}
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

        {/* ---- Policy Bundle Selector ---- */}
        <Section title="Policy Bundle">
          {labSettingsLoading ? (
            <div className="info-row">
              <span className="info-row__value">Loading...</span>
            </div>
          ) : labSettingsError ? (
            <div className="info-row">
              <span className="info-row__value" style={{ color: '#c92a2a' }}>{labSettingsError}</span>
            </div>
          ) : labSettings ? (
            <PolicyBundleSelector
              currentBundleId={labSettings.policyBundleId}
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
          color: #666;
          margin: 0;
        }

        .breadcrumb {
          font-size: 0.875rem;
          color: #666;
        }

        .breadcrumb a {
          color: #339af0;
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb-separator {
          margin: 0 0.5rem;
        }

        .error-banner {
          background: #ffe3e3;
          border: 1px solid #ffc9c9;
          color: #c92a2a;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-banner button {
          padding: 0.25rem 0.75rem;
          border: 1px solid #c92a2a;
          border-radius: 4px;
          background: white;
          color: #c92a2a;
          cursor: pointer;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 1rem;
        }

        /* --- Section card --- */

        .settings-section {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          overflow: hidden;
        }

        .settings-section__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border-bottom: 1px solid #e9ecef;
        }

        .settings-section__header h2 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: #495057;
        }

        .settings-section__content {
          padding: 0.75rem 1rem;
        }

        .settings-section__footer {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-top: 1px solid #e9ecef;
          background: #f8f9fa;
        }

        /* --- Info rows --- */

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f1f3f5;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row__label {
          color: #868e96;
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .info-row__value {
          font-size: 0.85rem;
          text-align: right;
          max-width: 60%;
          overflow: hidden;
          text-overflow: ellipsis;
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
          border: 1px solid #dee2e6;
          border-radius: 4px;
          background: white;
        }

        .edit-row__input:focus,
        .edit-row__select:focus {
          outline: none;
          border-color: #339af0;
          box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.15);
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
          background: #d3f9d8;
          color: #2b8a3e;
        }

        .secret-badge--empty {
          background: #e9ecef;
          color: #868e96;
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
          background: #339af0;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #228be6;
        }

        .btn-secondary {
          background: #e9ecef;
          color: #495057;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #dee2e6;
        }

        .btn-edit {
          padding: 0.25rem 0.75rem;
          font-size: 0.8rem;
          background: white;
          border: 1px solid #dee2e6;
          color: #495057;
          border-radius: 4px;
        }

        .btn-edit:hover:not(:disabled) {
          background: #f1f3f5;
          border-color: #adb5bd;
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
          color: #868e96;
          font-style: italic;
          font-size: 0.85rem;
        }

        .not-configured .hint {
          margin-top: 0.5rem;
          font-size: 0.8rem;
        }

        .not-configured code {
          background: #f1f3f5;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-family: 'Monaco', 'Menlo', monospace;
        }
      `}</style>
    </div>
  )
}

export default SettingsPage
