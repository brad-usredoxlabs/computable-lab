/**
 * W2-7-REALIZATION-SPINE — deterministic lowering of a family + realization
 * into a scientist-intent YAML document, then the frozen pipeline.
 *
 * `lowerRealization` is a PURE emitter: no clock, no uuid, no Map-iteration
 * order dependence, no locale-sensitive sort — byte-identical determinism is a
 * structural property (ProtocolRealizePass's randomUUID is the anti-precedent).
 * Every gate reads DATA (the realization policy, the verb adjudication table,
 * the constraint vocabulary, the execution-scale profile registry); the module
 * carries ZERO verb lists, ZERO rung literals (W2-4 owns the rungs —
 * schema/registry/provenance-ladder/rung-vocabulary.yaml), ZERO profile ids,
 * ZERO class/policy lists.
 *
 * Pipeline (each step fail-loud with a stable machine code, never a guess):
 *   L1 BIND        inherits_from must name the family
 *   L2 BRANCH GATE the shipped BranchResolver leg over family axes x
 *                  realization branch_resolution (never a default branch;
 *                  branchIds must be FAMILY condition ids — never masquerading
 *                  vendor step ids)
 *   L3 ANSWER CLOSURE the policy's required answers present with a recorded-
 *                  choice carrier BEFORE any compile — bars the guessed default
 *                  upstream (OQ4(a)); dimensional conflation fails at the
 *                  shipped Quantity schema (Ajv), never a TS branch
 *   L4 CAPABILITY  profile requiredTools/requiredLabwareDefinitions + surviving
 *                  steps' capabilityRequirement satisfied by SetupRows;
 *                  substitution adjudication rides the constraint vocabulary's
 *                  bindingKind x overridePolicy seam (SPINE-8) as data
 *   L5 ADJUDICATE  canonical -> the 31-verb contract via the adjudication
 *                  table + the shipped vocabulary (unadjudicated verbs fail
 *                  loudly; no silent folding); symbolic labels ride from the
 *                  bound profile's data
 *   L6 VALIDATE    the emitted string through the REAL parseScientistIntent
 *                  (Ajv sole authority); a failure is a lowering BUG
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  activeStepIdsForResolution,
  type BranchAxisLike,
  type BranchResolutionEntry,
} from '../../protocol/BranchResolver.js';
import { getExecutionScaleProfileRegistry } from '../../registry/ExecutionScaleProfileRegistry.js';
import type { ExecutionScaleProfileRecord } from '../../registry/ExecutionScaleProfileRegistry.js';
import { createValidator, type AjvValidator } from '../../validation/AjvValidator.js';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { parseScientistIntent, ScientistIntentValidationError } from './parseScientistIntent.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { compileScientistIntent, type ScientistIntentCompileDeps } from './compileScientistIntent.js';
import type { ScientistIntentCompileResult } from './compileScientistIntent.js';

// ---------------------------------------------------------------------------
// Shapes (structural — the merged W2-3/W2-6 record payloads, read as data)
// ---------------------------------------------------------------------------

export interface IntentStepPayloadLike {
  semanticVerb?: { canonical?: string };
  materialNeeds?: Array<{
    need: string;
    capabilityRequirement?: { kind: string; type?: string; id?: string };
  }>;
  constraints?: Array<Record<string, unknown>>;
  provenance?: unknown[];
}

export interface FamilyStepLike {
  stepId: string;
  intent?: IntentStepPayloadLike;
}

/** The W2-6 family: a kind-`protocol` universal record whose branch_axes are
 *  the deriveBranchAxes/deriveStepVariantAxes output bound VERBATIM (M1). */
export interface ProtocolPayloadLike {
  recordId: string;
  protocolLayer?: string;
  branch_axes?: Array<BranchAxisLike & { question?: string }>;
  steps: FamilyStepLike[];
}

export interface SetupRowLike {
  role: string;
  ref?: { kind: string; type?: string; id?: string };
}

export interface BranchResolutionEntryLike extends BranchResolutionEntry {
  choices?: Record<string, unknown>;
}

/** The local-protocol realization payload (in-memory; persistence is W2-8's). */
export interface LocalProtocolPayloadLike {
  recordId: string;
  inherits_from: { kind: string; type?: string; id: string };
  branch_resolution: BranchResolutionEntryLike[];
  labwares?: SetupRowLike[];
  equipment?: SetupRowLike[];
  materials?: SetupRowLike[];
  overrides?: {
    substitutions?: Array<{ role: string; material_ref?: unknown; rationale?: string }>;
  };
}

export interface RealizationFailure {
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Policy DATA (schema/registry/realization/robot-realization.policy.yaml)
// ---------------------------------------------------------------------------

export interface RealizationPolicyDoc {
  scaleBindings: Array<{ answerValue: string; scaleProfileId: string }>;
  requiredAnswers: Array<{
    id: string;
    answerLocation: string;
    answerKey?: string;
    boundDimension?: string;
    section?: string;
    roleFromProfile?: string;
    question: string;
    actionable: string;
  }>;
  capabilityClosure: Array<{ profileField: string; section: string; matchOn: string }>;
  substitutionAdjudication: {
    vocabularyFile: string;
    membershipField: string;
    keyComposition: string;
  };
  parameterBindings: Array<{ dimension: string; arg: string }>;
}

const POLICY_REL_PATH = 'schema/registry/realization/robot-realization.policy.yaml';

export function defaultPolicyPath(): string {
  return resolve(process.cwd(), '..', POLICY_REL_PATH);
}

/** FRESH disk read per call (bait #2: no cached-module mutation games — the
 *  T6 proof edits the YAML on disk and must see the change with zero code). */
export function loadRealizationPolicy(path: string = defaultPolicyPath()): RealizationPolicyDoc {
  const doc = parseYaml(readFileSync(path, 'utf-8')) as RealizationPolicyDoc;
  if (!Array.isArray(doc.scaleBindings) || !Array.isArray(doc.requiredAnswers)) {
    throw new Error(`realization policy is malformed (missing scaleBindings/requiredAnswers): ${path}`);
  }
  return doc;
}

/** Data path lookup on the bound profile record ('pipetting.requiredTools' ->
 *  the array). Zero profile-field knowledge hardcoded in TS beyond the path. */
function dataPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Verb adjudication DATA (schema/registry/wave2-verb-adjudication.yaml)
// ---------------------------------------------------------------------------

interface VerbAdjudication {
  /** canonical -> scientist-intent action (the same_operation mapping). */
  sameOperation: Map<string, string>;
  /** canonicals the table declares protocol_semantic_only (never lowered). */
  protocolSemanticOnly: Set<string>;
}

function loadVerbAdjudication(): VerbAdjudication {
  const path = resolve(process.cwd(), '..', 'schema', 'registry', 'wave2-verb-adjudication.yaml');
  const doc = parseYaml(readFileSync(path, 'utf-8')) as {
    mappings?: {
      same_operation?: Array<{ canonical: string; scientist_intent_action: string }>;
      protocol_semantic_only?: Array<{ canonical: string }>;
    };
  };
  const sameOperation = new Map<string, string>();
  for (const entry of doc.mappings?.same_operation ?? []) {
    sameOperation.set(entry.canonical, entry.scientist_intent_action);
  }
  const protocolSemanticOnly = new Set<string>(
    (doc.mappings?.protocol_semantic_only ?? []).map((e) => e.canonical),
  );
  return { sameOperation, protocolSemanticOnly };
}

// ---------------------------------------------------------------------------
// Constraint vocabulary DATA (the SPINE-8 strictness seam as membership)
// ---------------------------------------------------------------------------

function loadPolicyBindingKeys(): Set<string> {
  const path = resolve(
    process.cwd(), '..', 'schema', 'registry', 'constraint-vocabulary', 'constraint-vocabulary.yaml',
  );
  const doc = parseYaml(readFileSync(path, 'utf-8')) as { policyBindingKeys?: string[] };
  return new Set(doc.policyBindingKeys ?? []);
}

// ---------------------------------------------------------------------------
// Quantity schema validator (W2-2 shipped datatype; Ajv sole authority —
// count-vs-volume conflation is a SCHEMA error, never a TS branch)
// ---------------------------------------------------------------------------

const QUANTITY_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml';
let quantityValidatorPromise: Promise<AjvValidator> | null = null;

async function getQuantityValidator(): Promise<AjvValidator> {
  if (!quantityValidatorPromise) {
    quantityValidatorPromise = (async () => {
      const result = await loadAllSchemas({ basePath: resolve(process.cwd(), '..', 'schema') });
      if (result.errors.length > 0) {
        throw new Error(`schema load failed for the realization quantity gate: ${result.errors.join('; ')}`);
      }
      const registry = createSchemaRegistry();
      registry.addSchemas(result.entries);
      const validator = createValidator({ strict: false });
      for (const id of registry.getTopologicalOrder()) {
        const entry = registry.getById(id);
        if (entry) validator.addSchema(entry.schema, entry.id);
      }
      return validator;
    })();
  }
  return quantityValidatorPromise;
}

// ---------------------------------------------------------------------------
// The lowerer
// ---------------------------------------------------------------------------

export interface LowerRealizationInput {
  family: ProtocolPayloadLike;
  realization: LocalProtocolPayloadLike;
  policy?: RealizationPolicyDoc;
  scaleProfile?: ExecutionScaleProfileRecord;
}

export type LowerRealizationResult =
  | { intentYaml: string; activeStepIds: string[]; scaleProfile: ExecutionScaleProfileRecord | undefined }
  | { failures: RealizationFailure[] };

function fail(code: string, message: string): { failures: RealizationFailure[] } {
  return { failures: [{ code, message }] };
}

/** PathResolver.isEmpty semantics (merged W2-4 lint header): `undefined`, null,
 *  '' , [] and {} are ALL empty — an empty choices object `{}` is ABSENT. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function axisQuestion(axis: BranchAxisLike & { question?: string }): string {
  return axis.label ?? axis.question ?? axis.axisId;
}

export async function lowerRealization(
  input: LowerRealizationInput,
): Promise<LowerRealizationResult> {
  const { family, realization } = input;
  const policy = input.policy ?? loadRealizationPolicy();
  const failures: RealizationFailure[] = [];

  // ---- L1 BIND -------------------------------------------------------------
  if (realization.inherits_from.id !== family.recordId) {
    return fail(
      'REALIZATION_INHERITS_MISMATCH',
      `local-protocol '${realization.recordId}' inherits_from '${realization.inherits_from.id}' `
      + `but the family is '${family.recordId}' — point inherits_from at the family record id.`,
    );
  }

  const axes = family.branch_axes ?? [];

  // ---- L2 BRANCH GATE (the shipped leg; never a default branch) ------------
  const resolution: BranchResolutionEntry[] = realization.branch_resolution.map((r) => ({
    axisId: r.axisId,
    matched: r.matched,
    ...(r.branchIds ? { branchIds: r.branchIds } : {}),
  }));
  for (const axis of axes) {
    const entry = realization.branch_resolution.find((r) => r.axisId === axis.axisId);
    if (!entry || !entry.matched || !entry.branchIds || entry.branchIds.length === 0) {
      failures.push({
        code: 'REALIZATION_BRANCH_UNRESOLVED',
        message:
          `branch axis '${axis.axisId}' ("${axisQuestion(axis)}") is declared on the family `
          + `'${family.recordId}' but the realization records no matched resolution with chosen `
          + `branch ids — answer the axis in branch_resolution (matched + branchIds from the `
          + `family's condition ids + choices).`,
      });
      continue;
    }
    const conditionIds = new Set((axis.conditions ?? []).map((c) => c.id));
    for (const branchId of entry.branchIds) {
      if (!conditionIds.has(branchId)) {
        failures.push({
          code: 'REALIZATION_BRANCH_ID_MASQUERADE',
          message:
            `branch_resolution on axis '${axis.axisId}' carries branchId '${branchId}' which is NOT `
            + `a condition id of the family's declared axis (family ids: `
            + `[${[...conditionIds].join(', ')}]) — branch ids come from the family's branch_axes `
            + `vocabulary, never from vendor candidate step ids.`,
        });
      }
    }
  }
  if (failures.length > 0) return { failures };

  const activeStepIds = activeStepIdsForResolution(axes, resolution);
  const gatedIds = new Set<string>(
    axes.flatMap((axis) => (axis.conditions ?? []).flatMap((c) => c.then_stepIds ?? [])),
  );
  const survivingSteps = family.steps.filter(
    (step) => !gatedIds.has(step.stepId) || activeStepIds.includes(step.stepId),
  );

  // ---- Scale binding: the ANSWERED choice value -> the profile (data) ------
  const chosenValues = new Set<string>();
  for (const entry of realization.branch_resolution) {
    if (!entry.matched || !entry.choices) continue;
    for (const value of Object.values(entry.choices)) {
      if (typeof value === 'string') chosenValues.add(value);
    }
  }
  let scaleProfile: ExecutionScaleProfileRecord | undefined = input.scaleProfile;
  if (!scaleProfile) {
    for (const binding of policy.scaleBindings) {
      if (chosenValues.has(binding.answerValue)) {
        scaleProfile = getExecutionScaleProfileRegistry().get(binding.scaleProfileId);
        if (!scaleProfile) {
          return fail(
            'REALIZATION_CAPABILITY_MISSING',
            `the realization answered '${binding.answerValue}' which the policy binds to scale `
            + `profile '${binding.scaleProfileId}', but that profile is not in the registry — `
            + `register the profile or answer a bound value.`,
          );
        }
        break;
      }
    }
  }

  // ---- L3 ANSWER CLOSURE (bars the guessed default upstream) ---------------
  const quantityValidator = await getQuantityValidator();
  for (const answer of policy.requiredAnswers) {
    if (answer.answerLocation === 'branch_resolution.choices') {
      let found: unknown;
      let foundOn = '';
      for (const entry of realization.branch_resolution) {
        if (!entry.matched || isEmptyValue(entry.choices)) continue;
        const value = entry.choices![answer.answerKey ?? answer.id];
        if (!isEmptyValue(value)) {
          found = value;
          foundOn = entry.axisId;
          break;
        }
      }
      if (found === undefined) {
        failures.push({
          code: 'REALIZATION_ANSWER_MISSING',
          message:
            `required realization answer '${answer.id}' is not recorded — ${answer.actionable}. `
            + `Question: "${answer.question}" (answer location: branch_resolution[].choices on a `
            + `matched entry of the realization of '${family.recordId}').`,
        });
        continue;
      }
      if (answer.boundDimension) {
        const result = quantityValidator.validate(found, QUANTITY_ID);
        if (!result.valid) {
          failures.push({
            code: 'REALIZATION_ANSWER_INVALID',
            message:
              `required answer '${answer.id}' (on axis '${foundOn}') is not a valid Quantity per `
              + `the shipped quantity schema (Ajv): ${JSON.stringify(result.errors)}. `
              + `Dimension collapse (e.g. a volume unit on a count) is a schema error, never a guess.`,
          });
          continue;
        }
        const dim = (found as Record<string, unknown>).dimension;
        if (dim !== answer.boundDimension) {
          failures.push({
            code: 'REALIZATION_ANSWER_INVALID',
            message:
              `required answer '${answer.id}' carries dimension '${String(dim)}' but the policy `
              + `binds it to dimension '${answer.boundDimension}' — answer '${answer.id}' in the `
              + `declared dimension.`,
          });
          continue;
        }
        const num = (found as Record<string, unknown>).value;
        if (typeof num !== 'number' || num <= 0) {
          failures.push({
            code: 'REALIZATION_ANSWER_INVALID',
            message: `required answer '${answer.id}' must be a POSITIVE quantity (got ${String(num)}).`,
          });
        }
      }
      continue;
    }
    if (answer.answerLocation === 'setup_rows') {
      const sectionRows =
        (dataPath(realization, answer.section ?? 'labwares') as SetupRowLike[] | undefined) ?? [];
      const role = scaleProfile
        ? String(dataPath(scaleProfile, answer.roleFromProfile ?? '') ?? '')
        : '';
      if (!role) continue; // no bound profile -> this plate answer is not demanded
      const row = sectionRows.find((r) => r.role === role);
      if (!row || isEmptyValue(row.ref)) {
        failures.push({
          code: 'REALIZATION_ANSWER_MISSING',
          message:
            `required realization answer '${answer.id}' is not recorded — `
            + `${answer.actionable.replace('<role>', role)}. `
            + `Question: "${answer.question}" (answer location: the '${answer.section ?? 'labwares'}' `
            + `SetupRow with role '${role}' and a concrete ref).`,
        });
      }
    }
  }

  // ---- L4 CAPABILITY GATE ---------------------------------------------------
  const sectionRows = (name: string): SetupRowLike[] =>
    (dataPath(realization, name) as SetupRowLike[] | undefined) ?? [];

  for (const closure of policy.capabilityClosure) {
    const required = dataPath(scaleProfile ?? {}, closure.profileField);
    if (!Array.isArray(required) || required.length === 0) continue;
    const rows = sectionRows(closure.section);
    for (const need of required) {
      if (typeof need !== 'string') continue;
      // matchOn is a data path from the SetupRow ('ref.id' -> row.ref.id).
      const satisfied = rows.some((row) => dataPath(row, closure.matchOn) === need);
      if (!satisfied) {
        failures.push({
          code: 'REALIZATION_CAPABILITY_MISSING',
          message:
            `the bound scale profile requires '${need}' but the realization's '${closure.section}' `
            + `SetupRows carry no ref with ${closure.matchOn} = '${need}' — add a `
            + `'${closure.section}' row bound to '${need}' (profile `
            + `'${scaleProfile?.id ?? 'unbound'}', field '${closure.profileField}').`,
        });
      }
    }
  }

  for (const step of survivingSteps) {
    for (const need of step.intent?.materialNeeds ?? []) {
      const cap = need.capabilityRequirement;
      if (!cap?.id) continue;
      const satisfied = sectionRows('equipment').some((row) => row.ref?.id === cap.id);
      if (!satisfied) {
        failures.push({
          code: 'REALIZATION_CAPABILITY_MISSING',
          message:
            `surviving intent step '${step.stepId}' needs '${need.need}' which presumes capability `
            + `'${cap.id}', but the realization's 'equipment' SetupRows bind no ref with `
            + `id = '${cap.id}' — answer the equipment role (bind a row to '${cap.id}').`,
        });
      }
    }
  }

  // Substitution adjudication: the constraint vocabulary's seam as membership.
  const policyBindingKeys = loadPolicyBindingKeys();
  const survivingConstraints = survivingSteps.flatMap(
    (step) => (step.intent?.constraints ?? []) as Array<Record<string, unknown>>,
  );
  for (const sub of realization.overrides?.substitutions ?? []) {
    const matched = survivingConstraints.filter(
      (c) => (c.subject as Record<string, unknown> | undefined)?.role === sub.role,
    );
    for (const constraint of matched) {
      const subject = constraint.subject as Record<string, unknown> | undefined;
      const bindingKind = String(constraint.bindingKind ?? '');
      const overridePolicy = String(constraint.overridePolicy ?? 'none');
      const composed =
        typeof subject?.bindingPolicyKey === 'string'
          ? subject.bindingPolicyKey
          : `${overridePolicy}:${bindingKind}`;
      if (!policyBindingKeys.has(composed)) {
        failures.push({
          code: 'REALIZATION_SUBSTITUTION_DISALLOWED',
          message:
            `substitution of role '${sub.role}' collides with constraint class `
            + `'${String(constraint.class)}' (bindingKind '${bindingKind}', policy `
            + `'${overridePolicy}', composed key '${composed}') which is NOT a declared `
            + `policyBindingKey of the constraint vocabulary — the substitution is disallowed `
            + `under the declared strictness seam.`,
        });
      }
    }
  }
  if (failures.length > 0) return { failures };

  // ---- L5 ADJUDICATE + EMIT --------------------------------------------------
  const adjudication = loadVerbAdjudication();
  const vocabulary = defaultScientistIntentVocabulary();
  const parameterArgByDimension = new Map<string, string>(
    policy.parameterBindings.map((b) => [b.dimension, b.arg]),
  );

  const actions: Array<Record<string, unknown>> = [];
  for (const step of survivingSteps) {
    const payload = step.intent;
    if (!payload) continue;
    const canonical = payload.semanticVerb?.canonical;
    if (typeof canonical !== 'string' || canonical.length === 0) {
      failures.push({
        code: 'REALIZATION_VERB_UNADJUDICATED',
        message: `intent step '${step.stepId}' carries no semanticVerb canonical to adjudicate.`,
      });
      continue;
    }
    let verb: string | undefined;
    if (vocabulary.has(canonical)) verb = canonical;
    else {
      const mapped = adjudication.sameOperation.get(canonical);
      if (mapped && vocabulary.has(mapped)) verb = mapped;
    }
    if (!verb) {
      failures.push({
        code: 'REALIZATION_VERB_UNADJUDICATED',
        message:
          `intent step '${step.stepId}' canonical '${canonical}' has no scientist-intent `
          + `representation (${adjudication.protocolSemanticOnly.has(canonical)
            ? 'the adjudication table declares it protocol_semantic_only — never lowered'
            : 'it is neither a vocabulary verb nor a same_operation mapping'}) — `
          + `lowering refuses silent verb folding.`,
      });
      continue;
    }

    // Symbolic labels ride from the bound profile's data (never hardcoded).
    const sampleRole = scaleProfile ? String(dataPath(scaleProfile, 'sampleLayout.labwareRole') ?? '') : '';
    const reagentRole = scaleProfile ? String(dataPath(scaleProfile, 'reagentSource.sourceLabwareRole') ?? '') : '';
    const sampleDef = scaleProfile ? String(dataPath(scaleProfile, 'sampleLayout.labwareDefinition') ?? '') : '';
    const reagentDef = scaleProfile ? String(dataPath(scaleProfile, 'reagentSource.labwareDefinition') ?? '') : '';

    const action: Record<string, unknown> = { action: verb };
    const needLabel = payload.materialNeeds?.[0]?.need;
    if (typeof needLabel === 'string' && needLabel.length > 0) action.material = needLabel;
    if (reagentRole && (verb === 'transfer' || verb === 'wash' || verb === 'add_material')) {
      action.source = reagentRole;
      if (reagentDef) action.sourceHint = reagentDef;
    }
    if (sampleRole) {
      action.target = sampleRole;
      action.labware = sampleRole;
      if (sampleDef) action.labwareHint = sampleDef;
    }

    // Typed constraint bounds ride ONLY through declared parameterBindings.
    for (const constraint of payload.constraints ?? []) {
      const bound = constraint.bound as Record<string, unknown> | undefined;
      const dimension = typeof bound?.dimension === 'string' ? bound.dimension : undefined;
      if (!dimension) continue;
      const arg = parameterArgByDimension.get(dimension);
      if (!arg) {
        failures.push({
          code: 'REALIZATION_ANSWER_MISSING',
          message:
            `intent step '${step.stepId}' declares constraint class `
            + `'${String(constraint.class)}' bound in dimension '${dimension}' which has NO `
            + `scientist-intent parameter representation in the realization policy and no `
            + `realization answer — a dropped constraint is silent data loss; declare a `
            + `parameterBinding or answer it.`,
        });
        continue;
      }
      const declared = vocabulary.argContracts(verb).some((a) => a.name === arg);
      if (!declared) {
        failures.push({
          code: 'REALIZATION_ANSWER_MISSING',
          message:
            `intent step '${step.stepId}' constraint dimension '${dimension}' maps to arg `
            + `'${arg}' which the shipped vocabulary does not declare for verb '${verb}' — `
            + `answer it or declare a representable binding.`,
        });
        continue;
      }
      const value = bound?.value;
      if (typeof value === 'number') action[arg] = value;
    }

    actions.push(action);
  }
  if (failures.length > 0) return { failures };

  // Fixed key insertion order -> determinism by construction.
  const document = {
    intentId: `w27-${realization.recordId}`,
    actions,
  };
  const intentYaml = stringifyYaml(document);

  // ---- L6 VALIDATE-IN-PLACE (Ajv sole authority; never a repaired re-try) ----
  try {
    parseScientistIntent(intentYaml);
  } catch (err) {
    if (err instanceof ScientistIntentValidationError) {
      return fail(
        'REALIZATION_EMISSION_INVALID',
        `the lowered document failed the real scientist-intent contract (lowering BUG): `
        + `${JSON.stringify(err.errors)}`,
      );
    }
    throw err;
  }

  return { intentYaml, activeStepIds, scaleProfile };
}

// ---------------------------------------------------------------------------
// Runner glue: lower -> the FROZEN pipeline (no new route, no pipeline edit)
// ---------------------------------------------------------------------------

export interface RealizeAndCompileInput extends LowerRealizationInput {
  compileDeps: ScientistIntentCompileDeps;
}

export type RealizeAndCompileResult =
  | { intentYaml: string; compile: ScientistIntentCompileResult }
  | { failures: RealizationFailure[] };

export async function realizeAndCompile(
  input: RealizeAndCompileInput,
): Promise<RealizeAndCompileResult> {
  const lowered = await lowerRealization(input);
  if ('failures' in lowered) return { failures: lowered.failures };
  const parsed = parseScientistIntent(lowered.intentYaml);
  const compile = await compileScientistIntent(parsed, input.compileDeps);
  return { intentYaml: lowered.intentYaml, compile };
}
