/**
 * Structured API error handling.
 * The UI surfaces server error messages verbatim.
 */

export interface ApiErrorData {
  status: number
  code: string
  message: string
  details?: unknown
  validation?: {
    valid: boolean
    errors: Array<{ path: string; message: string; keyword?: string }>
  }
  lint?: {
    valid: boolean
    violations: Array<{ path?: string; message: string; ruleId?: string }>
  }
}

export class ApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details?: unknown
  public readonly validation?: ApiErrorData['validation']
  public readonly lint?: ApiErrorData['lint']

  constructor(data: ApiErrorData) {
    super(data.message)
    this.name = 'ApiError'
    this.status = data.status
    this.code = data.code
    this.details = data.details
    this.validation = data.validation
    this.lint = data.lint
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = null
    }

    const bodyObj = body as Record<string, unknown> | null
    
    // Server returns 'error' field for error messages
    const errorCode = bodyObj?.error as string | undefined
    const errorText = bodyObj?.message as string | undefined
    
    // Build message including validation errors if present
    let message = errorCode || errorText || response.statusText || 'Unknown error'
    if (errorCode && errorText && errorCode !== errorText) {
      message = `${errorCode}: ${errorText}`
    }
    const validation = bodyObj?.validation as ApiErrorData['validation']
    if (validation && !validation.valid && validation.errors.length > 0) {
      const errorSummary = validation.errors
        .map(e => `${e.path}: ${e.message}`)
        .join('; ')
      message = `${message}: ${errorSummary}`
    }

    const data: ApiErrorData = {
      status: response.status,
      code: bodyObj?.code as string || `HTTP_${response.status}`,
      message,
      details: bodyObj?.details,
      validation,
      lint: bodyObj?.lint as ApiErrorData['lint'],
    }

    return new ApiError(data)
  }
}

/**
 * Turn an API error into a user-facing message. Access-control failures (403,
 * and the 401 "unknown user" case) get a friendly, actionable hint instead of
 * the raw server text like "FORBIDDEN: User USR-… cannot add child records
 * under STU-…", which reads as a crash. Everything else is surfaced verbatim.
 *
 * WIDGET-R1 fix-run 1 (D1, A7b browser-gate defect): a lint refusal (the
 * server's 422 `{ lint: { valid: false, violations: [{ ruleId, message, … }] },
 * error: "Lint failed" }` body) was rendered as the bare string "Lint failed"
 * — the offending RULE never reached the author. The ApiError already parses
 * the top-level `lint` member; this display path appends each violation as
 * `[ruleId] message` (joined like the validation summary built in
 * `ApiError.fromResponse`; the `[ruleId]` shape matches the
 * GcEvidenceHandoff.tsx precedent) so the rendered refusal names the rule
 * verbatim — e.g. "Lint failed: [asn-scoped-assertion-needs-context] …".
 * `ruleId` stays optional: a violation without one renders its bare message.
 * The 403/401 special messages return first and are UNCHANGED.
 */
export function describeApiError(err: unknown): string {
  if (ApiError.isApiError(err)) {
    if (err.status === 403) {
      return "You don't have edit access here — this project belongs to another user. Switch user (top-right) or ask the owner to share it with you."
    }
    if (err.status === 401) {
      return 'Your user could not be identified. Pick a user from the switcher (top-right) and try again.'
    }
    let message = err.message
    if (err.lint && !err.lint.valid && err.lint.violations.length > 0) {
      const lintSummary = err.lint.violations
        .map(v => `${v.ruleId !== undefined ? `[${v.ruleId}] ` : ''}${v.message}`)
        .join('; ')
      message = `${message}: ${lintSummary}`
    }
    return message
  }
  if (NetworkError.isNetworkError(err)) return err.message
  return err instanceof Error ? err.message : 'Something went wrong'
}

export class NetworkError extends Error {
  constructor(message: string = 'Network error') {
    super(message)
    this.name = 'NetworkError'
  }

  static isNetworkError(error: unknown): error is NetworkError {
    return error instanceof NetworkError
  }
}
