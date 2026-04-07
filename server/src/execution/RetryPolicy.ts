export type FailureClass = 'transient' | 'terminal' | 'unknown';

export type RetryPolicyResult = {
  failureClass: FailureClass;
  retryRecommended: boolean;
  failureCode: string;
  reason: string;
};

type ClassifyInput = {
  mode?: string;
  exitCode?: number;
  statusRaw?: string;
  stderr?: string;
};

export function classifyExecutionFailure(input: ClassifyInput): RetryPolicyResult {
  const mode = (input.mode ?? '').toLowerCase();
  const status = (input.statusRaw ?? '').toLowerCase();
  const stderr = (input.stderr ?? '').toLowerCase();
  const exitCode = input.exitCode;

  if (status.includes('timeout') || stderr.includes('timeout') || stderr.includes('temporar')) {
    return { failureClass: 'transient', retryRecommended: true, failureCode: 'TIMEOUT_TEMPORARY', reason: 'timeout_or_temporary' };
  }
  if (mode.includes('opentrons') && (status.includes('queued') || status.includes('running'))) {
    return { failureClass: 'transient', retryRecommended: true, failureCode: 'REMOTE_RUN_NOT_SETTLED', reason: 'remote_run_not_settled' };
  }
  if (typeof exitCode === 'number' && exitCode >= 128) {
    return { failureClass: 'terminal', retryRecommended: false, failureCode: 'PROCESS_FATAL', reason: 'process_signal_or_fatal' };
  }
  if (stderr.includes('invalid') || stderr.includes('schema') || stderr.includes('syntax')) {
    return { failureClass: 'terminal', retryRecommended: false, failureCode: 'INVALID_PROTOCOL', reason: 'invalid_protocol_or_payload' };
  }
  if (status.includes('failed') || status.includes('error') || (typeof exitCode === 'number' && exitCode > 0)) {
    return { failureClass: 'transient', retryRecommended: true, failureCode: 'GENERIC_EXECUTION_FAILURE', reason: 'generic_execution_failure' };
  }
  return { failureClass: 'unknown', retryRecommended: false, failureCode: 'UNCLASSIFIED', reason: 'unclassified' };
}
