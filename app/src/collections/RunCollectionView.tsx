/**
 * RunCollectionView — collection view for /runs.
 *
 * Phase 1 stub. Full chronological grouping + filters is implemented in Phase 3.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §6.1
 */

import { AppShell } from '../shared/shell'

export function RunCollectionView() {
  const collectionContent = (
    <div data-testid="run-collection-view">
        <h1>Runs</h1>
        <p>Run collection with chronological grouping will appear here.</p>
      </div>
  )

  return (
    <AppShell
      brand="Runs"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}