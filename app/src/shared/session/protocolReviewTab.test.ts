/**
 * The protocol-review tab kind (plan 2026-09-19_121028, D1).
 *
 * A vendor PDF opened for protocol extraction must be a TAB, not a page swap:
 * the review surface used to render bare, which replaced the whole app surface
 * and dropped the tab strip ("it totally replaces the current run surface and
 * disappears the tab system"). The host page, the tab kind, the route and the
 * persisted-session enum are all that is needed — the same shape `pdf`,
 * `document` and `deck` tabs already use.
 */
import { describe, expect, it } from 'vitest'
import { tabPath } from '../shell/WorkspaceTabStrip'
import { stableTabId } from './tabId'
import { entityTabType, protocolReviewTabId, type WorkspaceTab } from '../../event-editor/workspace/types'

const tab: WorkspaceTab = {
  id: 'protocol-review:VPDF-1',
  kind: 'protocol-review',
  recordId: 'VPDF-1',
  title: 'ZymoBIOMICS DNA Miniprep',
}

describe('protocol-review tab', () => {
  it('routes to the review surface', () => {
    expect(tabPath(tab)).toBe('/ingestion/vendor-pdf/VPDF-1')
  })

  it('has a stable id derived from the vendor-PDF record', () => {
    expect(stableTabId(tab)).toBe('protocol-review:VPDF-1')
    expect(protocolReviewTabId('VPDF-1')).toBe('protocol-review:VPDF-1')
  })

  it('is a viewer tab (no entity colour badge)', () => {
    expect(entityTabType(tab)).toBeNull()
  })
})
