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

export class NetworkError extends Error {
  constructor(message: string = 'Network error') {
    super(message)
    this.name = 'NetworkError'
  }

  static isNetworkError(error: unknown): error is NetworkError {
    return error instanceof NetworkError
  }
}
