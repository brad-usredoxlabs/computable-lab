/**
 * RunWorkspaceShell - Unified shell for run workspace with mode toggle.
 * Provides a header with mode toggle and passes through children.
 */

import { type ReactNode } from 'react'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import './RunWorkspaceShell.css'

export interface RunWorkspaceShellProps {
  children: ReactNode
  rightPane?: ReactNode
  viewerToolbar?: ReactNode
}

export function RunWorkspaceShell({ children, rightPane, viewerToolbar }: RunWorkspaceShellProps) {
  return (
    <AppShell
      brand="Run Workspace"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={children}
      {...(rightPane ? { rightPane } : {})}
      {...(viewerToolbar ? { viewerToolbar } : {})}
    />
  )
}
