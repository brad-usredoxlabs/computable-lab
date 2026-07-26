import { useState } from 'react'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'
import { RunChatPanel } from './RunChatPanel'

type RightRailTab = 'copilot' | 'chat'

interface RunWorkspaceRightRailProps {
  summary: RunWorkspaceSummary
  /** When true, show the chat tab (RUN mode only) */
  showChat?: boolean
  /** The currently selected event ref for filtering chat */
  selectedEventRef?: string | null
  /** Execution states for all events */
  executionStates?: Map<string, { state: string; startedAt?: string; completedAt?: string; deviationNote?: string }>
}

export function RunWorkspaceRightRail({ summary, showChat = false, selectedEventRef, executionStates }: RunWorkspaceRightRailProps) {
  const [activeTab, setActiveTab] = useState<RightRailTab>(showChat ? 'chat' : 'copilot')

  return (
    <aside className="run-workspace-right-rail">
      {showChat && (
        <div className="run-workspace-rail-tabs">
          <button
            className={`run-workspace-rail-tab ${activeTab === 'copilot' ? 'run-workspace-rail-tab--active' : ''}`}
            onClick={() => setActiveTab('copilot')}
            type="button"
          >
            Copilot
          </button>
          <button
            className={`run-workspace-rail-tab ${activeTab === 'chat' ? 'run-workspace-rail-tab--active' : ''}`}
            onClick={() => setActiveTab('chat')}
            type="button"
          >
            Chat
          </button>
        </div>
      )}

      {activeTab === 'chat' ? (
        <RunChatPanel runId={summary.runId} selectedEventRef={selectedEventRef} executionStates={executionStates} />
      ) : (
        <>
          <section>
            <h3>AI Copilot</h3>
            <p>Use the editor modes to draft event steps, biological meaning, readout mappings, and result interpretation in context.</p>
          </section>
          <section>
            <h3>Next Actions</h3>
            <ul>
              {summary.nextActions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section>
            <h3>Method Summary</h3>
            <p>{summary.methodSummary}</p>
          </section>
        </>
      )}

      <style>{`
        .run-workspace-rail-tabs {
          display: flex;
          gap: 0.25rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.5rem;
        }

        .run-workspace-rail-tab {
          border: none;
          background: #f1f5f9;
          color: #475569;
          border-radius: 6px;
          padding: 0.35rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .run-workspace-rail-tab:hover {
          background: #e2e8f0;
        }

        .run-workspace-rail-tab--active {
          background: #0969da;
          color: #fff;
        }
      `}</style>
    </aside>
  )
}
