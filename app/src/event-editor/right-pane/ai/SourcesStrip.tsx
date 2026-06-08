/**
 * SourcesStrip — chip-style row of context the AI tab is reading from,
 * plus a "+ Add source" affordance to ingest a vendor PDF inline.
 *
 * Two categories of chips render here:
 *   1. **Auto-attached** (Study + active viewer) — derived from props,
 *      not click-able. These reflect what the AI's per-message context
 *      already carries.
 *   2. **Recently added** (this session) — PDFs the user ingested via
 *      the "+ Add source" picker. These ARE click-able: clicking opens
 *      the artifact in the viewer, which puts it in the auto-attached
 *      slot on the next message. We do not pretend the chip itself
 *      attaches to the AI context — it's a session shortcut.
 *
 * Pure presentation — state, the modal, and the openTab plumbing live
 * in AiTabPanel.
 */

import type { WorkspaceTab } from '../../workspace/types'

export interface AddedSource {
  artifactId: string
  title: string
}

export interface SourcesStripProps {
  studyId: string
  activeTab: WorkspaceTab | null
  /** PDFs ingested via the "+ Add source" button in this session. */
  addedSources: AddedSource[]
  /** Open the "+ Add source" picker. */
  onAddSource: () => void
  /** Open an added source in the viewer (becomes the active artifact). */
  onOpenSource: (artifactId: string) => void
}

export function SourcesStrip({
  studyId,
  activeTab,
  addedSources,
  onAddSource,
  onOpenSource,
}: SourcesStripProps) {
  const autoChips: Array<{ id: string; label: string; sub: string }> = []

  autoChips.push({
    id: 'study',
    label: 'Study',
    sub: studyId,
  })

  if (activeTab) {
    if (activeTab.kind === 'deck') {
      autoChips.push({
        id: 'deck',
        label: 'Deck',
        sub: activeTab.eventGraphId || '(unsaved draft)',
      })
    } else if (activeTab.kind === 'pdf' || activeTab.kind === 'document') {
      autoChips.push({
        id: activeTab.kind,
        label: activeTab.kind === 'pdf' ? 'PDF' : 'Document',
        sub: activeTab.artifactId,
      })
    } else if (activeTab.kind === 'project-details') {
      autoChips.push({
        id: 'project-details',
        label: 'Overview',
        sub: 'project tree + artifacts',
      })
    }
  }

  const hasOnlyStudy = autoChips.length === 1 && addedSources.length === 0

  return (
    <div className="sources-strip" data-testid="sources-strip">
      {autoChips.map((c) => (
        <span
          key={c.id}
          className="sources-strip__chip"
          data-testid={`sources-chip-${c.id}`}
          title={`${c.label}: ${c.sub}`}
        >
          <span className="sources-strip__chip-label">{c.label}</span>
          <span className="sources-strip__chip-sub">{c.sub}</span>
        </span>
      ))}
      {addedSources.map((src) => (
        <button
          key={src.artifactId}
          type="button"
          className="sources-strip__chip sources-strip__chip--added"
          data-testid={`sources-chip-added-${src.artifactId}`}
          title={`${src.title} — click to open in viewer`}
          onClick={() => onOpenSource(src.artifactId)}
        >
          <span className="sources-strip__chip-label">PDF</span>
          <span className="sources-strip__chip-sub">{src.title}</span>
        </button>
      ))}
      <button
        type="button"
        className="sources-strip__add-btn"
        onClick={onAddSource}
        data-testid="sources-strip-add"
        title="Search Exa for a vendor PDF and ingest it as a study artifact"
      >
        + Add source
      </button>
      {hasOnlyStudy ? (
        <span className="sources-strip__hint">
          Open a viewer in <strong>Find</strong>, or add a vendor PDF, to
          attach more context.
        </span>
      ) : null}
    </div>
  )
}
