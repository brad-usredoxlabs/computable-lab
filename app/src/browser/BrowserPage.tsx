/**
 * `/browser` — legacy standalone route.
 *
 * The body content + AI provider was extracted to `BrowserBody` so the
 * project workspace can embed it inline (view modes inside a project).
 * `/browser` now redirects into the workspace shell; this wrapper stays
 * only for one-release backward-compat with bookmarks reached BEFORE
 * the redirect runs.
 */

import { AppShell, NavLinks } from '../shared/shell'
import { Slot } from '../extensions'
import { BrowserBody } from './BrowserBody'

export function BrowserPage() {
  return (
    <AppShell brand="Records" topbarRight={<NavLinks />}>
      <BrowserBody />
      <Slot name="chat.panel.global" />
    </AppShell>
  )
}

export default BrowserPage
