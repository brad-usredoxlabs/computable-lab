import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { SplashPage } from './SplashPage'

export function SplashRoute() {
  return (
    <AppShell
      brand="New Tab"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={<SplashPage />}
    />
  )
}
