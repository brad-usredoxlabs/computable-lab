import type { ReactNode } from 'react'

interface BiologyModeViewProps {
  deck: ReactNode
  panes: ReactNode
  drawer?: ReactNode
  badges?: string[]
  selectedWellCount?: number
  activeContextName?: string | null
  onAssignBiology?: () => void
  onGroupWells?: () => void
  onExpectedBiology?: () => void
}

export function BiologyModeView({
  deck,
  panes,
  drawer,
}: BiologyModeViewProps) {
  return (
    <div className="biology-mode-view">
      {deck}
      {panes}
      {drawer}
      <style>{`
        .biology-mode-view {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
      `}</style>
    </div>
  )
}
