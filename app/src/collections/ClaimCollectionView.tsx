/**
 * ClaimCollectionView — collection view for /claims.
 *
 * Phase 1 stub. Full operational views with status filters is implemented in Phase 3.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §7.1
 */

import { AppShell } from '../shared/shell'

export function ClaimCollectionView() {
  const collectionContent = (
    <div data-testid="claim-collection-view">
        <h1>Claims</h1>
        <p>Claim collection with operational views will appear here.</p>
      </div>
  )

  return (
    <AppShell
      brand="Claims"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}