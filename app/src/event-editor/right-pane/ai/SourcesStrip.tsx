/**
 * SourcesStrip — chip-style row of context the AI is auto-attached to.
 *
 * Phase 7b ships only the auto-attached chips (study + active viewer);
 * Phase 9 will add a "+ Add source" affordance that pops the GraphLemur
 * Exa search and ingests the chosen PDF as a study-scoped artifact, then
 * appends a chip here.
 *
 * Pure presentation — driven by props the AiTabPanel composes.
 */

import type { WorkspaceTab } from '../../workspace/types'

export interface SourcesStripProps {
  studyId: string
  activeTab: WorkspaceTab | null
}

export function SourcesStrip({ studyId, activeTab }: SourcesStripProps) {
  const chips: Array<{ id: string; label: string; sub: string }> = []

  chips.push({
    id: 'study',
    label: 'Study',
    sub: studyId,
  })

  if (activeTab) {
    if (activeTab.kind === 'deck') {
      chips.push({
        id: 'deck',
        label: 'Deck',
        sub: activeTab.eventGraphId || '(unsaved draft)',
      })
    } else if (activeTab.kind === 'pdf' || activeTab.kind === 'document') {
      chips.push({
        id: activeTab.kind,
        label: activeTab.kind === 'pdf' ? 'PDF' : 'Document',
        sub: activeTab.artifactId,
      })
    } else if (activeTab.kind === 'project-details') {
      // Phase 12: the project-overview tab has no artifact, just the
      // study context that's already in the Study chip above.
      chips.push({
        id: 'project-details',
        label: 'Overview',
        sub: 'project tree + artifacts',
      })
    }
  }

  return (
    <div className="sources-strip" data-testid="sources-strip">
      {chips.map((c) => (
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
      {chips.length === 1 ? (
        <span className="sources-strip__hint">
          Open a viewer in Browse to attach more context.
        </span>
      ) : null}
    </div>
  )
}
