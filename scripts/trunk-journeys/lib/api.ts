/**
 * trunk-journeys — API client (REAL transport).
 *
 * A thin, typed fetch wrapper for the harness's API legs (seed + api-expect).
 * It talks to the harness's OWN backend over HTTP with the bootstrap system
 * admin identity (x-user-id: USR-LOCAL-ADMIN — the fresh throwaway dir's only
 * active user while no credential exists, so the bootstrap window stays open).
 *
 * It NEVER touches /api/ai/** (the journeys do not call AI; the self-check
 * enforces that). Fail CLOSED: any non-2xx throws with the status + body so
 * the receipt carries the exact server refusal (a product gap = BLOCKED with
 * this evidence, never a swallowed failure).
 */

export const SYSTEM_ADMIN_USER = 'USR-LOCAL-ADMIN';

export class ApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${method} ${path} -> HTTP ${status}: ${JSON.stringify(body ?? null)}`);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** identity header (defaults to the bootstrap system admin) */
  user?: string;
  /** raw (non-JSON) request body */
  rawBody?: string;
  contentType?: string;
}

/** One typed API call against the harness backend (real transport). */
export async function apiCall(
  backend: string,
  path: string,
  opts: ApiOptions = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    'x-user-id': opts.user ?? SYSTEM_ADMIN_USER,
  };
  let bodyText: string | undefined;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    bodyText = JSON.stringify(opts.body);
  } else if (opts.rawBody !== undefined) {
    headers['content-type'] = opts.contentType ?? 'application/json';
    bodyText = opts.rawBody;
  }
  const res = await fetch(`${backend}${path}`, { method, headers, body: bodyText });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(method, path, res.status, json);
  }
  return { status: res.status, json, text };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asRef = (v: unknown): { id?: string; type?: string; kind?: string } =>
  v && typeof v === 'object'
    ? {
        id: typeof (v as Record<string, unknown>).id === 'string' ? ((v as Record<string, unknown>).id as string) : undefined,
        type: typeof (v as Record<string, unknown>).type === 'string' ? ((v as Record<string, unknown>).type as string) : undefined,
        kind: typeof (v as Record<string, unknown>).kind === 'string' ? ((v as Record<string, unknown>).kind as string) : undefined,
      }
    : {};

/** POST /records — create a record (schemaId + payload). */
export async function createRecord(
  backend: string,
  schemaId: string,
  payload: Record<string, unknown>,
  message = 'trunk-journeys seed',
): Promise<{ recordId: string; payload: Record<string, unknown> }> {
  const { json } = await apiCall(backend, '/api/records', {
    method: 'POST',
    body: { schemaId, payload, message },
  });
  const record = asRecord(asRecord(json).record);
  const recordId = typeof asRecord(json).recordId === 'string' ? (asRecord(json).recordId as string) : (record.recordId as string | undefined);
  if (!recordId) throw new ApiError('POST', '/api/records', 200, json);
  return { recordId, payload: asRecord(record.payload) };
}

/** GET /records/:id — read a record envelope. */
export async function getRecord(backend: string, id: string): Promise<Record<string, unknown>> {
  const { json } = await apiCall(backend, `/api/records/${encodeURIComponent(id)}`);
  return asRecord(json);
}

/** PUT /records/:id — update a record payload. */
export async function updateRecord(
  backend: string,
  id: string,
  payload: Record<string, unknown>,
  message = 'trunk-journeys update',
): Promise<void> {
  await apiCall(backend, `/api/records/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { payload, message },
  });
}

/** GET /records?kind=<k> — list records of a kind. */
export async function listByKind(backend: string, kind: string, limit = 500): Promise<Array<{ recordId: string; payload: Record<string, unknown> }>> {
  const { json } = await apiCall(backend, `/api/records?kind=${encodeURIComponent(kind)}&limit=${limit}`);
  const records = Array.isArray(asRecord(json).records) ? (asRecord(json).records as unknown[]) : [];
  return records.map((r) => {
    const env = asRecord(r);
    return { recordId: typeof env.recordId === 'string' ? env.recordId : '', payload: asRecord(env.payload) };
  });
}

/** POST /analysis-revisions — create a revision (the service mints the id). */
export async function createAnalysisRevision(
  backend: string,
  body: {
    title: string;
    entryScript: string;
    sdkVersion: string;
    description?: string;
    methodNotes?: string;
    inputs?: Array<{ name: string; dataKind: string; required?: boolean; description?: string }>;
    parameterSchema?: Record<string, unknown>;
    engineRef?: { kind: 'record'; type: 'analysis-engine'; id: string };
    requiredCapabilities?: string[];
  },
): Promise<{ recordId: string }> {
  const { json } = await apiCall(backend, '/api/analysis-revisions', { method: 'POST', body });
  const recordId = runIdFromCreate(json);
  if (!recordId) throw new ApiError('POST', '/api/analysis-revisions', 200, json);
  return { recordId };
}

/** GET /analysis-runs/:id — read an analysis-run envelope. */
export async function getAnalysisRun(backend: string, id: string): Promise<Record<string, unknown>> {
  const { json } = await apiCall(backend, `/api/analysis-runs/${encodeURIComponent(id)}`);
  const record = asRecord(json).record;
  return record && typeof record === 'object' ? asRecord(record) : asRecord(json);
}

/** POST /analysis-runs/:id/execute — execute a run (real transport). */
export async function executeRun(backend: string, id: string): Promise<Record<string, unknown>> {
  const { json } = await apiCall(backend, `/api/analysis-runs/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    body: {},
  });
  return asRecord(json);
}

/** GET /acquisition-packages/:id/analysis-inputs — verify-first pinned inputs. */
export async function getPackageAnalysisInputs(backend: string, packageId: string): Promise<Record<string, unknown>> {
  const { json } = await apiCall(backend, `/api/acquisition-packages/${encodeURIComponent(packageId)}/analysis-inputs`, {
    method: 'POST',
    body: {},
  });
  return asRecord(json);
}

/** GET /config — read the live config (storage devices, etc.). */
export async function getConfig(backend: string): Promise<Record<string, unknown>> {
  const { json } = await apiCall(backend, '/api/config', { method: 'GET' });
  return asRecord(json);
}

/** The analysis-run record id from a create-run response. */
export function runIdFromCreate(json: unknown): string | undefined {
  const r = asRecord(json);
  return typeof r.recordId === 'string' ? r.recordId : undefined;
}

/** Extract a run's status string from its envelope/payload. */
export function runStatus(run: Record<string, unknown>): string | undefined {
  const p = asRecord(run.payload ?? run);
  return typeof p.status === 'string' ? p.status : undefined;
}

/** The ref id of an acquisition package on an entry payload. */
export function entryAcqPkgId(entry: Record<string, unknown>): string | undefined {
  return asRef(entry.acquisitionPackageRef).id;
}

/** The analysis-run refs (ordered) on an entry payload. */
export function entryAnalysisRunRefs(entry: Record<string, unknown>): string[] {
  const arr = entry.analysisRunRefs;
  if (!Array.isArray(arr)) return [];
  return arr.map((r) => asRef(r).id).filter((x): x is string => typeof x === 'string');
}
