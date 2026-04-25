/**
 * Protocol IDE Shell — the shared IDE-like layout for the Protocol IDE.
 *
 * Layout model (IDE, not wizard):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  [nav] Semantic ELN  Protocol IDE                           │
 *   ├──────────┬──────────────────────────┬───────────────────────┤
 *   │          │                          │                       │
 *   │  Source  │    Event-Graph           │  Summary / Actions    │
 *   │  /Intake │    Review Surface        │  Rail                 │
 *   │  Pane    │    (primary)             │  (secondary)          │
 *   │          │                          │                       │
 *   │  (left)  │    (center)              │  (right)              │
 *   │          │                          │                       │
 *   └──────────┴──────────────────────────┴───────────────────────┘
 *
 * Two states:
 *   - empty intake: no session yet → intake pane is active
 *   - loaded session: session exists → source pane, graph surface, action rail
 */

import { useState } from 'react'
import type { ProtocolIdeSession } from './types'
import { ProtocolIdeIntakePane } from './ProtocolIdeIntakePane'
import type { IntakePayload } from './ProtocolIdeIntakePane'
import { ProtocolIdeSourcePane } from './ProtocolIdeSourcePane'
import type { EvidenceCitation } from './ProtocolIdeSourcePane'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtocolIdeShellProps {
  /** When provided, the shell renders in loaded-session mode. */
  session?: ProtocolIdeSession | null
  /** Callback when the user creates a new session (empty intake). */
  onCreateSession?: () => void
  /** Callback when the user navigates away from the Protocol IDE. */
  onNavigateAway?: () => void
}

// ---------------------------------------------------------------------------
// Empty intake pane — delegates to ProtocolIdeIntakePane
// ---------------------------------------------------------------------------

function IntakePane({
  onCreateSession,
}: {
  onCreateSession?: () => void
}): JSX.Element {
  const handleIntakeSubmit = (payload: IntakePayload) => {
    // For now, delegate to the existing onCreateSession callback.
    // In a later spec, this will call the session bootstrap API.
    onCreateSession?.()
  }

  return (
    <ProtocolIdeIntakePane
      onSubmit={handleIntakeSubmit}
      title="Protocol IDE Intake"
      description="Choose a source document and write a directive to begin building a protocol."
    />
  )
}

// ---------------------------------------------------------------------------
// Source evidence pane (left) — delegates to ProtocolIdeSourcePane
// ---------------------------------------------------------------------------

function SourcePane({ session }: { session: ProtocolIdeSession }): JSX.Element {
  const handleCitationClick = (citation: EvidenceCitation) => {
    // In a later spec, this will highlight the corresponding graph node
    // or issue card that references this citation.
    console.log('Citation clicked:', citation)
  }

  return (
    <ProtocolIdeSourcePane
      session={session}
      citations={session.evidenceRefs?.map((ref, i) => ({
        id: ref.id,
        artifactId: ref.id,
        page: i + 1,
        label: ref.label ?? `Evidence ${i + 1}`,
      })) ?? []}
      onCitationClick={handleCitationClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Event-graph review surface (center — primary)
// ---------------------------------------------------------------------------

function EventGraphSurface({ session }: { session: ProtocolIdeSession }): JSX.Element {
  return (
    <main className="protocol-ide-graph-surface" role="main" aria-label="Event-graph review surface">
      <div className="protocol-ide-graph-header">
        <h1 className="protocol-ide-graph-title">
          Event-Graph Review — {session.recordId}
        </h1>
        <span
          className="protocol-ide-status-badge"
          data-testid="protocol-ide-status-badge"
        >
          {session.status}
        </span>
      </div>
      <div className="protocol-ide-graph-body" data-testid="protocol-ide-graph-body">
        <p className="protocol-ide-graph-placeholder">
          Event-graph content will be rendered here once a session has been
          projected. Select a session or create a new one to begin.
        </p>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Summary / Actions rail (right — secondary)
// ---------------------------------------------------------------------------

function SummaryRail({ session }: { session: ProtocolIdeSession }): JSX.Element {
  return (
    <aside className="protocol-ide-summary-rail" role="complementary" aria-label="Summary and actions">
      <h2 className="protocol-ide-rail-title">Summary &amp; Actions</h2>

      <section className="protocol-ide-rail-section">
        <h3>Overlays</h3>
        <ul className="protocol-ide-overlay-list">
          <li data-testid="overlay-deck">Deck layout</li>
          <li data-testid="overlay-tools">Tools</li>
          <li data-testid="overlay-reagents">Reagents</li>
          <li data-testid="overlay-budget">Budget</li>
        </ul>
      </section>

      <section className="protocol-ide-rail-section">
        <h3>Actions</h3>
        <div className="protocol-ide-action-buttons">
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-rerun"
          >
            Rerun
          </button>
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-export"
          >
            Export to Ralph
          </button>
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-feedback"
          >
            Add Feedback
          </button>
        </div>
      </section>

      {session.issueCardRefs && session.issueCardRefs.length > 0 && (
        <section className="protocol-ide-rail-section">
          <h3>
            Issue Cards ({session.issueCardRefs.length})
          </h3>
          <ul className="protocol-ide-issue-list">
            {session.issueCardRefs.map((ref, i) => (
              <li key={i} data-testid={`issue-card-${i}`}>
                {ref.id}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export function ProtocolIdeShell({
  session,
  onCreateSession,
  onNavigateAway,
}: ProtocolIdeShellProps): JSX.Element {
  const hasSession = !!session

  return (
    <div className="protocol-ide-shell" data-testid="protocol-ide-shell">
      {/* Top bar */}
      <header className="protocol-ide-topbar" data-testid="protocol-ide-topbar">
        <div className="protocol-ide-topbar-left">
          <button
            className="protocol-ide-back-btn"
            onClick={() => onNavigateAway?.()}
            aria-label="Back"
            data-testid="protocol-ide-back"
          >
            ← Back
          </button>
          <h1 className="protocol-ide-topbar-title">Protocol IDE</h1>
        </div>
        {hasSession && (
          <div className="protocol-ide-topbar-right">
            <span
              className="protocol-ide-session-badge"
              data-testid="protocol-ide-session-badge"
            >
              {session.recordId}
            </span>
          </div>
        )}
      </header>

      {/* Three-column IDE layout */}
      <div className="protocol-ide-body" data-testid="protocol-ide-body">
        {/* Left: intake or source pane */}
        <div className="protocol-ide-left-pane" data-testid="protocol-ide-left-pane">
          {hasSession ? (
            <SourcePane session={session} />
          ) : (
            <IntakePane onCreateSession={onCreateSession} />
          )}
        </div>

        {/* Center: event-graph review surface (primary) */}
        <div className="protocol-ide-center-pane" data-testid="protocol-ide-center-pane">
          {hasSession ? (
            <EventGraphSurface session={session} />
          ) : (
            <main className="protocol-ide-graph-surface" role="main" aria-label="Event-graph review surface">
              <div className="protocol-ide-graph-header">
                <h1 className="protocol-ide-graph-title">Event-Graph Review</h1>
              </div>
              <div className="protocol-ide-graph-body" data-testid="protocol-ide-graph-body">
                <p className="protocol-ide-graph-placeholder">
                  Create a session to begin reviewing the event graph.
                </p>
              </div>
            </main>
          )}
        </div>

        {/* Right: summary / actions rail (secondary) */}
        {hasSession && (
          <div className="protocol-ide-right-pane" data-testid="protocol-ide-right-pane">
            <SummaryRail session={session} />
          </div>
        )}
      </div>

      {/* Inline styles for the shell layout */}
      <style>{`
        .protocol-ide-shell {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #f8f9fa;
        }

        .protocol-ide-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: #fff;
          border-bottom: 1px solid #e9ecef;
          flex-shrink: 0;
        }

        .protocol-ide-topbar-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .protocol-ide-topbar-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0;
        }

        .protocol-ide-back-btn {
          background: none;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          font-size: 0.85rem;
          color: #495057;
        }

        .protocol-ide-back-btn:hover {
          background: #f1f3f5;
        }

        .protocol-ide-session-badge {
          background: #e7f5ff;
          color: #1971c2;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .protocol-ide-body {
          flex: 1;
          display: flex;
          min-height: 0;
          overflow: hidden;
        }

        .protocol-ide-left-pane {
          width: 280px;
          min-width: 220px;
          max-width: 360px;
          border-right: 1px solid #e9ecef;
          background: #fff;
          overflow-y: auto;
          flex-shrink: 0;
        }

        .protocol-ide-center-pane {
          flex: 1;
          min-width: 0;
          overflow: auto;
          background: #f8f9fa;
        }

        .protocol-ide-right-pane {
          width: 260px;
          min-width: 200px;
          max-width: 320px;
          border-left: 1px solid #e9ecef;
          background: #fff;
          overflow-y: auto;
          flex-shrink: 0;
        }

        /* Intake pane */
        .protocol-ide-intake {
          padding: 1.5rem;
        }

        .protocol-ide-intake-title {
          font-size: 1.2rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.5rem 0;
        }

        .protocol-ide-intake-description {
          font-size: 0.9rem;
          color: #495057;
          line-height: 1.5;
          margin: 0 0 1rem 0;
        }

        .protocol-ide-intake-actions {
          margin-bottom: 1.5rem;
        }

        .protocol-ide-intake-hints {
          font-size: 0.85rem;
          color: #6c757d;
        }

        .protocol-ide-intake-hints h3 {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.25rem 0;
        }

        .protocol-ide-intake-hints ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .protocol-ide-intake-hints li {
          margin-bottom: 0.15rem;
        }

        /* Source pane — ProtocolIdeSourcePane has its own styles */

        /* Graph surface */
        .protocol-ide-graph-surface {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .protocol-ide-graph-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: #fff;
          border-bottom: 1px solid #e9ecef;
        }

        .protocol-ide-graph-title {
          font-size: 1rem;
          font-weight: 600;
          color: #212529;
          margin: 0;
        }

        .protocol-ide-status-badge {
          font-size: 0.75rem;
          padding: 0.15rem 0.5rem;
          border-radius: 3px;
          font-weight: 500;
          text-transform: capitalize;
        }

        .protocol-ide-graph-body {
          flex: 1;
          padding: 1rem;
          overflow: auto;
        }

        .protocol-ide-graph-placeholder {
          color: #6c757d;
          font-size: 0.9rem;
          text-align: center;
          margin-top: 2rem;
        }

        /* Summary rail */
        .protocol-ide-summary-rail {
          padding: 1rem;
        }

        .protocol-ide-rail-title {
          font-size: 1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.75rem 0;
        }

        .protocol-ide-rail-section {
          margin-bottom: 1.25rem;
        }

        .protocol-ide-rail-section h3 {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .protocol-ide-overlay-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .protocol-ide-overlay-list li {
          font-size: 0.85rem;
          color: #495057;
          padding: 0.3rem 0;
          border-bottom: 1px solid #f1f3f5;
        }

        .protocol-ide-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .protocol-ide-issue-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .protocol-ide-issue-list li {
          font-size: 0.8rem;
          color: #495057;
          padding: 0.25rem 0;
          border-bottom: 1px solid #f1f3f5;
        }

        /* Buttons */
        .protocol-ide-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s;
        }

        .protocol-ide-btn-primary {
          background: #228be6;
          color: #fff;
          border-color: #1971c2;
        }

        .protocol-ide-btn-primary:hover {
          background: #1971c2;
        }

        .protocol-ide-btn-secondary {
          background: #fff;
          color: #495057;
          border-color: #dee2e6;
        }

        .protocol-ide-btn-secondary:hover {
          background: #f1f3f5;
        }
      `}</style>
    </div>
  )
}
