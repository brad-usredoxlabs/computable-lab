/**
 * WIDGET-R1 fix-run 1 (D1, A7b browser-gate defect) — the create panel's
 * lint refusal must carry the RULE ID verbatim.
 *
 * The server's lint-failure 422 body (witness, orchestrator probe :3092):
 *   { success: false,
 *     lint: { valid: false,
 *             violations: [{ ruleId: "asn-scoped-assertion-needs-context",
 *                            severity: "error",
 *                            message: "assertion '…' (scope 'comparison')
 *                            declares no context_refs — …",
 *                            path: "context_refs" }] },
 *     error: "Lint failed" }
 * ApiError ALREADY parses the top-level `lint` member (errors.ts) — what
 * was missing was the DISPLAY path: describeApiError returned `err.message`
 * (= "Lint failed") and the rule id never reached the author (gate receipt
 * shots/14-c1-refusal-state.png: banner = "Lint failed" only).
 *
 * The fix appends each lint violation as `[ruleId] message` (joined like
 * the established validation summary in ApiError.fromResponse; the
 * [ruleId] shape matches the GcEvidenceHandoff.tsx precedent) — so the
 * rendered refusal names the rule verbatim:
 *   "Lint failed: [asn-scoped-assertion-needs-context] <message>"
 *
 * RED at base (a7fbb8da): describeApiError returns the bare "Lint failed"
 * — the rule id is absent. GREEN after the lint branch in describeApiError.
 * The 403/401 special messages and the validation-branch behavior are
 * pinned UNCHANGED here.
 */
import { describe, it, expect } from 'vitest'
import { ApiError, describeApiError, NetworkError } from './errors'

/** A lint refusal exactly as the server sends it (422, RecordHandlers.ts
 *  create handler): `error: "Lint failed"` + a `lint` member with the
 *  offending rule named in the violation's `ruleId`. */
function lintRefusalError(): ApiError {
  return new ApiError({
    status: 422,
    code: 'HTTP_422',
    message: 'Lint failed',
    lint: {
      valid: false,
      violations: [
        {
          ruleId: 'asn-scoped-assertion-needs-context',
          path: 'context_refs',
          message:
            "assertion 'ASN-X' (scope 'comparison') declares no context_refs — an assertion outside a context is not testable",
        },
      ],
    },
  })
}

describe('describeApiError — lint refusal names the rule (WIDGET-R1 fix-run 1, D1)', () => {
  it('a lint refusal (valid=false + non-empty violations) appends each violation as [ruleId] message — the rule id reaches the author VERBATIM', () => {
    const out = describeApiError(lintRefusalError())
    // The original message is preserved as the lead…
    expect(out.startsWith('Lint failed')).toBe(true)
    // …and the rule id is named verbatim (the spec's acceptance criterion).
    expect(out).toContain('asn-scoped-assertion-needs-context')
    // The [ruleId] shape matches the GcEvidenceHandoff precedent.
    expect(out).toContain('[asn-scoped-assertion-needs-context]')
    // The violation's message rides along after the rule id.
    expect(out).toContain('declares no context_refs')
  })

  it('a violation with NO ruleId falls back to the bare message (ruleId stays optional)', () => {
    const err = new ApiError({
      status: 422,
      code: 'HTTP_422',
      message: 'Lint failed',
      lint: { valid: false, violations: [{ path: '$.claim', message: 'no claim text' }] },
    })
    const out = describeApiError(err)
    expect(out).toContain('Lint failed')
    expect(out).toContain('no claim text')
    // No ruleId → no bracketed id, and no "undefined" leaking into the text.
    expect(out).not.toContain('[undefined]')
  })

  it('multiple violations are each appended (joined like the validation summary)', () => {
    const err = new ApiError({
      status: 422,
      code: 'HTTP_422',
      message: 'Lint failed',
      lint: {
        valid: false,
        violations: [
          { ruleId: 'rule-a', message: 'first' },
          { ruleId: 'rule-b', message: 'second' },
        ],
      },
    })
    const out = describeApiError(err)
    expect(out).toContain('[rule-a] first')
    expect(out).toContain('[rule-b] second')
  })

  it('lint present but valid=true (or no violations) does NOT change the message — the verbatim server text stands', () => {
    const valid = new ApiError({
      status: 422,
      code: 'HTTP_422',
      message: 'Lint failed',
      lint: { valid: true, violations: [] },
    })
    expect(describeApiError(valid)).toBe('Lint failed')

    const noViolations = new ApiError({
      status: 422,
      code: 'HTTP_422',
      message: 'Lint failed',
      lint: { valid: false, violations: [] },
    })
    expect(describeApiError(noViolations)).toBe('Lint failed')
  })

  it('UNCHANGED: the 403 special message wins over any lint member (access control stays actionable)', () => {
    const err = new ApiError({
      status: 403,
      code: 'FORBIDDEN',
      message: 'FORBIDDEN: User USR-X cannot edit',
      lint: { valid: false, violations: [{ ruleId: 'rule-a', message: 'first' }] },
    })
    const out = describeApiError(err)
    expect(out).toContain("You don't have edit access here")
    expect(out).not.toContain('[rule-a]')
  })

  it('UNCHANGED: the 401 special message wins over any lint member', () => {
    const err = new ApiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'UNAUTHORIZED',
      lint: { valid: false, violations: [{ ruleId: 'rule-a', message: 'first' }] },
    })
    const out = describeApiError(err)
    expect(out).toContain('Your user could not be identified')
    expect(out).not.toContain('[rule-a]')
  })

  it('UNCHANGED: non-ApiError inputs keep their existing behavior (plain Error message / fallback)', () => {
    expect(describeApiError(new Error('boom'))).toBe('boom')
    expect(describeApiError(new NetworkError('Network error'))).toBe('Network error')
    expect(describeApiError('not an error object')).toBe('Something went wrong')
  })
})
