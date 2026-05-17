import type { InstrumentRunFile } from './InstrumentRunFile.js';

export const GEMINI_EM_ADAPTER_ID = 'molecular_devices_gemini';
export const GEMINI_EM_OPERATION = 'active_read';

export type GeminiEmAdapterId = typeof GEMINI_EM_ADAPTER_ID;
export type GeminiEmOperation = typeof GEMINI_EM_OPERATION;

export type GeminiEmReadMode = 'fluorescence' | 'absorbance' | 'luminescence';

export interface GeminiEmActiveReadParameters {
  simulate?: boolean;
  mode?: GeminiEmReadMode;
  wavelengthNm?: number;
  integrationMs?: number;
}

export interface GeminiEmActiveReadRequest {
  adapterId: GeminiEmAdapterId;
  instrumentRef?: Record<string, unknown>;
  outputPath?: string;
  parameters: GeminiEmActiveReadParameters;
}

export interface InstrumentApplianceJob {
  kind: 'instrument-appliance-job';
  jobId: string;
  adapterId: GeminiEmAdapterId;
  operation: GeminiEmOperation;
  instrument: string;
  request: GeminiEmActiveReadRequest;
  sourceRunFile: InstrumentRunFile;
  executionReadiness?: InstrumentExecutionReadiness;
}

export type InstrumentExecutionMode = 'simulate' | 'live';

export interface InstrumentExecutionReadinessBlocker {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface InstrumentExecutionReadiness {
  jobId: string;
  status: 'ready' | 'blocked';
  executionMode?: InstrumentExecutionMode;
  requiresConfirmation: boolean;
  blockers: InstrumentExecutionReadinessBlocker[];
}

export type InstrumentApplianceExecutionStatus =
  | 'blocked'
  | 'rejected'
  | 'completed'
  | 'failed';

export interface InstrumentApplianceExecutionRecord {
  kind: 'instrument-appliance-execution-record';
  executionId: string;
  jobId: string;
  adapterId: GeminiEmAdapterId;
  operation: GeminiEmOperation;
  instrument: string;
  status: InstrumentApplianceExecutionStatus;
  requestedAt: string;
  completedAt: string;
  readiness: InstrumentExecutionReadiness;
  confirmation: {
    required: boolean;
    confirmed: boolean;
  };
  job: InstrumentApplianceJob;
  result?: {
    measurementId?: string;
    logId?: string;
    rawDataPath?: string;
  };
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
}

const GEMINI_EM_INSTRUMENT_ALIASES = new Set([
  'gemini em plate reader',
  'gemini em',
  'molecular devices gemini em',
]);

function normalizeInstrumentName(instrument: string): string {
  return instrument.trim().toLowerCase().replace(/\s+/g, ' ');
}

function instrumentRecordId(instrument: string): string {
  const slug = normalizeInstrumentName(instrument)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `instrument/${slug || 'gemini-em'}`;
}

export function isGeminiEmInstrument(instrument: string): boolean {
  return GEMINI_EM_INSTRUMENT_ALIASES.has(normalizeInstrumentName(instrument));
}

export function createGeminiEmActiveReadJob(
  runFile: InstrumentRunFile,
  runFileIndex: number,
  parameters?: GeminiEmActiveReadParameters,
): InstrumentApplianceJob {
  const ordinal = runFileIndex + 1;
  const jobId = `gemini-em-active-read-${ordinal}`;
  const requestParameters = parameters ?? geminiParametersFromRunFile(runFile);
  return {
    kind: 'instrument-appliance-job',
    jobId,
    adapterId: GEMINI_EM_ADAPTER_ID,
    operation: GEMINI_EM_OPERATION,
    instrument: runFile.instrument,
    request: {
      adapterId: GEMINI_EM_ADAPTER_ID,
      instrumentRef: {
        kind: 'record',
        id: instrumentRecordId(runFile.instrument),
        type: 'instrument',
      },
      outputPath: `records/inbox/${jobId}.csv`,
      parameters: requestParameters,
    },
    sourceRunFile: runFile,
  };
}

export function evaluateInstrumentExecutionReadiness(
  job: InstrumentApplianceJob,
): InstrumentExecutionReadiness {
  const blockers: InstrumentExecutionReadinessBlocker[] = [];
  const parameters = job.request.parameters ?? {};
  const executionMode = typeof parameters.simulate === 'boolean'
    ? parameters.simulate ? 'simulate' : 'live'
    : undefined;

  if (job.kind !== 'instrument-appliance-job') {
    blockers.push({ code: 'bad_job_kind', message: 'Job kind must be instrument-appliance-job.' });
  }
  if (job.adapterId !== GEMINI_EM_ADAPTER_ID || job.request.adapterId !== GEMINI_EM_ADAPTER_ID) {
    blockers.push({ code: 'unsupported_adapter', message: 'Only molecular_devices_gemini jobs are currently executable.' });
  }
  if (job.operation !== GEMINI_EM_OPERATION) {
    blockers.push({ code: 'unsupported_operation', message: 'Only active_read jobs are currently executable.' });
  }
  if (!job.request.instrumentRef) {
    blockers.push({ code: 'missing_instrument_ref', message: 'Job request must include an instrumentRef.' });
  }
  if (!Array.isArray(job.sourceRunFile.wells) || job.sourceRunFile.wells.length === 0) {
    blockers.push({ code: 'missing_wells', message: 'Gemini EM jobs must include explicit wells.' });
  }
  const invalidWells = (job.sourceRunFile.wells ?? [])
    .map((entry) => entry.well)
    .filter((well) => !is96WellAddress(well));
  if (invalidWells.length > 0) {
    blockers.push({
      code: 'invalid_wells',
      message: 'Gemini EM jobs contain wells outside a 96-well plate address range.',
      details: { invalidWells },
    });
  }
  if (!executionMode) {
    blockers.push({
      code: 'missing_execution_mode',
      message: 'Execution mode must be explicit: set request.parameters.simulate to true or false.',
    });
  }
  if (!parameters.mode) {
    blockers.push({ code: 'missing_read_mode', message: 'Gemini EM read mode is required before execution.' });
  }
  if (
    (parameters.mode === 'fluorescence' || parameters.mode === 'absorbance')
    && typeof parameters.wavelengthNm !== 'number'
  ) {
    blockers.push({
      code: 'missing_wavelength',
      message: 'Fluorescence and absorbance Gemini EM reads require wavelengthNm.',
    });
  }

  return {
    jobId: job.jobId,
    status: blockers.length > 0 ? 'blocked' : 'ready',
    ...(executionMode ? { executionMode } : {}),
    requiresConfirmation: executionMode === 'live',
    blockers,
  };
}

function is96WellAddress(well: string): boolean {
  const match = well.match(/^([A-H])([1-9]|1[0-2])$/);
  return !!match;
}

function geminiParametersFromRunFile(runFile: InstrumentRunFile): GeminiEmActiveReadParameters {
  const raw = runFile.runParameters ?? {};
  const parameters: GeminiEmActiveReadParameters = {};
  if (typeof raw['simulate'] === 'boolean') {
    parameters.simulate = raw['simulate'];
  }
  if (raw['mode'] === 'fluorescence' || raw['mode'] === 'absorbance' || raw['mode'] === 'luminescence') {
    parameters.mode = raw['mode'];
  }
  if (typeof raw['wavelengthNm'] === 'number') {
    parameters.wavelengthNm = raw['wavelengthNm'];
  }
  if (typeof raw['integrationMs'] === 'number') {
    parameters.integrationMs = raw['integrationMs'];
  }
  return parameters;
}
