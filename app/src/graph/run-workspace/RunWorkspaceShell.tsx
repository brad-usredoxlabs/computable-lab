import type { ReactNode } from 'react'

interface RunWorkspaceShellProps {
  header: ReactNode
  nav: ReactNode
  main: ReactNode
  rightRail: ReactNode
}

export function RunWorkspaceShell({ header, nav, main, rightRail }: RunWorkspaceShellProps) {
  return (
    <div className="run-workspace-shell">
      {header}
      <div className="run-workspace-shell__body">
        <div className="run-workspace-shell__nav">{nav}</div>
        <div className="run-workspace-shell__main">{main}</div>
        <div className="run-workspace-shell__rail">{rightRail}</div>
      </div>

      <style>{`
        .run-workspace-shell {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.25rem;
          max-width: 1600px;
          margin: 0 auto;
        }

        .run-workspace-shell__body {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr) 280px;
          gap: 1rem;
          align-items: start;
        }

        .run-workspace-shell__nav,
        .run-workspace-shell__rail,
        .run-workspace-shell__main > * {
          min-width: 0;
        }

        @media (max-width: 1180px) {
          .run-workspace-shell__body {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
