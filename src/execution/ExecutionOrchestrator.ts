import { basename } from 'node:path';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { FileOperationResult } from '../repo/types.js';
import { compileAssistPlusPlan } from './compilers/assistPlusCompiler.js';
import { compileOpentronsPlan } from './compilers/opentronsCompiler.js';

const PLANNED_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';
const ROBOT_PLAN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml';

type SourceType = 'protocol' | 'event-graph';
type TargetPlatform = 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist';

type Ref = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
};

type PlannedRunBindings = {
  labware?: unknown[];
  materials?: unknown[];
  contexts?: unknown[];
  layoutTemplates?: unknown[];
  libraries?: unknown[];
  instruments?: unknown[];
  parameters?: unknown[];
};

type PlannedRunPayload = {
  kind: 'planned-run';
  recordId: string;
  title: string;
  sourceType: SourceType;
  sourceRef: Ref;
  protocolRef?: Ref;
  state: 'draft' | 'ready' | 'executing' | 'completed' | 'failed';
  bindings?: PlannedRunBindings;
};

type RobotPlanArtifact = {
  role: string;
  fileRef: {
    uri: string;
    mimeType?: string;
    label?: string;
  };
};

type RobotPlanPayload = {
  kind: 'robot-plan';
  id: string;
  plannedRunRef: Ref;
  targetPlatform: TargetPlatform;
  generatedAt: string;
  generatorVersion: string;
  deckSlots: unknown[];
  pipettes: unknown[];
  executionSteps: unknown[];
  artifacts: RobotPlanArtifact[];
  status: 'compiled' | 'validated' | 'error';
  errors?: Array<{ stepId: string; message: string }>;
  notes?: string;
};

type CompiledPlan = {
  deckSlots: unknown[];
  pipettes: unknown[];
  executionSteps: unknown[];
  notes?: string;
  errors?: Array<{ stepId: string; message: string }>;
  artifacts?: RobotPlanArtifact[];
};

export class ExecutionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertRecordRef(input: unknown): Ref {
  if (input === null || typeof input !== 'object') {
    throw new ExecutionError('BAD_REQUEST', 'sourceRef must be an object', 400);
  }
  const sourceRef = input as Record<string, unknown>;
  if (sourceRef.kind !== 'record' && sourceRef.kind !== 'ontology') {
    throw new ExecutionError('BAD_REQUEST', 'sourceRef.kind must be "record" or "ontology"', 400);
  }
  if (typeof sourceRef.id !== 'string' || sourceRef.id.length === 0) {
    throw new ExecutionError('BAD_REQUEST', 'sourceRef.id is required', 400);
  }

  return {
    kind: sourceRef.kind,
    id: sourceRef.id,
    ...(typeof sourceRef.type === 'string' && sourceRef.type.length > 0 ? { type: sourceRef.type } : {}),
  };
}

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) {
    return null;
  }
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }
  return Number.parseInt(suffix, 10);
}

function normalizeBindings(input: unknown): PlannedRunBindings | undefined {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object') {
    throw new ExecutionError('BAD_REQUEST', 'bindings must be an object', 400);
  }
  const obj = input as Record<string, unknown>;

  const bindings: PlannedRunBindings = {};
  const arrayKeys: Array<keyof PlannedRunBindings> = [
    'labware',
    'materials',
    'contexts',
    'layoutTemplates',
    'libraries',
    'instruments',
    'parameters',
  ];

  for (const key of arrayKeys) {
    const value = obj[key];
    if (value !== undefined) {
      if (!Array.isArray(value)) {
        throw new ExecutionError('BAD_REQUEST', `bindings.${key} must be an array`, 400);
      }
      bindings[key] = value;
    }
  }

  return Object.keys(bindings).length === 0 ? undefined : bindings;
}

function fileOpError(result: FileOperationResult): string {
  return result.error ?? 'Unknown file operation error';
}

function artifactPathFor(robotPlanId: string, targetPlatform: TargetPlatform, extension: string): string {
  return `records/robot-artifact/${targetPlatform}/${robotPlanId}.${extension}`;
}

export class ExecutionOrchestrator {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextRecordId(prefix: string, kind: string): Promise<string> {
    const records = await this.ctx.store.list({ kind });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, prefix);
      if (n !== null && n > max) {
        max = n;
      }
    }
    const next = max + 1;
    return `${prefix}-${String(next).padStart(6, '0')}`;
  }

  async createPlannedRun(input: {
    title: string;
    sourceType: SourceType;
    sourceRef: unknown;
    bindings?: unknown;
  }): Promise<{ recordId: string; envelope: RecordEnvelope<PlannedRunPayload> }> {
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new ExecutionError('BAD_REQUEST', 'title is required', 400);
    }
    if (input.sourceType !== 'protocol' && input.sourceType !== 'event-graph') {
      throw new ExecutionError('BAD_REQUEST', 'sourceType must be "protocol" or "event-graph"', 400);
    }

    const sourceRef = assertRecordRef(input.sourceRef);
    const sourceRecord = await this.ctx.store.get(sourceRef.id);
    if (!sourceRecord) {
      throw new ExecutionError('NOT_FOUND', `Source record not found: ${sourceRef.id}`, 404);
    }

    const recordId = await this.nextRecordId('PLR', 'planned-run');
    const bindings = normalizeBindings(input.bindings);

    const payload: PlannedRunPayload = {
      kind: 'planned-run',
      recordId,
      title: input.title.trim(),
      sourceType: input.sourceType,
      sourceRef,
      state: 'draft',
      ...(input.sourceType === 'protocol' ? { protocolRef: sourceRef } : {}),
      ...(bindings !== undefined ? { bindings } : {}),
    };

    const envelope: RecordEnvelope<PlannedRunPayload> = {
      recordId,
      schemaId: PLANNED_RUN_SCHEMA_ID,
      payload,
    };

    const result = await this.ctx.store.create({
      envelope,
      message: `Create planned run ${recordId}`,
    });

    if (!result.success || !result.envelope) {
      if (result.validation && !result.validation.valid) {
        throw new ExecutionError('VALIDATION_ERROR', 'Planned run validation failed', 422);
      }
      if (result.lint && !result.lint.valid) {
        throw new ExecutionError('LINT_ERROR', 'Planned run lint failed', 422);
      }
      throw new ExecutionError('CREATE_FAILED', result.error ?? 'Failed to create planned run', 400);
    }

    return { recordId, envelope: result.envelope as RecordEnvelope<PlannedRunPayload> };
  }

  async compilePlannedRun(input: {
    plannedRunId: string;
    targetPlatform: TargetPlatform;
  }): Promise<{ robotPlanId: string; envelope: RecordEnvelope<RobotPlanPayload> }> {
    const plannedRunEnvelope = await this.ctx.store.get(input.plannedRunId);
    if (!plannedRunEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Planned run not found: ${input.plannedRunId}`, 404);
    }
    const plannedRun = plannedRunEnvelope.payload as PlannedRunPayload;
    if (plannedRun.kind !== 'planned-run') {
      throw new ExecutionError('BAD_REQUEST', `${input.plannedRunId} is not a planned-run`, 400);
    }

    let sourceProtocol: RecordEnvelope | null = null;
    if (plannedRun.sourceType === 'protocol') {
      sourceProtocol = await this.ctx.store.get(plannedRun.sourceRef.id);
    }

    const robotPlanId = await this.nextRecordId('RP', 'robot-plan');
    const compiled = await this.compileForTarget({
      robotPlanId,
      plannedRun,
      targetPlatform: input.targetPlatform,
      protocolEnvelope: sourceProtocol,
    });

    const payload: RobotPlanPayload = {
      kind: 'robot-plan',
      id: robotPlanId,
      plannedRunRef: {
        kind: 'record',
        id: plannedRun.recordId,
        type: 'planned-run',
      },
      targetPlatform: input.targetPlatform,
      generatedAt: new Date().toISOString(),
      generatorVersion: 'computable-lab-labos-m1',
      deckSlots: compiled.deckSlots,
      pipettes: compiled.pipettes,
      executionSteps: compiled.executionSteps,
      artifacts: compiled.artifacts ?? [],
      status: compiled.errors && compiled.errors.length > 0 ? 'error' : 'compiled',
      ...(compiled.errors && compiled.errors.length > 0 ? { errors: compiled.errors } : {}),
      ...(compiled.notes !== undefined ? { notes: compiled.notes } : {}),
    };

    const envelope: RecordEnvelope<RobotPlanPayload> = {
      recordId: robotPlanId,
      schemaId: ROBOT_PLAN_SCHEMA_ID,
      payload,
    };

    const result = await this.ctx.store.create({
      envelope,
      message: `Compile ${plannedRun.recordId} for ${input.targetPlatform}`,
    });

    if (!result.success || !result.envelope) {
      if (result.validation && !result.validation.valid) {
        throw new ExecutionError('VALIDATION_ERROR', 'Robot plan validation failed', 422);
      }
      if (result.lint && !result.lint.valid) {
        throw new ExecutionError('LINT_ERROR', 'Robot plan lint failed', 422);
      }
      throw new ExecutionError('CREATE_FAILED', result.error ?? 'Failed to create robot plan', 400);
    }

    const nextState = payload.status === 'error' ? 'failed' : 'ready';
    const updatedRunPayload: PlannedRunPayload = { ...plannedRun, state: nextState };
    await this.ctx.store.update({
      envelope: {
        recordId: plannedRun.recordId,
        schemaId: plannedRunEnvelope.schemaId,
        payload: updatedRunPayload,
      },
      message: `Set ${plannedRun.recordId} state to ${nextState}`,
    });

    return { robotPlanId, envelope: result.envelope as RecordEnvelope<RobotPlanPayload> };
  }

  async getRobotPlanArtifact(robotPlanId: string, role?: string): Promise<{
    role: string;
    uri: string;
    filename: string;
    mimeType: string;
    content: string;
  }> {
    const envelope = await this.ctx.store.get(robotPlanId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Robot plan not found: ${robotPlanId}`, 404);
    }

    const payload = envelope.payload as RobotPlanPayload;
    if (payload.kind !== 'robot-plan') {
      throw new ExecutionError('BAD_REQUEST', `${robotPlanId} is not a robot-plan`, 400);
    }

    const artifacts = payload.artifacts ?? [];
    if (artifacts.length === 0) {
      throw new ExecutionError('NOT_FOUND', `No artifacts for robot plan: ${robotPlanId}`, 404);
    }

    const artifact = role
      ? artifacts.find((candidate) => candidate.role === role)
      : artifacts[0];

    if (!artifact) {
      throw new ExecutionError('NOT_FOUND', `Artifact role not found: ${role}`, 404);
    }

    const uri = artifact.fileRef.uri;
    const repoPath = uri.startsWith('file:') ? uri.slice('file:'.length) : uri;
    const file = await this.ctx.repoAdapter.getFile(repoPath);
    if (!file) {
      throw new ExecutionError('NOT_FOUND', `Artifact file not found: ${repoPath}`, 404);
    }

    return {
      role: artifact.role,
      uri,
      filename: basename(repoPath),
      mimeType: artifact.fileRef.mimeType ?? 'text/plain; charset=utf-8',
      content: file.content,
    };
  }

  private async compileForTarget(input: {
    robotPlanId: string;
    plannedRun: PlannedRunPayload;
    targetPlatform: TargetPlatform;
    protocolEnvelope: RecordEnvelope | null;
  }): Promise<CompiledPlan> {
    if (input.targetPlatform === 'opentrons_ot2' || input.targetPlatform === 'opentrons_flex') {
      const compiled = compileOpentronsPlan({
        robotPlanId: input.robotPlanId,
        targetPlatform: input.targetPlatform,
        plannedRun: input.plannedRun,
        protocolEnvelope: input.protocolEnvelope,
      });

      const artifactPath = artifactPathFor(input.robotPlanId, input.targetPlatform, 'py');
      const writeResult = await this.writeArtifactFile({
        path: artifactPath,
        content: compiled.pythonScript,
        message: `Write artifact for ${input.robotPlanId}`,
      });
      if (!writeResult.success) {
        throw new ExecutionError('ARTIFACT_WRITE_FAILED', fileOpError(writeResult), 500);
      }

      return {
        deckSlots: compiled.deckSlots,
        pipettes: compiled.pipettes,
        executionSteps: compiled.executionSteps,
        artifacts: [
          {
            role: 'opentrons_python',
            fileRef: {
              uri: artifactPath,
              mimeType: 'text/x-python',
              label: 'Opentrons Python protocol',
            },
          },
        ],
        notes: compiled.notes,
      };
    }

    if (input.targetPlatform === 'integra_assist') {
      const compiled = compileAssistPlusPlan({
        robotPlanId: input.robotPlanId,
        plannedRun: input.plannedRun,
        protocolEnvelope: input.protocolEnvelope,
      });

      const artifactPath = artifactPathFor(input.robotPlanId, input.targetPlatform, 'xml');
      const writeResult = await this.writeArtifactFile({
        path: artifactPath,
        content: compiled.vialabXml,
        message: `Write artifact for ${input.robotPlanId}`,
      });
      if (!writeResult.success) {
        throw new ExecutionError('ARTIFACT_WRITE_FAILED', fileOpError(writeResult), 500);
      }

      return {
        deckSlots: compiled.deckSlots,
        pipettes: compiled.pipettes,
        executionSteps: compiled.executionSteps,
        artifacts: [
          {
            role: 'integra_vialab_xml',
            fileRef: {
              uri: artifactPath,
              mimeType: 'application/xml',
              label: 'INTEGRA Assist Plus Vialab XML',
            },
          },
        ],
        notes: compiled.notes,
      };
    }

    return {
      deckSlots: [],
      pipettes: [],
      executionSteps: [],
      errors: [{ stepId: 'compile', message: `Target platform not implemented yet: ${input.targetPlatform}` }],
      notes: 'Compiler stub generated by LabOS scaffolding.',
    };
  }

  private async writeArtifactFile(input: {
    path: string;
    content: string;
    message: string;
  }): Promise<FileOperationResult> {
    const existing = await this.ctx.repoAdapter.getFile(input.path);
    if (!existing) {
      return this.ctx.repoAdapter.createFile({
        path: input.path,
        content: input.content,
        message: input.message,
      });
    }

    return this.ctx.repoAdapter.updateFile({
      path: input.path,
      content: input.content,
      sha: existing.sha,
      message: input.message,
    });
  }
}
