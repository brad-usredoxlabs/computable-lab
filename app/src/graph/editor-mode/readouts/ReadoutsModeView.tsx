import type { ReactNode } from 'react'

interface ReadoutsModeViewProps {
  deck: ReactNode
  panes: ReactNode
  drawer?: ReactNode
  badges?: string[]
}

export function ReadoutsModeView({
  deck,
  panes,
  drawer,
}: ReadoutsModeViewProps) {
  return (
    <div className="readouts-mode-view">
      {deck}
      {panes}
      {drawer}

      <style>{`
        .readouts-mode-view {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
      `}</style>
    </div>
  )
}
