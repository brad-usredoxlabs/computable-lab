import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { RunChatbotCompileResult } from '../../ai/runChatbotCompile.js';
import type { PlateEventPrimitive } from '../../compiler/biology/BiologyVerbExpander.js';
import type { AiLabwareAdditionPatch } from '../../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { ProtocolCandidate } from './types.js';

export interface VendorProtocolEventGraphDraftInput {
  workspaceRoot: string;
  candidate?: ProtocolCandidate;
  candidatePath?: string;
  compile?: boolean;
  deterministicOnly?: boolean;
  persist?: boolean;
  compileRunner?: (args: {
    prompt: string;
    candidate: ProtocolCandidate;
    deterministicOnly: boolean;
  }) => Promise<RunChatbotCompileResult>;
}

export interface VendorProtocolEventGraphDraftResult {
  kind: 'vendor-protocol-event-graph-draft';
  sourceProtocolRef: {
    documentId: string;
    title: string;
    version?: string;
  };
  candidateSummary: {
    stepCount: number;
    materialCount: number;
    labwareCount: number;
    equipmentCount: number;
  };
  compilePrompt: string;
  compileStatus: 'not_run' | 'complete' | 'gap' | 'error';
  compile?: {
    outcome: RunChatbotCompileResult['outcome'];
    eventCount: number;
    labwareAdditionCount: number;
    unresolvedRefCount: number;
    events: PlateEventPrimitive[];
    labwareAdditions: AiLabwareAdditionPatch[];
    diagnostics: RunChatbotCompileResult['diagnostics'];
    terminalArtifacts: RunChatbotCompileResult['terminalArtifacts'];
  };
  eventGraph: {
    kind: 'event-graph';
    id: string;
    name: string;
    description: string;
    status: 'draft';
    sourceProtocolRef: {
      documentId: string;
      title: string;
      version?: string;
    };
    events: PlateEventPrimitive[];
    labwares: Array<{
      labwareId: string;
      labwareType: string;
      name: string;
      deckSlot?: string;
      reason?: string;
    }>;
    tags: string[];
  };
  draftPath?: string;
}

export async function draftVendorProtocolEventGraph(
  input: VendorProtocolEventGraphDraftInput,
): Promise<VendorProtocolEventGraphDraftResult> {
  const candidate = await loadCandidate(input);
  const compilePrompt = buildVendorProtocolCompilePrompt(candidate);
  const shouldCompile = input.compile === true || Boolean(input.compileRunner && input.compile !== false);
  const sourceProtocolRef = compact({
    documentId: candidate.source.documentId,
    title: candidate.title,
    ...(candidate.source.version ? { version: candidate.source.version } : {}),
  });

  let compile: VendorProtocolEventGraphDraftResult['compile'];
  let compileStatus: VendorProtocolEventGraphDraftResult['compileStatus'] = 'not_run';
  if (shouldCompile) {
    if (!input.compileRunner) {
      throw new Error('compileRunner is required when compile is true');
    }
    const compileResult = await input.compileRunner({
      prompt: compilePrompt,
      candidate,
      deterministicOnly: input.deterministicOnly ?? true,
    });
    compileStatus = compileResult.outcome;
    compile = {
      outcome: compileResult.outcome,
      eventCount: compileResult.events.length,
      labwareAdditionCount: compileResult.labwareAdditions.length,
      unresolvedRefCount: compileResult.unresolvedRefs.length,
      events: compileResult.events,
      labwareAdditions: compileResult.labwareAdditions,
      diagnostics: compileResult.diagnostics,
      terminalArtifacts: compileResult.terminalArtifacts,
    };
  }

  const eventGraph = {
    kind: 'event-graph' as const,
    id: `vendor-protocol-draft-${safeFileName(candidate.source.documentId)}`,
    name: `${candidate.title} Draft Event Graph`,
    description: `Draft event graph generated from vendor protocol candidate ${candidate.source.documentId}.`,
    status: 'draft' as const,
    sourceProtocolRef,
    events: compile?.events ?? [],
    labwares: labwaresFromAdditions(compile?.labwareAdditions ?? []),
    tags: ['vendor-protocol', 'draft', 'ai-assisted-ingestion'],
  };

  const result: VendorProtocolEventGraphDraftResult = {
    kind: 'vendor-protocol-event-graph-draft',
    sourceProtocolRef,
    candidateSummary: {
      stepCount: candidate.steps.length,
      materialCount: candidate.materials.length,
      labwareCount: candidate.labware.length,
      equipmentCount: candidate.equipment.length,
    },
    compilePrompt,
    compileStatus,
    ...(compile ? { compile } : {}),
    eventGraph,
  };

  if (input.persist !== false) {
    result.draftPath = await writeDraftArtifact(input.workspaceRoot, result, candidate.source.documentId);
  }
  return result;
}

export function buildVendorProtocolCompilePrompt(candidate: ProtocolCandidate): string {
  const materials = labels(candidate.materials);
  const labware = labels(candidate.labware);
  const equipment = labels(candidate.equipment);
  const steps = candidate.steps
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber || (a.substep ?? '').localeCompare(b.substep ?? ''))
    .map((step) => `${step.stepNumber}${step.substep ? step.substep : ''}. ${normalizeLine(step.sourceText)}`);

  return [
    `Protocol: ${candidate.title}`,
    `Source document: ${candidate.source.documentId}`,
    materials.length ? `Materials: ${materials.join('; ')}` : undefined,
    labware.length ? `Labware: ${labware.join('; ')}` : undefined,
    equipment.length ? `Equipment: ${equipment.join('; ')}` : undefined,
    'Steps:',
    ...steps,
  ].filter((line): line is string => Boolean(line)).join('\n');
}

async function loadCandidate(input: VendorProtocolEventGraphDraftInput): Promise<ProtocolCandidate> {
  if (input.candidate) return input.candidate;
  if (!input.candidatePath) {
    throw new Error('candidate or candidatePath is required');
  }
  const candidatePath = resolveInsideCandidateArtifacts(input.workspaceRoot, input.candidatePath);
  const parsed = JSON.parse(await readFile(candidatePath, 'utf-8')) as unknown;
  assertProtocolCandidate(parsed);
  return parsed;
}

function assertProtocolCandidate(value: unknown): asserts value is ProtocolCandidate {
  if (!value || typeof value !== 'object') {
    throw new Error('candidate is not an object');
  }
  const candidate = value as Partial<ProtocolCandidate>;
  if (candidate.kind !== 'vendor-protocol-candidate') {
    throw new Error('candidate.kind must be vendor-protocol-candidate');
  }
  if (!candidate.source?.documentId || typeof candidate.title !== 'string' || !Array.isArray(candidate.steps)) {
    throw new Error('candidate is missing source.documentId, title, or steps');
  }
}

function labels(items: Array<{ label: string }>): string[] {
  return Array.from(new Set(items.map((item) => item.label.trim()).filter(Boolean))).slice(0, 40);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function labwaresFromAdditions(additions: AiLabwareAdditionPatch[]): VendorProtocolEventGraphDraftResult['eventGraph']['labwares'] {
  return additions.map((addition, index) => compact({
    labwareId: `lw-${index + 1}`,
    labwareType: addition.recordId,
    name: addition.recordId,
    ...(addition.deckSlot ? { deckSlot: addition.deckSlot } : {}),
    ...(addition.reason ? { reason: addition.reason } : {}),
  }));
}

async function writeDraftArtifact(
  workspaceRoot: string,
  result: VendorProtocolEventGraphDraftResult,
  documentId: string,
): Promise<string> {
  const draftRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'protocol-event-graph-drafts');
  const path = join(draftRoot, `${safeFileName(documentId)}-${contentHash(result.compilePrompt)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  return relative(workspaceRoot, path);
}

function resolveInsideCandidateArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates');
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`candidatePath must be inside ${artifactRoot}`);
}

function safeFileName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'vendor-protocol';
}

function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}
