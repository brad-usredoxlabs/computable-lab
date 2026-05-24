/**
 * `/settings` — Phase 7 follow-up.
 *
 * Settings is a proper page in the new UI: a routable URL with deep-link
 * and browser-back behaviour, rendered inside the same `AppShell` chrome
 * as the four appliance endpoints. It stays off-nav (per plan §12) — the
 * only way to reach it is from the brand menu's "Settings" item, which
 * navigates here instead of opening a modal overlay.
 *
 * The existing 610-line `SettingsPage` form lives untouched under
 * `app/src/shell/SettingsPage.tsx`; this route just gives it the shell
 * around it.
 */

import { AppShell, NavLinks } from '../shared/shell'
import { SettingsPage } from '../shell/SettingsPage'

export function SettingsRoute() {
  return (
    <AppShell brand="Settings" topbarRight={<NavLinks />}>
      <div className="cl-settings">
        <SettingsPage />
      </div>
      <style>{`
        .cl-settings {
          min-height: 0;
          overflow: auto;
          background: var(--cl-bg);
        }
      `}</style>
    </AppShell>
  )
}

export default SettingsRoute
