/**
 * openArtifactInViewer — map an artifact summary to the right WorkspaceTab
 * shape and open it. Shared between Browse and Search so a future change
 * to the kind→viewer mapping (e.g. PNGs, CSVs) flows through one place.
 *
 * Returns true when a tab was opened, false when the artifact kind has no
 * viewer yet (e.g. saved-prompt — Phase 9 will handle that).
 */

import type { ArtifactSummary } from '../../types/artifact'
import type { WorkspaceTab } from '../workspace/types'

export function tabForArtifact(artifact: ArtifactSummary): WorkspaceTab | null {
  switch (artifact.artifactKind) {
    case 'pdf':
      return {
        id: `tab-pdf-${artifact.recordId}`,
        kind: 'pdf',
        artifactId: artifact.recordId,
        title: artifact.title,
      }
    case 'protocol':
    case 'writeup':
    case 'training':
    case 'conclusion':
      return {
        id: `tab-doc-${artifact.recordId}`,
        kind: 'document',
        artifactId: artifact.recordId,
        title: artifact.title,
      }
    case 'saved-prompt':
      // Saved prompts don't have a dedicated viewer yet. Phase 9 (Run in
      // event-editor) will probably surface them inline in the AI tab
      // rather than as a separate viewer kind.
      return null
    default: {
      const _exhaustive: never = artifact.artifactKind
      return _exhaustive ?? null
    }
  }
}

/**
 * Human-readable label for an artifact kind, used by Browse to group rows
 * and by the AI placeholder to describe the active viewer.
 */
export function artifactKindLabel(kind: ArtifactSummary['artifactKind']): string {
  switch (kind) {
    case 'pdf':
      return 'PDFs'
    case 'protocol':
      return 'Protocols'
    case 'writeup':
      return 'Write-ups'
    case 'training':
      return 'Training'
    case 'conclusion':
      return 'Conclusions'
    case 'saved-prompt':
      return 'Saved prompts'
    default: {
      const _exhaustive: never = kind
      return _exhaustive ?? 'Unknown'
    }
  }
}
