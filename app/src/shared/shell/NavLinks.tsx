/**
 * NavLinks — the four-endpoint nav rendered in every AppShell top bar.
 *
 * Phase 7 removed the Settings link: Settings, Theme, and About all live
 * in the brand menu now (top-left brand click). The nav has exactly four
 * links, one per appliance endpoint.
 */

import { Link } from 'react-router-dom'

export function NavLinks() {
  return (
    <nav className="topbar__nav" aria-label="Primary navigation">
      <Link to="/browser">Browser</Link>
      <Link to="/event-editor">Event Editor</Link>
      <Link to="/protocols">Protocols</Link>
      <Link to="/literature">Literature</Link>
    </nav>
  )
}
