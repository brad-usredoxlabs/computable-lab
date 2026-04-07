export type FailureRunbookEntry = {
  failureCode: string;
  severity: 'info' | 'warning' | 'critical';
  likelyCause: string;
  recommendedActions: string[];
  vmBridgeNotes?: string[];
};

const ENTRIES: FailureRunbookEntry[] = [
  {
    failureCode: 'TIMEOUT_TEMPORARY',
    severity: 'warning',
    likelyCause: 'Instrument or bridge did not complete before runtime timeout.',
    recommendedActions: [
      'Check instrument queue depth and bridge host load.',
      'Increase timeout only after verifying protocol runtime expectation.',
      'Retry once after bridge health is green.',
    ],
    vmBridgeNotes: [
      'If using a headless VM, verify VM clock sync and that bridge service is still alive.',
    ],
  },
  {
    failureCode: 'REMOTE_RUN_NOT_SETTLED',
    severity: 'warning',
    likelyCause: 'Remote run status remained transitional.',
    recommendedActions: [
      'Run recovery reconcile cycle.',
      'Inspect external run status endpoint manually.',
      'Retry only if no external run is active.',
    ],
  },
  {
    failureCode: 'INVALID_PROTOCOL',
    severity: 'critical',
    likelyCause: 'Generated protocol/artifact is invalid for target runtime.',
    recommendedActions: [
      'Do not auto-retry.',
      'Recompile protocol and inspect emitted artifact.',
      'Run parameter validation before next execution.',
    ],
  },
  {
    failureCode: 'PROCESS_FATAL',
    severity: 'critical',
    likelyCause: 'Execution process terminated unexpectedly.',
    recommendedActions: [
      'Inspect sidecar/process crash logs.',
      'Restart bridge process and verify dependencies.',
      'Retry only after root-cause correction.',
    ],
  },
  {
    failureCode: 'GENERIC_EXECUTION_FAILURE',
    severity: 'warning',
    likelyCause: 'Non-specific execution failure.',
    recommendedActions: [
      'Check latest instrument-log artifacts.',
      'Verify adapter endpoint health.',
      'Retry with bounded attempts.',
    ],
  },
  {
    failureCode: 'RETRY_EXHAUSTED',
    severity: 'critical',
    likelyCause: 'Transient retries exceeded configured max attempts.',
    recommendedActions: [
      'Escalate to operator review.',
      'Inspect run lineage and underlying adapter health.',
      'Manually resolve or force retry only with clear remediation.',
    ],
  },
  {
    failureCode: 'UNCLASSIFIED',
    severity: 'warning',
    likelyCause: 'Failure did not match known classifier rules.',
    recommendedActions: [
      'Capture raw stderr/status payloads.',
      'Add classifier rule for this pattern.',
      'Avoid repeated blind retries.',
    ],
  },
];

export class FailureRunbookService {
  list(): FailureRunbookEntry[] {
    return ENTRIES;
  }

  get(failureCode: string): FailureRunbookEntry | null {
    return ENTRIES.find((entry) => entry.failureCode === failureCode) ?? null;
  }
}

