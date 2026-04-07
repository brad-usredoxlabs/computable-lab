import type { ReactNode } from 'react'

interface EditorModeShellProps {
  header: ReactNode
  children: ReactNode
  drawer?: ReactNode
}

export function EditorModeShell({ header, children, drawer }: EditorModeShellProps) {
  return (
    <div className="editor-mode-shell">
      {header}
      <div className="editor-mode-shell__body">{children}</div>
      {drawer}

      <style>{`
        .editor-mode-shell {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .editor-mode-shell__body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
      `}</style>
    </div>
  )
}
