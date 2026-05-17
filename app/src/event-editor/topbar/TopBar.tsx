import { DeckModeSwitcher } from './DeckModeSwitcher'
import { VocabSwitcher } from './VocabSwitcher'
import { ToolSwitcher } from './ToolSwitcher'
import { TipChip } from './TipChip'
import { NavLinks } from './NavLinks'
import { ThemeToggle } from './ThemeToggle'

export function TopBar() {
  return (
    <header className="topbar">
      <span className="topbar__brand">Event Editor</span>
      <span className="topbar__divider" />
      <div className="topbar__group">
        <DeckModeSwitcher />
        <VocabSwitcher />
        <ToolSwitcher />
        <TipChip />
      </div>
      <span className="topbar__spacer" />
      <ThemeToggle />
      <NavLinks />
    </header>
  )
}
