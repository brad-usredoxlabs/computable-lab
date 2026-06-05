/**
 * `/protocols` — legacy standalone route.
 *
 * The body content + AI provider was extracted to `ProtocolsBody` so the
 * project workspace can embed it inline (view modes inside a project).
 * This file is now just the standalone wrapper that mounts AppShell +
 * the dock for the bare `/protocols` URL. The workspace mounts
 * `<ProtocolsBody />` directly when its `mode=protocols` route matches.
 *
 * `/protocols` itself now redirects into the workspace shell (see
 * legacyRouteResolution); this wrapper stays only for one-release
 * backward-compat with bookmarks reached BEFORE the redirect runs.
 */

import { AppShell, NavLinks } from '../shared/shell'
import { Slot } from '../extensions'
import { ProtocolsBody } from './ProtocolsBody'

export function ProtocolsPage() {
  return (
    <AppShell brand="Protocols" topbarRight={<NavLinks />}>
      <ProtocolsBody />
      <Slot name="chat.panel.global" />
    </AppShell>
  )
}

export default ProtocolsPage
