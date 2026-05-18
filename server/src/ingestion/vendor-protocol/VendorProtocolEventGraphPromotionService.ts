import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import type { AjvValidator } from '../../validation/AjvValidator.js';
import type { LintEngine } from '../../lint/LintEngine.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import type { VendorProtocolEventGraphDraftResult } from './VendorProtocolEventGraphDraftService.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

export interface PromoteVendorProtocolEventGraphInput {
  workspaceRoot: string;
  draft?: VendorProtocolEventGraphDraftResult;
  draftPath?: string;
  recordId?: string;
  outputDir?: string;
  overwrite?: boolean;
  allowIncompleteCompile?: boolean;
  allowEmptyEvents?: boolean;
  writeInvalid?: boolean;
  validator?: AjvValidator;
  lintEngine?: LintEngine;
}

export interface VendorProtocolEventGraphPromotionResult {
  kind: 'vendor-protocol-event-graph-promotion';
  status: 'promoted' | 'blocked';
  recordId: string;
  schemaId: typeof EVENT_GRAPH_SCHEMA_ID;
  outputPath?: string;
  sidecarPath?: string;
  validation?: ValidationResult;
  lint?: LintResult;
  blockers: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  promotedEventGraph: Record<string, unknown>;
}

export async function promoteVendorProtocolEventGraph(
  input: PromoteVendorProtocolEventGraphInput,
): Promise<VendorProtocolEventGraphPromotionResult> {
  const loaded = await loadDraft(input);
  const draft = loaded.draft;
  const recordId = input.recordId?.trim() || draft.eventGraph.id || `EVG-VENDOR-${safeFileName(draft.sourceProtocolRef.documentId)}`;
  const promotedEventGraph = buildPromotedEventGraph(draft, recordId);
  const validation = input.validator?.validate(promotedEventGraph, EVENT_GRAPH_SCHEMA_ID);
  const lint = input.lintEngine?.lint(promotedEventGraph, EVENT_GRAPH_SCHEMA_ID);
  const blockers = [
    ...(draft.compileStatus !== 'complete' && input.allowIncompleteCompile !== true
      ? [{
          code: 'compile_not_complete',
          message: `Draft compileStatus is ${draft.compileStatus}; pass allowIncompleteCompile=true to promote anyway.`,
          details: { compileStatus: draft.compileStatus },
        }]
      : []),
    ...(draft.eventGraph.events.length === 0 && input.allowEmptyEvents !== true
      ? [{
          code: 'empty_event_graph',
          message: 'Draft event graph has no events; pass allowEmptyEvents=true to promote anyway.',
        }]
      : []),
    ...(validation && !validation.valid && input.writeInvalid !== true
      ? [{
          code: 'schema_validation_failed',
          message: 'Promoted event graph failed schema validation.',
          details: { errors: validation.errors },
        }]
      : []),
    ...(lint && !lint.valid && input.writeInvalid !== true
      ? [{
          code: 'lint_failed',
          message: 'Promoted event graph failed lint checks.',
          details: { violations: lint.violations },
        }]
      : []),
  ];

  if (blockers.length > 0) {
    return {
      kind: 'vendor-protocol-event-graph-promotion',
      status: 'blocked',
      recordId,
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      ...(validation ? { validation } : {}),
      ...(lint ? { lint } : {}),
      blockers,
      promotedEventGraph,
    };
  }

  const outputPath = resolvePromotionOutputPath(input.workspaceRoot, input.outputDir, recordId, promotedEventGraph.name as string | undefined);
  if (input.overwrite !== true && await fileExists(outputPath)) {
    return {
      kind: 'vendor-protocol-event-graph-promotion',
      status: 'blocked',
      recordId,
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      outputPath: relative(input.workspaceRoot, outputPath),
      ...(validation ? { validation } : {}),
      ...(lint ? { lint } : {}),
      blockers: [{
        code: 'record_exists',
        message: `Event graph already exists at ${relative(input.workspaceRoot, outputPath)}. Set overwrite=true to replace it.`,
      }],
      promotedEventGraph,
    };
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyEventGraph(promotedEventGraph), 'utf-8');

  const sidecarPath = `${outputPath}.promotion.json`;
  await writeFile(sidecarPath, `${JSON.stringify({
    kind: 'vendor-protocol-event-graph-promotion-sidecar',
    promotedAt: new Date().toISOString(),
    schemaId: EVENT_GRAPH_SCHEMA_ID,
    recordId,
    ...(loaded.draftPath ? { draftPath: loaded.draftPath } : {}),
    sourceProtocolRef: draft.sourceProtocolRef,
    candidateSummary: draft.candidateSummary,
    compileStatus: draft.compileStatus,
    compile: draft.compile,
    compilePrompt: draft.compilePrompt,
  }, null, 2)}\n`, 'utf-8');

  return {
    kind: 'vendor-protocol-event-graph-promotion',
    status: 'promoted',
    recordId,
    schemaId: EVENT_GRAPH_SCHEMA_ID,
    outputPath: relative(input.workspaceRoot, outputPath),
    sidecarPath: relative(input.workspaceRoot, sidecarPath),
    ...(validation ? { validation } : {}),
    ...(lint ? { lint } : {}),
    blockers: [],
    promotedEventGraph,
  };
}

async function loadDraft(input: PromoteVendorProtocolEventGraphInput): Promise<{
  draft: VendorProtocolEventGraphDraftResult;
  draftPath?: string;
}> {
  if (input.draft) {
    assertDraft(input.draft);
    return { draft: input.draft };
  }
  if (!input.draftPath) {
    throw new Error('draft or draftPath is required');
  }
  const draftPath = resolveInsideDraftArtifacts(input.workspaceRoot, input.draftPath);
  const parsed = JSON.parse(await readFile(draftPath, 'utf-8')) as unknown;
  assertDraft(parsed);
  return {
    draft: parsed,
    draftPath: relative(input.workspaceRoot, draftPath),
  };
}

function assertDraft(value: unknown): asserts value is VendorProtocolEventGraphDraftResult {
  if (!value || typeof value !== 'object') {
    throw new Error('draft is not an object');
  }
  const draft = value as Partial<VendorProtocolEventGraphDraftResult>;
  if (draft.kind !== 'vendor-protocol-event-graph-draft') {
    throw new Error('draft.kind must be vendor-protocol-event-graph-draft');
  }
  if (!draft.eventGraph || !Array.isArray(draft.eventGraph.events) || !Array.isArray(draft.eventGraph.labwares)) {
    throw new Error('draft is missing eventGraph.events or eventGraph.labwares');
  }
}

function buildPromotedEventGraph(draft: VendorProtocolEventGraphDraftResult, recordId: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const placements = draft.eventGraph.labwares
    .filter((labware) => Boolean(labware.deckSlot))
    .map((labware) => ({
      slotId: labware.deckSlot!,
      labwareId: labware.labwareId,
    }));
  return compact({
    kind: 'event-graph',
    recordId,
    id: recordId,
    name: draft.eventGraph.name,
    description: draft.eventGraph.description,
    status: 'draft',
    protocolId: draft.sourceProtocolRef.documentId,
    createdAt: now,
    updatedAt: now,
    events: draft.eventGraph.events,
    labwares: draft.eventGraph.labwares.map((labware) => compact({
      labwareId: labware.labwareId,
      labwareType: labware.labwareType,
      name: labware.name,
      ...(labware.reason ? { notes: labware.reason } : {}),
    })),
    ...(placements.length > 0 ? { deckLayout: { placements } } : {}),
    tags: Array.from(new Set([
      ...(draft.eventGraph.tags ?? []),
      'vendor-protocol',
      'promoted',
    ])),
  });
}

function stringifyEventGraph(eventGraph: Record<string, unknown>): string {
  return YAML.stringify({
    $schema: EVENT_GRAPH_SCHEMA_ID,
    ...eventGraph,
  });
}

function resolvePromotionOutputPath(
  workspaceRoot: string,
  outputDir: string | undefined,
  recordId: string,
  name: string | undefined,
): string {
  const relativeDir = outputDir?.trim() || 'records/event-graph';
  const root = resolve(workspaceRoot, relativeDir);
  const rel = relative(workspaceRoot, root);
  if (rel.startsWith('..') || resolve(rel).startsWith('..')) {
    throw new Error('outputDir must be inside the workspace');
  }
  const slug = safeFileName(name || recordId);
  return join(root, `${safeFileName(recordId)}__${slug}.yaml`);
}

function resolveInsideDraftArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'protocol-event-graph-drafts');
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`draftPath must be inside ${artifactRoot}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeFileName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'event-graph';
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}
