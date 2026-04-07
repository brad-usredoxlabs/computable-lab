import type { ReactNode } from 'react'

interface PlanModeViewProps {
  deck: ReactNode
  ribbon: ReactNode
  panes: ReactNode
  supplemental?: ReactNode
}

export function PlanModeView({ deck, ribbon, panes, supplemental }: PlanModeViewProps) {
  return (
    <div className="plan-mode-view">
      <div className="plan-mode-view__deck">{deck}</div>
      <div className="plan-mode-view__ribbon">{ribbon}</div>
      <div className="plan-mode-view__panes">{panes}</div>
      {supplemental ? <div className="plan-mode-view__supplemental">{supplemental}</div> : null}

      <style>{`
        .plan-mode-view {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .plan-mode-view__deck,
        .plan-mode-view__ribbon,
        .plan-mode-view__panes,
        .plan-mode-view__supplemental {
          width: 100%;
        }

        .plan-mode-view__ribbon {
          position: relative;
          z-index: 1;
        }

        .plan-mode-view__panes {
          min-height: 0;
        }
      `}</style>
    </div>
  )
}
