import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { FileOperationResult } from '../repo/types.js';
import { compileAssistPlusPlan } from './compilers/assistPlusCompiler.js';
import { compileOpentronsPlan } from './compilers/opentronsCompiler.js';
import { ExecutionPlanningValidator, type PlanningValidationResult } from './planning/ExecutionPlanningValidator.js';

const PLANNED_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';
const ROBOT_PLAN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml';
const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const EXECUTION_ENVIRONMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-environment.schema.yaml';
const EXECUTION_PLAN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml';

type SourceType = 'protocol' | 'event-graph';
type TargetPlatform = 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist';
type DerivedArtifactTarget = 'pylabrobot' | 'pyalab' | 'opentrons_api';

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
  executionPlanRef?: unknown;
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

type EventGraphPayload = {
  id: string;
  events: Array<Record<string, unknown>>;
  labwares: Array<Record<string, unknown>>;
};

type ExecutionEnvironmentPayload = {
  kind: 'execution-environment';
  recordId: string;
  id: string;
  robot: Record<string, unknown>;
  deck: Record<string, unknown>;
  tools: Array<Record<string, unknown>>;
  labware_registry: Record<string, unknown>;
  constraints?: Record<string, unknown>;
};

type ExecutionPlanDerivedArtifact = {
  target: DerivedArtifactTarget;
  path: string;
  sha256: string;
  generator_version: string;
};

type ExecutionPlanPayload = {
  kind: 'execution-plan';
  recordId: string;
  type: 'execution_plan';
  id: string;
  version: string;
  event_graph_ref: string;
  execution_environment_ref: string;
  placements: Record<string, unknown>;
  tool_bindings: Record<string, unknown>;
  strategy: Record<string, unknown>;
  tip_management?: Record<string, unknown>;
  event_overrides?: unknown[];
  derived_artifacts?: ExecutionPlanDerivedArtifact[];
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
  private readonly planningValidator: ExecutionPlanningValidator;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.planningValidator = new ExecutionPlanningValidator();
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

    const compatibilityPlanRef = this.extractExecutionPlanRef(plannedRun.bindings);
    if (compatibilityPlanRef) {
      const emitted = await this.emitExecutionPlan({
        executionPlanId: compatibilityPlanRef,
        targetPlatform: input.targetPlatform,
      });
      const nextState = emitted.envelope.payload.status === 'error' ? 'failed' : 'ready';
      const updatedRunPayload: PlannedRunPayload = { ...plannedRun, state: nextState };
      await this.ctx.store.update({
        envelope: {
          recordId: plannedRun.recordId,
          schemaId: plannedRunEnvelope.schemaId,
          payload: updatedRunPayload,
        },
        message: `Set ${plannedRun.recordId} state to ${nextState} (execution plan compatibility path)`,
      });
      return {
        robotPlanId: emitted.robotPlanId,
        envelope: emitted.envelope,
      };
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

  private extractExecutionPlanRef(bindings: PlannedRunBindings | undefined): string | undefined {
    if (!bindings || typeof bindings !== 'object') return undefined;
    const candidateObj = bindings as Record<string, unknown>;

    const direct = candidateObj['executionPlanRef'];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
    if (direct && typeof direct === 'object') {
      const refObj = direct as Record<string, unknown>;
      if (typeof refObj['id'] === 'string' && refObj['id'].length > 0) {
        return refObj['id'];
      }
    }

    const params = Array.isArray(bindings.parameters) ? bindings.parameters : [];
    for (const item of params) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (row['name'] !== 'executionPlanRef') continue;
      const value = row['value'];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object') {
        const valueObj = value as Record<string, unknown>;
        if (typeof valueObj['id'] === 'string' && valueObj['id'].length > 0) {
          return valueObj['id'];
        }
      }
    }

    return undefined;
  }

  async validateExecutionPlan(input: {
    executionPlanId: string;
  }): Promise<{
    executionPlanId: string;
    executionEnvironmentId: string;
    eventGraphId: string;
    validation: PlanningValidationResult;
  }> {
    const context = await this.resolveExecutionPlanContext(input.executionPlanId);
    const validation = this.planningValidator.validate({
      eventGraph: context.eventGraph,
      executionEnvironment: context.executionEnvironment,
      executionPlan: context.executionPlan,
    });
    return {
      executionPlanId: context.executionPlanEnvelope.recordId,
      executionEnvironmentId: context.executionEnvironmentEnvelope.recordId,
      eventGraphId: context.eventGraphEnvelope.recordId,
      validation,
    };
  }

  async emitExecutionPlan(input: {
    executionPlanId: string;
    targetPlatform: TargetPlatform;
  }): Promise<{
    robotPlanId: string;
    executionPlanId: string;
    envelope: RecordEnvelope<RobotPlanPayload>;
    artifacts: ExecutionPlanDerivedArtifact[];
  }> {
    const context = await this.resolveExecutionPlanContext(input.executionPlanId);
    const validation = this.planningValidator.validate({
      eventGraph: context.eventGraph,
      executionEnvironment: context.executionEnvironment,
      executionPlan: context.executionPlan,
    });
    if (!validation.valid) {
      const errorCount = validation.issues.filter((issue) => issue.severity === 'error').length;
      throw new ExecutionError('PLAN_INVALID', `Execution plan validation failed with ${errorCount} error(s)`, 422);
    }

    const robotPlanId = await this.nextRecordId('RP', 'robot-plan');
    const compiled = await this.compileForTarget({
      robotPlanId,
      targetPlatform: input.targetPlatform,
      eventGraph: context.eventGraph,
      executionEnvironment: context.executionEnvironment,
      executionPlan: context.executionPlan,
    });

    const payload: RobotPlanPayload = {
      kind: 'robot-plan',
      id: robotPlanId,
      plannedRunRef: {
        kind: 'record',
        id: context.executionPlan.recordId,
        type: 'execution-plan',
      },
      targetPlatform: input.targetPlatform,
      generatedAt: new Date().toISOString(),
      generatorVersion: 'computable-lab-labos-m2',
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
      message: `Emit ${context.executionPlan.recordId} for ${input.targetPlatform}`,
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

    const derivedArtifacts = await this.computeDerivedArtifacts(input.targetPlatform, payload.artifacts);
    const targetId = this.mapDerivedArtifactTarget(input.targetPlatform);
    const previous = (context.executionPlan.derived_artifacts ?? []).filter((entry) => entry.target !== targetId);
    const updatedPlanPayload: ExecutionPlanPayload = {
      ...context.executionPlan,
      derived_artifacts: [...previous, ...derivedArtifacts],
    };
    const planUpdate = await this.ctx.store.update({
      envelope: {
        recordId: context.executionPlanEnvelope.recordId,
        schemaId: context.executionPlanEnvelope.schemaId,
        payload: updatedPlanPayload,
      },
      message: `Update derived artifacts for ${context.executionPlanEnvelope.recordId}`,
    });
    if (!planUpdate.success) {
      throw new ExecutionError('UPDATE_FAILED', planUpdate.error ?? 'Failed to persist derived artifacts', 500);
    }

    return {
      robotPlanId,
      executionPlanId: context.executionPlanEnvelope.recordId,
      envelope: result.envelope as RecordEnvelope<RobotPlanPayload>,
      artifacts: derivedArtifacts,
    };
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
    targetPlatform: TargetPlatform;
    plannedRun?: PlannedRunPayload;
    protocolEnvelope?: RecordEnvelope | null;
    eventGraph?: EventGraphPayload;
    executionEnvironment?: ExecutionEnvironmentPayload;
    executionPlan?: ExecutionPlanPayload;
  }): Promise<CompiledPlan> {
    if (input.targetPlatform === 'opentrons_ot2' || input.targetPlatform === 'opentrons_flex') {
      const compiled = compileOpentronsPlan({
        robotPlanId: input.robotPlanId,
        targetPlatform: input.targetPlatform,
        ...(input.plannedRun ? { plannedRun: input.plannedRun } : {}),
        ...(input.protocolEnvelope !== undefined ? { protocolEnvelope: input.protocolEnvelope } : {}),
        ...(input.eventGraph ? { eventGraph: input.eventGraph } : {}),
        ...(input.executionEnvironment ? { executionEnvironment: input.executionEnvironment } : {}),
        ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
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
        ...(input.plannedRun ? { plannedRun: input.plannedRun } : {}),
        ...(input.protocolEnvelope !== undefined ? { protocolEnvelope: input.protocolEnvelope } : {}),
        ...(input.eventGraph ? { eventGraph: input.eventGraph } : {}),
        ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
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

  private async resolveExecutionPlanContext(executionPlanId: string): Promise<{
    executionPlanEnvelope: RecordEnvelope;
    executionPlan: ExecutionPlanPayload;
    executionEnvironmentEnvelope: RecordEnvelope;
    executionEnvironment: ExecutionEnvironmentPayload;
    eventGraphEnvelope: RecordEnvelope;
    eventGraph: EventGraphPayload;
  }> {
    const executionPlanEnvelope = await this.resolveRecordReference(executionPlanId, {
      kind: 'execution-plan',
      schemaId: EXECUTION_PLAN_SCHEMA_ID,
    });
    const executionPlan = executionPlanEnvelope.payload as ExecutionPlanPayload;
    if (executionPlan.kind !== 'execution-plan') {
      throw new ExecutionError('BAD_REQUEST', `${executionPlanEnvelope.recordId} is not an execution-plan`, 400);
    }
    if (typeof executionPlan.event_graph_ref !== 'string' || executionPlan.event_graph_ref.length === 0) {
      throw new ExecutionError('BAD_REQUEST', 'execution_plan.event_graph_ref is required', 400);
    }
    if (typeof executionPlan.execution_environment_ref !== 'string' || executionPlan.execution_environment_ref.length === 0) {
      throw new ExecutionError('BAD_REQUEST', 'execution_plan.execution_environment_ref is required', 400);
    }

    const executionEnvironmentEnvelope = await this.resolveRecordReference(executionPlan.execution_environment_ref, {
      kind: 'execution-environment',
      schemaId: EXECUTION_ENVIRONMENT_SCHEMA_ID,
    });
    const executionEnvironment = executionEnvironmentEnvelope.payload as ExecutionEnvironmentPayload;
    if (executionEnvironment.kind !== 'execution-environment') {
      throw new ExecutionError('BAD_REQUEST', `${executionEnvironmentEnvelope.recordId} is not an execution-environment`, 400);
    }

    const eventGraphEnvelope = await this.resolveRecordReference(executionPlan.event_graph_ref, {
      schemaId: EVENT_GRAPH_SCHEMA_ID,
    });
    const eventGraph = eventGraphEnvelope.payload as EventGraphPayload;
    if (!Array.isArray(eventGraph.events) || !Array.isArray(eventGraph.labwares)) {
      throw new ExecutionError('BAD_REQUEST', `${eventGraphEnvelope.recordId} is not a valid event-graph payload`, 400);
    }

    return {
      executionPlanEnvelope,
      executionPlan,
      executionEnvironmentEnvelope,
      executionEnvironment,
      eventGraphEnvelope,
      eventGraph,
    };
  }

  private matchesRecord(
    envelope: RecordEnvelope,
    expected: { kind?: string; schemaId?: string },
  ): boolean {
    if (expected.schemaId && envelope.schemaId !== expected.schemaId) {
      return false;
    }
    if (expected.kind) {
      const payload = envelope.payload as Record<string, unknown>;
      return payload.kind === expected.kind;
    }
    return true;
  }

  private async resolveRecordReference(
    ref: string,
    expected: { kind?: string; schemaId?: string },
  ): Promise<RecordEnvelope> {
    const direct = await this.ctx.store.get(ref);
    if (direct && this.matchesRecord(direct, expected)) {
      return direct;
    }

    const candidates = expected.kind
      ? await this.ctx.store.list({ kind: expected.kind })
      : await this.ctx.store.list();

    for (const candidate of candidates) {
      const payload = candidate.payload as Record<string, unknown>;
      const payloadId = typeof payload.id === 'string' ? payload.id : undefined;
      if (candidate.recordId === ref || payloadId === ref) {
        if (this.matchesRecord(candidate, expected)) {
          return candidate;
        }
      }
    }

    if (!expected.kind) {
      const all = await this.ctx.store.list();
      for (const candidate of all) {
        const payload = candidate.payload as Record<string, unknown>;
        const payloadId = typeof payload.id === 'string' ? payload.id : undefined;
        if ((candidate.recordId === ref || payloadId === ref) && this.matchesRecord(candidate, expected)) {
          return candidate;
        }
      }
    }

    throw new ExecutionError('NOT_FOUND', `Referenced record not found for "${ref}"`, 404);
  }

  private mapDerivedArtifactTarget(targetPlatform: TargetPlatform): DerivedArtifactTarget {
    if (targetPlatform === 'integra_assist') return 'pyalab';
    return 'opentrons_api';
  }

  private sha256(contents: string): string {
    return createHash('sha256').update(contents, 'utf8').digest('hex');
  }

  private async computeDerivedArtifacts(
    targetPlatform: TargetPlatform,
    artifacts: RobotPlanArtifact[],
  ): Promise<ExecutionPlanDerivedArtifact[]> {
    const target = this.mapDerivedArtifactTarget(targetPlatform);
    const entries: ExecutionPlanDerivedArtifact[] = [];

    for (const artifact of artifacts) {
      const uri = artifact.fileRef.uri;
      const repoPath = uri.startsWith('file:') ? uri.slice('file:'.length) : uri;
      const file = await this.ctx.repoAdapter.getFile(repoPath);
      if (!file) {
        throw new ExecutionError('NOT_FOUND', `Artifact file not found: ${repoPath}`, 404);
      }
      entries.push({
        target,
        path: repoPath,
        sha256: this.sha256(file.content),
        generator_version: 'computable-lab-labos-m2',
      });
    }
    return entries;
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
