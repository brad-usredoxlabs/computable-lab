/**
 * `/literature` — legacy standalone route.
 *
 * Body content + AI provider was extracted to `LiteratureBody` so the
 * project workspace can embed it inline (view modes inside a project).
 * `/literature` now redirects into the workspace shell; this wrapper
 * stays only for one-release backward-compat with bookmarks reached
 * BEFORE the redirect runs.
 */

import { AppShell, NavLinks } from '../shared/shell'
import { Slot } from '../extensions'
import { LiteratureBody } from './LiteratureBody'

export function LiteraturePage() {
  return (
    <AppShell brand="Literature" topbarRight={<NavLinks />}>
      <LiteratureBody />
      <Slot name="chat.panel.literature" />
    </AppShell>
  )
}

export default LiteraturePage
