import type { ValidationResult, LintResult } from '../types/kernel'

interface DiagnosticsPanelProps {
  validation?: ValidationResult
  lint?: LintResult
}

export function DiagnosticsPanel({ validation, lint }: DiagnosticsPanelProps) {
  const hasValidationErrors = validation && !validation.valid
  const hasLintIssues = lint && lint.diagnostics.length > 0

  if (!hasValidationErrors && !hasLintIssues) {
    return (
      <div className="diagnostics-panel diagnostics-panel--success">
        <span className="diagnostics-icon">✓</span>
        <span>No issues</span>
      </div>
    )
  }

  return (
    <div className="diagnostics-panel">
      {hasValidationErrors && (
        <section className="diagnostics-section">
          <h3 className="diagnostics-heading">Validation Errors</h3>
          <ul className="diagnostics-list">
            {validation.errors.map((error, i) => (
              <li key={i} className="diagnostic diagnostic--error">
                <code className="diagnostic-path">{error.path || '/'}</code>
                <span className="diagnostic-message">{error.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasLintIssues && (
        <section className="diagnostics-section">
          <h3 className="diagnostics-heading">Lint Diagnostics</h3>
          <ul className="diagnostics-list">
            {lint.diagnostics.map((diag, i) => (
              <li key={i} className={`diagnostic diagnostic--${diag.severity}`}>
                <span className="diagnostic-rule">[{diag.ruleId}]</span>
                {diag.path && <code className="diagnostic-path">{diag.path}</code>}
                <span className="diagnostic-message">{diag.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
