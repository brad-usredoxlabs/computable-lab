import { Link } from 'react-router-dom'

export function NavLinks() {
  return (
    <nav className="topbar__nav" aria-label="Primary navigation">
      <Link to="/labware-editor">Legacy editor</Link>
      <Link to="/browser">Browser</Link>
      <Link to="/protocol-ide">Protocol IDE</Link>
      <Link to="/settings">Settings</Link>
    </nav>
  )
}
