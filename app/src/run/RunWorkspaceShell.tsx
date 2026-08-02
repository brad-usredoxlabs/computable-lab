/**
 * RunWorkspaceShell - Unified shell for run workspace with mode toggle.
 * Provides a header with mode toggle and passes through children.
 */

import { type ReactNode } from 'react'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { ModeToggle, useModeToggle } from './lib/mode-toggle'
import './RunWorkspaceShell.css'

export interface RunWorkspaceShellProps {
  children: ReactNode
  rightPane?: ReactNode
  viewerToolbar?: ReactNode
}

export function RunWorkspaceShell({ children, rightPane, viewerToolbar }: RunWorkspaceShellProps) {
  const { mode, setMode } = useModeToggle()

  return (
    <AppShell
      brand="Run Workspace"
      topbarMiddle={<ModeToggle mode={mode} onChange={setMode} />}
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={children}
      {...(rightPane ? { rightPane } : {})}
      {...(viewerToolbar ? { viewerToolbar } : {})}
    />
  )
}
