import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RunWorkspaceShell } from './RunWorkspaceShell'

// Stub the shared-shell barrel so this test can observe what RunWorkspaceShell
// forwards to AppShell without rendering the real chrome (useTheme, viewport,
// tabs, etc.). RunWorkspaceShell only uses AppShell + WorkspaceTabStrip from it.
const appShellProps: { props: Record<string, unknown> } = { props: {} }
vi.mock('../shared/shell', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    AppShell: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
      appShellProps.props = props
      return <div data-testid="app-shell">{children}</div>
    },
    WorkspaceTabStrip: () => <div data-testid="tab-strip" />,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RunWorkspaceShell (three-pane forwarding)', () => {
  it('forwards distinct navPane / leftPane / rightPane slots to AppShell', () => {
    const nav = <div data-testid="navpane" />
    const action = <div data-testid="actionpane" />
    const chat = <div data-testid="chatpane" />
    render(
      <RunWorkspaceShell navPane={nav} rightPane={chat}>
        {action}
      </RunWorkspaceShell>,
    )

    expect(appShellProps.props.navPane).toBe(nav)
    expect(appShellProps.props.leftPane).toBe(action)
    expect(appShellProps.props.rightPane).toBe(chat)
    // The three slots must be distinct element references (nav != action != chat).
    expect(appShellProps.props.navPane).not.toBe(appShellProps.props.leftPane)
    expect(appShellProps.props.leftPane).not.toBe(appShellProps.props.rightPane)
    expect(appShellProps.props.navPane).not.toBe(appShellProps.props.rightPane)
  })
})
