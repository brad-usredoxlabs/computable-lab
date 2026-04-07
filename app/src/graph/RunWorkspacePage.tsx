import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { useAiChat } from '../shared/hooks/useAiChat'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useResultInterpretation } from './hooks/useResultInterpretation'
import { useEvidenceAssembly } from './hooks/useEvidenceAssembly'
import type { AiContext } from '../types/aiContext'
import { RunBiologyTab } from './run-workspace/RunBiologyTab'
import { RunClaimsTab } from './run-workspace/RunClaimsTab'
import { RunOverviewTab } from './run-workspace/RunOverviewTab'
import { RunPlanTab } from './run-workspace/RunPlanTab'
import { RunReadoutsTab } from './run-workspace/RunReadoutsTab'
import { RunResultsTab } from './run-workspace/RunResultsTab'
import { RunWorkspaceHeader } from './run-workspace/RunWorkspaceHeader'
import { RunWorkspaceNav } from './run-workspace/RunWorkspaceNav'
import { RunWorkspaceRightRail } from './run-workspace/RunWorkspaceRightRail'
import { RunWorkspaceShell } from './run-workspace/RunWorkspaceShell'
import { useRunWorkspace } from './hooks/useRunWorkspace'

type WorkspaceTab = 'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims'

export function RunWorkspacePage() {
  const { runId } = useParams<{ runId: string }>()
  const { summary, workspace, loading, error, refresh } = useRunWorkspace(runId)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')
  const [exportingAnalysis, setExportingAnalysis] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  // AI panel
  const aiContext = useMemo((): AiContext => ({
    surface: `run-workspace:${activeTab}`,
    summary: `Run workspace: ${summary?.runId || runId || 'unknown'}, tab: ${activeTab}`,
    editorMode: activeTab,
    surfaceContext: {
      runId: runId || null,
      activeTab,
      runTitle: summary?.title || null,
      runStatus: summary?.status || null,
      eventGraphId: workspace?.eventGraph?.recordId || null,
      measurementContextCount: workspace?.measurementContexts?.length ?? 0,
      wellGroupCount: workspace?.wellGroups?.length ?? 0,
      measurementCount: workspace?.measurements?.length ?? 0,
      claimCount: workspace?.claims?.length ?? 0,
      evidenceCount: workspace?.evidence?.length ?? 0,
      assertionCount: workspace?.assertions?.length ?? 0,
    },
  }), [runId, activeTab, summary?.runId, summary?.title, summary?.status, workspace])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  const resolvedRunId = runId || ''

  // Result-to-Evidence Pipeline hooks
  const interpretation = useResultInterpretation(resolvedRunId)
  const assembly = useEvidenceAssembly(resolvedRunId)

  const handleExportAnalysis = useCallback(async () => {
    if (!runId) return
    setExportingAnalysis(true)
    setExportError(null)
    setExportMessage(null)
    try {
      const bundle = await apiClient.getRunAnalysisBundle(runId)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${summary.runId}-analysis-bundle.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(objectUrl)
      setExportMessage(`Downloaded ${summary.runId}-analysis-bundle.json`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export analysis bundle')
    } finally {
      setExportingAnalysis(false)
    }
  }, [runId, summary.runId])

  const main = loading
    ? <section className="run-workspace-card"><h2>Loading</h2><p>Loading run workspace…</p></section>
    : error
      ? <section className="run-workspace-card"><h2>Error</h2><p>{error}</p></section>
      : activeTab === 'overview'
        ? <RunOverviewTab summary={summary} runId={resolvedRunId} chat={aiChat} />
        : activeTab === 'plan'
          ? <RunPlanTab summary={summary} />
          : activeTab === 'biology'
            ? <RunBiologyTab summary={summary} runId={resolvedRunId} chat={aiChat} />
            : activeTab === 'readouts'
              ? <RunReadoutsTab summary={summary} runId={resolvedRunId} chat={aiChat} />
            : activeTab === 'results'
              ? <RunResultsTab summary={summary} runId={resolvedRunId} chat={aiChat} interpretation={interpretation} assembly={assembly} workspace={workspace} />
              : <RunClaimsTab workspace={workspace} onRefresh={refresh} onExportAnalysis={handleExportAnalysis} exportingAnalysis={exportingAnalysis} runId={resolvedRunId} chat={aiChat} assembly={assembly} />

  return (
    <div>
      <RunWorkspaceShell
        header={<RunWorkspaceHeader summary={summary} onExportAnalysis={handleExportAnalysis} exporting={exportingAnalysis} />}
        nav={<RunWorkspaceNav activeTab={activeTab} onTabChange={setActiveTab} counts={summary.counts} />}
        main={main}
        rightRail={<RunWorkspaceRightRail summary={summary} />}
      />
      {exportMessage ? <div className="run-workspace-toast run-workspace-toast--success">{exportMessage}</div> : null}
      {exportError ? <div className="run-workspace-toast run-workspace-toast--error">{exportError}</div> : null}

      <style>{`
        .run-workspace-header,
        .run-workspace-nav,
        .run-workspace-right-rail,
        .run-workspace-card {
          border: 1px solid #d8dee4;
          border-radius: 16px;
          background: #ffffff;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.04);
        }

        .run-workspace-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.25rem;
          flex-wrap: wrap;
          background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
        }

        .run-workspace-header__eyebrow {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #0969da;
          margin-bottom: 0.4rem;
        }

        .run-workspace-header h1 {
          margin: 0;
          font-size: 1.4rem;
          color: #0f172a;
        }

        .run-workspace-header p {
          margin: 0.5rem 0 0;
          color: #475569;
          max-width: 52rem;
          line-height: 1.5;
        }

        .run-workspace-header__actions {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .run-workspace-header__primary,
        .run-workspace-header__secondary,
        .run-workspace-card__link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border-radius: 999px;
          padding: 0.6rem 0.95rem;
          font-weight: 700;
        }

        .run-workspace-header__primary,
        .run-workspace-card__link {
          background: #0969da;
          color: #ffffff;
        }

        .run-workspace-header__secondary {
          background: #ffffff;
          color: #0969da;
          border: 1px solid #b6d1ff;
        }

        .run-workspace-header__secondary:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .run-workspace-nav {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
        }

        .run-workspace-nav__item {
          border: 1px solid transparent;
          background: #f8fafc;
          color: #0f172a;
          border-radius: 12px;
          padding: 0.75rem 0.85rem;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-weight: 700;
        }

        .run-workspace-nav__item small {
          color: #64748b;
          font-weight: 600;
        }

        .run-workspace-nav__item.is-active {
          border-color: #b6d1ff;
          background: #eff6ff;
          color: #0969da;
        }

        .run-workspace-right-rail {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .run-workspace-right-rail section h3,
        .run-workspace-card h2 {
          margin: 0 0 0.45rem;
          color: #0f172a;
          font-size: 1rem;
        }

        .run-workspace-right-rail section p,
        .run-workspace-card p,
        .run-workspace-card li {
          color: #475569;
          line-height: 1.5;
        }

        .run-workspace-tab-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .run-workspace-card {
          padding: 1rem 1.1rem;
        }

        .run-workspace-toast {
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          z-index: 20;
          max-width: 28rem;
          border-radius: 14px;
          padding: 0.8rem 1rem;
          color: #0f172a;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
        }

        .run-workspace-toast--success {
          background: #dcfce7;
          border: 1px solid #86efac;
        }

        .run-workspace-toast--error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
        }

        @media (max-width: 760px) {
          .run-workspace-tab-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
