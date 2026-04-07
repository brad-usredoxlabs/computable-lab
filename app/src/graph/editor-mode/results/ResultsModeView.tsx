import type { ReactNode } from 'react'

interface ResultsModeViewProps {
  deck: ReactNode
  panes: ReactNode
  drawer?: ReactNode
  badges?: string[]
}

export function ResultsModeView({
  deck,
  panes,
  drawer,
}: ResultsModeViewProps) {
  return (
    <div className="results-mode-view">
      {deck}
      {panes}
      {drawer}

      <style>{`
        .results-mode-view {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
      `}</style>
    </div>
  )
}
