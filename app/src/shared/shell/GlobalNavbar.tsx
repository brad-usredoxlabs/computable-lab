/**
 * GlobalNavbar — persistent top-level navigation bar with 4 primary
 * destinations (Projects, Runs, Claims, Lab), global search, and
 * create menu. Sits above the workspace tab strip in the AppShell.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 *
 * Recommended complete header:
 *   [Computable Lab]  Projects  Runs  Claims  Lab  [Find anything…]  [+ Create]  [User] [Settings]
 */

import { useNavigate, useLocation } from 'react-router-dom'
import { SettingsMenuButton } from '../../event-editor/projects/SettingsMenuButton'
import { UserSwitcher } from './UserSwitcher'
import { GlobalSearchBar } from './GlobalSearchBar'
import { CreateMenu } from './CreateMenu'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { collectionTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import './GlobalNavbar.css'

type PrimaryDestination = 'projects' | 'runs' | 'claims' | 'lab'

const DESTINATIONS: { id: PrimaryDestination; label: string; path: string }[] = [
  { id: 'projects', label: 'Projects', path: '/projects' },
  { id: 'runs', label: 'Runs', path: '/runs' },
  { id: 'claims', label: 'Claims', path: '/claims' },
  { id: 'lab', label: 'Lab', path: '/lab' },
]

export function GlobalNavbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const openTabs = useOptionalOpenTabs()

  // Determine active destination from URL. /project/:studyId also
  // counts as "projects" active since it's a project workspace.
  const activeDest = DESTINATIONS.find((d) =>
    location.pathname === d.path || location.pathname.startsWith(d.path + '/'),
  ) ?? (location.pathname.startsWith('/project/') ? DESTINATIONS[0] : null)

  const handleDestination = (dest: { id: string; path: string; label: string }) => {
    if (openTabs) {
      // Inside workspace — open as a collection tab AND navigate
      const tab: WorkspaceTab = {
        id: collectionTabId(dest.id),
        kind: 'collection',
        collection: dest.id as 'projects' | 'runs' | 'claims' | 'lab',
        title: dest.label,
      }
      openTabs.openTab(tab, true)
      navigate(dest.path)
    } else {
      // Standalone — navigate normally
      navigate(dest.path)
    }
  }

  return (
    <div className="global-navbar" data-testid="global-navbar">
      <button
        type="button"
        className="global-navbar__brand"
        onClick={() => navigate('/projects')}
      >
        <span className="global-navbar__brand-text">Computable Lab</span>
      </button>
      <nav className="global-navbar__destinations" role="navigation">
        {DESTINATIONS.map((dest) => (
          <button
            key={dest.id}
            type="button"
            className={
              activeDest?.id === dest.id
                ? 'global-navbar__dest global-navbar__dest--active'
                : 'global-navbar__dest'
            }
            data-testid={`global-nav-${dest.id}`}
            onClick={() => handleDestination(dest)}
          >
            {dest.label}
          </button>
        ))}
      </nav>
      <div className="global-navbar__search">
        <GlobalSearchBar />
      </div>
      <div className="global-navbar__actions">
        <CreateMenu />
      </div>
      <div className="global-navbar__trailing">
        <UserSwitcher />
        <SettingsMenuButton />
      </div>
    </div>
  )
}
