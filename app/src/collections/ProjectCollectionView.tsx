/**
 * ProjectCollectionView — collection view for /projects.
 *
 * Phase 1 stub. Full card grid with metadata is implemented in Phase 3.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §5.1
 */

import { AppShell } from '../shared/shell'

export function ProjectCollectionView() {
  return (
    <AppShell brand="Projects" layout="workspace" topbarTabs={<div />}>
      <div data-testid="project-collection-view">
        <h1>Projects</h1>
        <p>Project collection grid will appear here.</p>
      </div>
    </AppShell>
  )
}
