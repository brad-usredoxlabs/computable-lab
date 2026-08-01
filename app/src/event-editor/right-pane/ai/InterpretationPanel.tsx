import type { SemanticInterpretation } from './sidebarState'

export interface InterpretationPanelProps {
  interpretation: SemanticInterpretation
}

export function InterpretationPanel({ interpretation }: InterpretationPanelProps) {
  if (interpretation.operations.length === 0) {
    return (
      <div className="interpretation-panel" data-testid="interpretation-panel">
        <p className="interpretation-panel__empty">No operations parsed yet.</p>
      </div>
    )
  }

  return (
    <div className="interpretation-panel" data-testid="interpretation-panel">
      <div className="interpretation-panel__operations">
        {interpretation.operations.map((op, i) => (
          <div
            key={i}
            className={
              op.resolved
                ? 'interpretation-panel__operation'
                : 'interpretation-panel__operation interpretation-panel__operation--unresolved'
            }
          >
            <h4 className="interpretation-panel__op-type">{op.type.toUpperCase()}</h4>
            {op.target ? (
              <p className="interpretation-panel__op-target">target: {op.target}</p>
            ) : null}
            {op.material ? (
              <p className="interpretation-panel__op-material">material: {op.material}</p>
            ) : null}
            {op.parameters ? (
              <dl className="interpretation-panel__op-params">
                {Object.entries(op.parameters).map(([key, value]) => (
                  <div key={key} className="interpretation-panel__param">
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
