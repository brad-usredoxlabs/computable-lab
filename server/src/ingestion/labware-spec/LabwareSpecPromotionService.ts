import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import type { AjvValidator } from '../../validation/AjvValidator.js';
import type { LintEngine } from '../../lint/LintEngine.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import type {
  LabwareDefinitionDraft,
  LabwareSpecCandidateResult,
} from './LabwareSpecCandidateService.js';

const LABWARE_DEFINITION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml';

export interface PromoteLabwareSpecCandidateInput {
  workspaceRoot: string;
  candidatePath?: string;
  candidate?: LabwareSpecCandidateResult;
  recordId?: string;
  outputDir?: string;
  overwrite?: boolean;
  allowErrorGaps?: boolean;
  writeInvalid?: boolean;
  validator?: AjvValidator;
  lintEngine?: LintEngine;
}

export interface LabwareSpecPromotionResult {
  kind: 'labware-spec-candidate-promotion';
  status: 'promoted' | 'blocked';
  recordId: string;
  schemaId: typeof LABWARE_DEFINITION_SCHEMA_ID;
  outputPath?: string;
  sidecarPath?: string;
  validation?: ValidationResult;
  lint?: LintResult;
  blockers: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  promotedDefinition: LabwareDefinitionDraft;
}

export async function promoteLabwareSpecCandidate(
  input: PromoteLabwareSpecCandidateInput,
): Promise<LabwareSpecPromotionResult> {
  const loaded = await loadCandidate(input);
  const candidate = loaded.candidate;
  const recordId = input.recordId?.trim() || candidate.draftDefinition.recordId;
  const promotedDefinition: LabwareDefinitionDraft = {
    ...candidate.draftDefinition,
    recordId,
  };
  const validation = input.validator?.validate(promotedDefinition, LABWARE_DEFINITION_SCHEMA_ID);
  const lint = input.lintEngine?.lint(promotedDefinition, LABWARE_DEFINITION_SCHEMA_ID);
  const blockers = [
    ...candidate.gaps
      .filter((gap) => gap.severity === 'error' && input.allowErrorGaps !== true)
      .map((gap) => ({
        code: 'candidate_error_gap',
        message: gap.message,
        details: { gap },
      })),
    ...(validation && !validation.valid && input.writeInvalid !== true
      ? [{
          code: 'schema_validation_failed',
          message: 'Promoted labware definition failed schema validation.',
          details: { errors: validation.errors },
        }]
      : []),
    ...(lint && !lint.valid && input.writeInvalid !== true
      ? [{
          code: 'lint_failed',
          message: 'Promoted labware definition failed lint checks.',
          details: { violations: lint.violations },
        }]
      : []),
  ];

  if (blockers.length > 0) {
    return {
      kind: 'labware-spec-candidate-promotion',
      status: 'blocked',
      recordId,
      schemaId: LABWARE_DEFINITION_SCHEMA_ID,
      ...(validation ? { validation } : {}),
      ...(lint ? { lint } : {}),
      blockers,
      promotedDefinition,
    };
  }

  const outputPath = resolvePromotionOutputPath(input.workspaceRoot, input.outputDir, recordId);
  if (input.overwrite !== true && await fileExists(outputPath)) {
    return {
      kind: 'labware-spec-candidate-promotion',
      status: 'blocked',
      recordId,
      schemaId: LABWARE_DEFINITION_SCHEMA_ID,
      outputPath: relative(input.workspaceRoot, outputPath),
      ...(validation ? { validation } : {}),
      ...(lint ? { lint } : {}),
      blockers: [{
        code: 'record_exists',
        message: `Labware definition already exists at ${relative(input.workspaceRoot, outputPath)}. Set overwrite=true to replace it.`,
      }],
      promotedDefinition,
    };
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyLabwareDefinition(promotedDefinition), 'utf-8');

  const sidecarPath = `${outputPath}.promotion.json`;
  await writeFile(sidecarPath, `${JSON.stringify({
    kind: 'labware-spec-candidate-promotion-sidecar',
    promotedAt: new Date().toISOString(),
    schemaId: LABWARE_DEFINITION_SCHEMA_ID,
    recordId,
    ...(loaded.candidatePath ? { candidatePath: loaded.candidatePath } : {}),
    source: candidate.source,
    extracted: candidate.extracted,
    evidence: candidate.evidence,
    gaps: candidate.gaps,
  }, null, 2)}\n`, 'utf-8');

  return {
    kind: 'labware-spec-candidate-promotion',
    status: 'promoted',
    recordId,
    schemaId: LABWARE_DEFINITION_SCHEMA_ID,
    outputPath: relative(input.workspaceRoot, outputPath),
    sidecarPath: relative(input.workspaceRoot, sidecarPath),
    ...(validation ? { validation } : {}),
    ...(lint ? { lint } : {}),
    blockers: [],
    promotedDefinition,
  };
}

async function loadCandidate(input: PromoteLabwareSpecCandidateInput): Promise<{
  candidate: LabwareSpecCandidateResult;
  candidatePath?: string;
}> {
  if (input.candidate) {
    assertLabwareSpecCandidate(input.candidate);
    return { candidate: input.candidate };
  }
  if (!input.candidatePath) {
    throw new Error('candidate or candidatePath is required');
  }
  const candidatePath = resolveInsideCandidateArtifacts(input.workspaceRoot, input.candidatePath);
  const parsed = JSON.parse(await readFile(candidatePath, 'utf-8')) as unknown;
  assertLabwareSpecCandidate(parsed);
  return {
    candidate: parsed,
    candidatePath: relative(input.workspaceRoot, candidatePath),
  };
}

function assertLabwareSpecCandidate(value: unknown): asserts value is LabwareSpecCandidateResult {
  if (!value || typeof value !== 'object') {
    throw new Error('candidate is not an object');
  }
  const candidate = value as Partial<LabwareSpecCandidateResult>;
  if (candidate.kind !== 'labware-spec-candidate-extraction') {
    throw new Error('candidate.kind must be labware-spec-candidate-extraction');
  }
  if (!candidate.draftDefinition?.recordId || !candidate.source?.sha256) {
    throw new Error('candidate is missing draftDefinition.recordId or source.sha256');
  }
  if (!Array.isArray(candidate.evidence) || !Array.isArray(candidate.gaps)) {
    throw new Error('candidate is missing evidence or gaps arrays');
  }
}

function stringifyLabwareDefinition(definition: LabwareDefinitionDraft): string {
  return YAML.stringify({
    $schema: LABWARE_DEFINITION_SCHEMA_ID,
    ...definition,
  });
}

function resolvePromotionOutputPath(workspaceRoot: string, outputDir: string | undefined, recordId: string): string {
  const relativeDir = outputDir?.trim() || 'records/seed/labware-definition';
  const root = resolve(workspaceRoot, relativeDir);
  const rel = relative(workspaceRoot, root);
  if (rel.startsWith('..') || resolve(rel).startsWith('..')) {
    throw new Error('outputDir must be inside the workspace');
  }
  return join(root, `${safeFileName(recordId)}.yaml`);
}

function resolveInsideCandidateArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'labware-spec-candidates');
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`candidatePath must be inside ${artifactRoot}`);
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
    .slice(0, 120) || 'labware-definition';
}
