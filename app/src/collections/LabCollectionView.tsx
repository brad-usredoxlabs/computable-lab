/**
 * LabCollectionView — collection view for /lab.
 *
 * Phase 1 stub. Full category navigation is implemented in Phase 3.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §8.1
 */

import { AppShell } from '../shared/shell'

export function LabCollectionView() {
  return (
    <AppShell brand="Lab" layout="workspace" topbarTabs={<div />}>
      <div data-testid="lab-collection-view">
        <h1>Lab</h1>
        <p>Lab collection with category navigation will appear here.</p>
      </div>
    </AppShell>
  )
}
