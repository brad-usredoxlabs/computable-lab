import { readFile } from 'node:fs/promises';

export type FoundryAcquisitionStructuredStatus =
  | 'ready_for_review'
  | 'blocked'
  | 'incomplete';

export interface FoundryAcquisitionArtifactRef {
  kind: string;
  path: string;
  label?: string;
  status?: string;
  tool?: string;
}

export interface FoundryAcquisitionRecordRef {
  kind: string;
  recordId: string;
  path?: string;
  status?: string;
  tool?: string;
}

export interface FoundryAcquisitionBlocker {
  code: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
  field?: string;
  tool?: string;
  details?: Record<string, unknown>;
}

export interface FoundryAcquisitionToolRunSummary {
  tool: string;
  ok: boolean;
  kind?: string;
  status?: string;
  artifactPaths: string[];
  recordIds: string[];
}

export interface FoundryAcquisitionStructuredResult {
  status: FoundryAcquisitionStructuredStatus;
  nextAction: string;
  artifacts: FoundryAcquisitionArtifactRef[];
  records: FoundryAcquisitionRecordRef[];
  blockers: FoundryAcquisitionBlocker[];
  toolRuns: FoundryAcquisitionToolRunSummary[];
}

export interface BuildFoundryAcquisitionStructuredResultInput {
  tracePath?: string;
  finalText?: string;
}

interface ToolTraceEntry {
  type?: unknown;
  tool?: unknown;
  result?: unknown;
}

interface ToolExecutionTrace {
  ok?: unknown;
  content?: unknown;
}

export async function buildFoundryAcquisitionStructuredResult(
  input: BuildFoundryAcquisitionStructuredResultInput,
): Promise<FoundryAcquisitionStructuredResult> {
  const accumulator = emptyAccumulator();
  if (input.tracePath) {
    const entries = await readTraceEntries(input.tracePath).catch(() => []);
    for (const entry of entries) {
      collectToolTraceEntry(accumulator, entry);
    }
  }

  const status = accumulator.blockers.some((blocker) => blocker.severity === 'error' || !blocker.severity)
    ? 'blocked'
    : accumulator.artifacts.length > 0 || accumulator.records.length > 0
      ? 'ready_for_review'
      : 'incomplete';

  return {
    status,
    nextAction: nextActionFor(status),
    artifacts: dedupeArtifacts(accumulator.artifacts),
    records: dedupeRecords(accumulator.records),
    blockers: accumulator.blockers,
    toolRuns: accumulator.toolRuns,
  };
}

function emptyAccumulator(): {
  artifacts: FoundryAcquisitionArtifactRef[];
  records: FoundryAcquisitionRecordRef[];
  blockers: FoundryAcquisitionBlocker[];
  toolRuns: FoundryAcquisitionToolRunSummary[];
} {
  return {
    artifacts: [],
    records: [],
    blockers: [],
    toolRuns: [],
  };
}

async function readTraceEntries(path: string): Promise<ToolTraceEntry[]> {
  const text = await readFile(path, 'utf-8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ToolTraceEntry];
      } catch {
        return [];
      }
    });
}

function collectToolTraceEntry(
  accumulator: ReturnType<typeof emptyAccumulator>,
  entry: ToolTraceEntry,
): void {
  if (entry.type !== 'tool_result' || typeof entry.tool !== 'string') return;
  const execution = asToolExecution(entry.result);
  if (!execution) return;

  const tool = entry.tool;
  const parsed = parseJsonObject(execution.content);
  if (!execution.ok) {
    accumulator.blockers.push({
      code: 'tool_failed',
      severity: 'error',
      message: execution.content.slice(0, 500) || `${tool} failed`,
      tool,
    });
  }

  const kind = typeof parsed?.['kind'] === 'string' ? parsed['kind'] : undefined;
  const status = typeof parsed?.['status'] === 'string' ? parsed['status'] : undefined;
  const artifactPaths = collectArtifactPaths(parsed);
  const recordIds = collectRecordIds(parsed);
  accumulator.toolRuns.push({
    tool,
    ok: execution.ok,
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    artifactPaths,
    recordIds,
  });

  if (!parsed) return;
  collectKnownArtifacts(accumulator.artifacts, tool, parsed);
  collectKnownRecords(accumulator.records, tool, parsed);
  collectKnownBlockers(accumulator.blockers, tool, parsed);
}

function asToolExecution(value: unknown): { ok: boolean; content: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const execution = value as ToolExecutionTrace;
  if (typeof execution.content !== 'string') return undefined;
  return {
    ok: execution.ok === true,
    content: execution.content,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function collectKnownArtifacts(
  artifacts: FoundryAcquisitionArtifactRef[],
  tool: string,
  result: Record<string, unknown>,
): void {
  const kind = stringValue(result['kind']) ?? tool;
  const status = stringValue(result['status']);
  const label = labelFor(kind, result);
  addArtifact(artifacts, {
    kind,
    path: stringValue(result['relativePath']) ?? stringValue(result['artifactPath']),
    tool,
    ...(label ? { label } : {}),
    ...(status ? { status } : {}),
  });
  addArtifact(artifacts, {
    kind: `${kind}-sidecar`,
    path: stringValue(result['sidecarPath']),
    label: 'Promotion/provenance sidecar',
    tool,
    ...(status ? { status } : {}),
  });
  addArtifact(artifacts, {
    kind,
    path: stringValue(result['candidatePath']) ?? stringValue(result['draftPath']) ?? stringValue(result['outputPath']),
    tool,
    ...(label ? { label } : {}),
    ...(status ? { status } : {}),
  });
}

function collectKnownRecords(
  records: FoundryAcquisitionRecordRef[],
  tool: string,
  result: Record<string, unknown>,
): void {
  const kind = stringValue(result['kind']) ?? tool;
  const status = stringValue(result['status']);
  const recordId = stringValue(result['recordId'])
    ?? stringValue(asRecord(result['draftDefinition'])?.['recordId'])
    ?? stringValue(asRecord(result['source'])?.['recordId']);
  if (!recordId) return;
  const outputPath = stringValue(result['outputPath']);
  records.push({
    kind,
    recordId,
    ...(outputPath ? { path: outputPath } : {}),
    ...(status ? { status } : {}),
    tool,
  });
}

function collectKnownBlockers(
  blockers: FoundryAcquisitionBlocker[],
  tool: string,
  result: Record<string, unknown>,
): void {
  for (const blocker of arrayValue(result['blockers'])) {
    const record = asRecord(blocker);
    if (!record) continue;
    const field = stringValue(record['field']);
    const details = asRecord(record['details']);
    blockers.push({
      code: stringValue(record['code']) ?? 'blocked',
      severity: 'error',
      message: stringValue(record['message']) ?? 'Tool reported a blocker.',
      ...(field ? { field } : {}),
      ...(details ? { details } : {}),
      tool,
    });
  }
  for (const gap of arrayValue(result['gaps'])) {
    const record = asRecord(gap);
    if (!record) continue;
    const severity = severityValue(record['severity']);
    if (severity === 'info') continue;
    const field = stringValue(record['field']);
    blockers.push({
      code: stringValue(record['code']) ?? 'candidate_gap',
      severity,
      message: stringValue(record['message']) ?? 'Candidate has an unresolved gap.',
      ...(field ? { field } : {}),
      tool,
    });
  }
}

function collectArtifactPaths(result: Record<string, unknown> | undefined): string[] {
  if (!result) return [];
  return [
    stringValue(result['relativePath']),
    stringValue(result['artifactPath']),
    stringValue(result['candidatePath']),
    stringValue(result['draftPath']),
    stringValue(result['outputPath']),
    stringValue(result['sidecarPath']),
  ].filter((value): value is string => Boolean(value));
}

function collectRecordIds(result: Record<string, unknown> | undefined): string[] {
  if (!result) return [];
  return [
    stringValue(result['recordId']),
    stringValue(asRecord(result['draftDefinition'])?.['recordId']),
    stringValue(asRecord(result['source'])?.['recordId']),
  ].filter((value): value is string => Boolean(value));
}

function addArtifact(
  artifacts: FoundryAcquisitionArtifactRef[],
  artifact: Omit<FoundryAcquisitionArtifactRef, 'path'> & { path: string | undefined },
): void {
  if (!artifact.path) return;
  artifacts.push({
    kind: artifact.kind,
    path: artifact.path,
    ...(artifact.label ? { label: artifact.label } : {}),
    ...(artifact.status ? { status: artifact.status } : {}),
    ...(artifact.tool ? { tool: artifact.tool } : {}),
  });
}

function dedupeArtifacts(artifacts: FoundryAcquisitionArtifactRef[]): FoundryAcquisitionArtifactRef[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.kind}:${artifact.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRecords(records: FoundryAcquisitionRecordRef[]): FoundryAcquisitionRecordRef[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.kind}:${record.recordId}:${record.path ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nextActionFor(status: FoundryAcquisitionStructuredStatus): string {
  switch (status) {
    case 'blocked':
      return 'Review blockers, then continue the job with corrections or missing source details.';
    case 'ready_for_review':
      return 'Review the structured artifacts, then mark complete or continue with requested edits.';
    case 'incomplete':
      return 'Review the assistant report; no structured artifacts were detected.';
  }
}

function labelFor(kind: string, result: Record<string, unknown>): string | undefined {
  if (kind === 'vendor-pdf-download') return stringValue(result['title']) ?? 'Downloaded vendor PDF';
  if (kind === 'vendor-protocol-candidate-extraction') return 'Vendor protocol candidate';
  if (kind === 'vendor-protocol-event-graph-draft') return 'Draft event graph';
  if (kind === 'vendor-protocol-event-graph-promotion') return 'Promoted event graph';
  if (kind === 'labware-spec-candidate-extraction') return 'Labware spec candidate';
  if (kind === 'labware-spec-candidate-promotion') return 'Promoted labware definition';
  if (kind === 'opentrons-labware-definition-generation') return 'Opentrons labware definition';
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function severityValue(value: unknown): 'info' | 'warning' | 'error' {
  return value === 'info' || value === 'warning' || value === 'error'
    ? value
    : 'warning';
}
