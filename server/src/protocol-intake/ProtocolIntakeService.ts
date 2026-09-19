/**
 * ProtocolIntakeService — turn ONE source protocol document into a reviewable
 * decision tree + the deterministic set of subgraph proposals.
 *
 * Orchestration only: every domain rule lives in the collaborators it calls
 * (candidate extraction, deriveDecisionTree, enumerateChoiceBindings,
 * BranchResolver, the draft/promote pipeline) and in the PDT/SGP schemas.
 * Fail loud — never fabricate a branch answer or an event graph.
 *
 * Flow: extract candidate -> derive decision tree (logical question axes +
 * execution-scale axis) -> enumerate the Cartesian choice bindings -> per
 * binding x scale: resolveBranchAxes -> draft event graph -> promote (even
 * when blocked, so the reviewer sees the gap) -> persist SGP proposal.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RecordStoreImpl } from '../store/RecordStoreImpl.js';
import type { AjvValidator } from '../validation/AjvValidator.js';
import { createEnvelope } from '../types/RecordEnvelope.js';
import type { RunChatbotCompileResult } from '../ai/runChatbotCompile.js';
import {
  extractVendorProtocolCandidateFromInput,
} from '../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
import type { ProtocolCandidate } from '../ingestion/vendor-protocol/types.js';
import {
  deriveDecisionTree,
  type DecisionTreeScaleOption,
  type ProtocolDecisionTree,
} from './deriveDecisionTree.js';
import {
  enumerateChoiceBindings,
  type ChoiceBinding,
} from './enumerateChoiceBindings.js';
import { resolveBranchAxes } from '../protocol/BranchResolver.js';
import { draftVendorProtocolEventGraph } from '../ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.js';
import { promoteVendorProtocolEventGraph } from '../ingestion/vendor-protocol/VendorProtocolEventGraphPromotionService.js';
import { getExecutionScaleProfileRegistry } from '../registry/ExecutionScaleProfileRegistry.js';

export const PROTOCOL_DECISION_TREE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/protocol-decision-tree.schema.yaml';
export const SUBGRAPH_PROPOSAL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/subgraph-proposal.schema.yaml';

export interface IntakeDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface IngestPdfResult {
  documentId: string;
  treeRecordId: string;
  proposalRecordIds: string[];
  eventGraphRecordIds: string[];
  diagnostics: IntakeDiagnostic[];
}

export interface ProtocolIntakeDeps {
  workspaceRoot: string;
  store: RecordStoreImpl;
  /** Used to validate PDT/SGP payloads before persistence when present. */
  validator?: AjvValidator;
  /** Omit => deterministic-only draft (compile false); never fabricated. */
  compileRunner?: (args: {
    prompt: string;
    candidate: ProtocolCandidate;
    deterministicOnly: boolean;
  }) => Promise<RunChatbotCompileResult>;
  /** Omit => derived from the execution-scale-profile registry. */
  scaleOptions?: DecisionTreeScaleOption[];
}

export interface IngestDocumentInput {
  artifactPath?: string;
  /** Test/offline path: raw protocol text instead of a stored PDF. */
  text?: string;
  fileName?: string;
  vendor?: string;
  documentId?: string;
  maxProposals?: number;
  now?: string;
}

/** Registry levels are data; this never hardcodes the scale set. */
export function scaleOptionsFromRegistry(): DecisionTreeScaleOption[] {
  const profiles = getExecutionScaleProfileRegistry().list();
  const byLevel = new Map<string, { profileId: string; priority: number }>();
  for (const profile of profiles) {
    const existing = byLevel.get(profile.targetLevel);
    if (!existing || profile.priority < existing.priority) {
      byLevel.set(profile.targetLevel, { profileId: profile.recordId, priority: profile.priority });
    }
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([level, { profileId }]) => ({
      level: level as DecisionTreeScaleOption['level'],
      profileId,
    }));
}

/**
 * Question gate — the pipeline answers the PDF's if/then questions by
 * EXHAUSTIVE enumeration, never by silently dropping them (the original
 * failure mode: branchy steps became a passive review gap and drafting
 * proceeded with questions never materialized). Invariants, checked against
 * the tree before ANY proposal is drafted:
 *
 *  1. A document with branchy steps (>=2 distinct branches, mirroring
 *     deriveBranchAxes) that yielded zero question axes is a derivation bug
 *     — the branches were silently dropped. Refuse to draft.
 *  2. Every axis with conditions must have at least one condition carrying
 *     then_stepIds — an axis nobody's answer can act on is not a question,
 *     it is decoration. (Zero-condition axes are explicitly non-gating per
 *     the plan: the question is kept as tree notes, drafting continues.)
 */
export type QuestionGateVerdict =
  | { ok: true }
  | { ok: false; code: 'derivation_silent_branch_drop' | 'axis_without_resolvable_conditions'; message: string };

export function questionGate(tree: ProtocolDecisionTree, branchyStepCount: number): QuestionGateVerdict {
  if (branchyStepCount > 0 && tree.axes.length === 0) {
    return {
      ok: false,
      code: 'derivation_silent_branch_drop',
      message: `source document has ${branchyStepCount} branchy step(s) but the decision tree has zero question axes; refusing to draft (questions would go unanswered)`,
    };
  }
  for (const axis of tree.axes) {
    if (axis.conditions.length === 0) continue; // explicit non-gating question
    const actionable = axis.conditions.some((c) => Array.isArray(c.then_stepIds) && c.then_stepIds.length > 0);
    if (!actionable) {
      return {
        ok: false,
        code: 'axis_without_resolvable_conditions',
        message: `question axis ${axis.axisId} has ${axis.conditions.length} condition(s) but none gate any steps; refusing to draft`,
      };
    }
  }
  return { ok: true };
}

/**
 * The reviewer-facing record of WHY a subgraph looks the way it does:
 * the question trail, the chosen answers, the scale, and any redraft
 * instruction. Deterministic from (tree, binding, scale) inputs.
 */
export function buildDecisionBlock(
  tree: ProtocolDecisionTree,
  binding: ChoiceBinding,
  scaleOption: DecisionTreeScaleOption,
  reviewPrompt?: string,
): string {
  const lines: string[] = ['## Resolved branch decisions'];
  for (const step of binding.branchPath) {
    const axis = tree.axes.find((a) => a.axisId === step.axisId);
    const answer = step.label ?? step.conditionId;
    lines.push(`- ${axis?.question ?? step.axisId} => ${answer} (axis ${step.axisId})`);
  }
  lines.push(
    `- Execution scale: ${scaleOption.level} (deck profile: ${scaleOption.profileId ?? 'none declared'})`,
  );
  if (reviewPrompt && reviewPrompt.trim().length > 0) {
    lines.push(`- Redraft instruction: ${reviewPrompt.trim()}`);
  }
  return lines.join('\n');
}

/** Keep ids inside the PDT-/SGP- pattern alphabet. */
function sanitizeIdSegment(value: string): string {
  const cleaned = value
    .replace(extLikeSegment, '-')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return cleaned.length > 0 ? cleaned : 'document';
}
const extLikeSegment = /\.[A-Za-z0-9]{1,5}$/;

function proposalIdFor(treeRecordId: string, bindingIndex: number, scaleIndex: number, revision?: number): string {
  const docSlug = treeRecordId.startsWith('PDT-') ? treeRecordId.slice(4) : treeRecordId;
  const base = `SGP-${docSlug}-b${bindingIndex}-s${scaleIndex}`;
  return revision && revision > 1 ? `${base}-r${revision}` : base;
}

const PROPOSAL_ID_REGEX = /^SGP-(.+)-b(\d+)-s(\d+)(?:-r(\d+))?$/;

interface PersistedProposalPayload {
  recordId: string;
  treeRef: { id: string };
  documentId: string;
  branchPath: Array<{ axisId: string; conditionId: string; label?: string }>;
  scaleLevel: DecisionTreeScaleOption['level'];
  choices: Record<string, unknown>;
  activeStepIds?: string[];
  reviewPrompt?: string;
  revision?: number;
  state?: string;
  notes?: string;
  [key: string]: unknown;
}

export class ProtocolIntakeService {
  private readonly deps: ProtocolIntakeDeps;

  constructor(deps: ProtocolIntakeDeps) {
    this.deps = deps;
  }

  async ingestDocument(input: IngestDocumentInput): Promise<IngestPdfResult> {
    const diagnostics: IntakeDiagnostic[] = [];
    const { workspaceRoot } = this.deps;

    if (!input.artifactPath && !input.text) {
      throw new Error('ingestDocument requires artifactPath or text');
    }

    // 1. Deterministic candidate extraction (document truth + provenance).
    const extraction = await extractVendorProtocolCandidateFromInput({
      workspaceRoot,
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.fileName ? { fileName: input.fileName } : {}),
      ...(input.vendor ? { vendor: input.vendor } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
      persist: true,
    });
    const candidate = extraction.candidate;
    const documentId = candidate.source.documentId;
    const docSlug = sanitizeIdSegment(input.documentId ?? documentId);

    // 2. Scale options from the registry unless the caller pinned them.
    const scaleOptions = this.deps.scaleOptions ?? scaleOptionsFromRegistry();
    if (scaleOptions.length === 0) {
      return {
        documentId,
        treeRecordId: '',
        proposalRecordIds: [],
        eventGraphRecordIds: [],
        diagnostics: [{
          severity: 'error',
          code: 'scale_registry_empty',
          message: 'execution-scale-profile registry yielded no scale levels; refusing to fabricate a scale axis',
        }],
      };
    }

    // 3. Derive the decision tree.
    const tree = deriveDecisionTree({
      documentId: docSlug,
      steps: candidate.steps,
      scaleOptions,
      sourcePdf: {
        ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
        ...(input.vendor ? { vendor: input.vendor } : {}),
        ...(candidate.source.version ? { version: candidate.source.version } : {}),
      },
      ...(input.now ? { now: input.now } : {}),
    });

    // 4. Persist the tree (idempotent). The effective tree is the STORED
    //    payload when one already exists — records are the truth.
    const effectiveTree = await this.persistTree(tree, diagnostics);
    if (!effectiveTree) {
      return { documentId, treeRecordId: tree.recordId, proposalRecordIds: [], eventGraphRecordIds: [], diagnostics };
    }

    // 4b. Question gate: refuse to draft if the if/then questions were never
    //     materialized (silent branch drop) or an axis is unanswerable.
    const branchyStepCount = candidate.steps.filter(
      (step) => new Set((step.branches ?? []).map((b) => b.trim()).filter(Boolean)).size >= 2,
    ).length;
    const gate = questionGate(effectiveTree, branchyStepCount);
    if (!gate.ok) {
      diagnostics.push({ severity: 'error', code: gate.code, message: gate.message });
      return { documentId, treeRecordId: effectiveTree.recordId, proposalRecordIds: [], eventGraphRecordIds: [], diagnostics };
    }

    // 5. Enumerate the deterministic binding set.
    const enumRes = enumerateChoiceBindings(effectiveTree.axes, input.maxProposals ?? 12);
    if (enumRes.truncated) {
      diagnostics.push({
        severity: 'warning',
        code: 'branch_product_truncated',
        message: `branch product is ${enumRes.productSize}; capped at ${enumRes.bindings.length}. Raise maxProposals to cover the full set.`,
      });
    }

    // 6. Draft + promote + propose per binding x scale level. Scale comes
    //    from the EFFECTIVE tree (records are the truth; the redraft path
    //    resolves scaleIndex against tree.scaleAxis.options).
    const proposalRecordIds: string[] = [];
    const eventGraphRecordIds: string[] = [];
    for (const [bindingIndex, binding] of enumRes.bindings.entries()) {
      for (const [scaleIndex, scaleOption] of effectiveTree.scaleAxis.options.entries()) {
        const outcome = await this.draftOneProposal({
          tree: effectiveTree,
          candidate,
          binding,
          bindingIndex,
          scaleOption,
          scaleIndex,
          revision: 1,
          ...(input.now ? { now: input.now } : {}),
        });
        if (outcome.diagnostic) diagnostics.push(outcome.diagnostic);
        if (outcome.proposalRecordId) proposalRecordIds.push(outcome.proposalRecordId);
        if (outcome.eventGraphRecordId) eventGraphRecordIds.push(outcome.eventGraphRecordId);
      }
    }

    // 7. Run report artifact (review trail; not a record).
    const result: IngestPdfResult = { documentId, treeRecordId: effectiveTree.recordId, proposalRecordIds, eventGraphRecordIds, diagnostics };
    await this.writeReport(docSlug, {
      ...result,
      productSize: enumRes.productSize,
      truncated: enumRes.truncated,
    });
    return result;
  }

  /**
   * Re-run the draft for ONE proposal, bumping revision. The SGP's stored
   * choices + scale + reviewPrompt are the whole input — deterministic.
   */
  async redraftProposal(input: { proposalRecordId: string; now?: string }): Promise<IngestPdfResult> {
    const diagnostics: IntakeDiagnostic[] = [];
    const { store, workspaceRoot } = this.deps;

    const sgpEnvelope = await store.get(input.proposalRecordId);
    if (!sgpEnvelope) {
      throw new Error(`Subgraph proposal not found: ${input.proposalRecordId}`);
    }
    const payload = sgpEnvelope.payload as unknown as PersistedProposalPayload;
    const treeEnvelope = await store.get(payload.treeRef.id);
    if (!treeEnvelope) {
      throw new Error(`Decision tree not found for proposal ${input.proposalRecordId}: ${payload.treeRef.id}`);
    }
    const tree = treeEnvelope.payload as unknown as ProtocolDecisionTree;

    const match = PROPOSAL_ID_REGEX.exec(payload.recordId);
    if (!match) {
      throw new Error(`Cannot derive binding coordinates from proposal id: ${payload.recordId}`);
    }
    const bindingIndex = Number.parseInt(match[2] ?? '0', 10);
    const scaleIndex = Number.parseInt(match[3] ?? '0', 10);

    const scaleOption = tree.scaleAxis.options[scaleIndex];
    if (!scaleOption) {
      throw new Error(`Scale option index ${scaleIndex} not present on tree ${tree.recordId}`);
    }
    const binding = {
      branchPath: payload.branchPath,
      choices: payload.choices ?? { branchSelection: {} },
    };

    // The candidate must be re-extractable from the stored PDF artifact.
    const sourceArtifact = typeof tree.sourcePdf?.['artifactPath'] === 'string' ? (tree.sourcePdf['artifactPath'] as string) : undefined;
    if (!sourceArtifact) {
      return {
        documentId: payload.documentId,
        treeRecordId: tree.recordId,
        proposalRecordIds: [],
        eventGraphRecordIds: [],
        diagnostics: [{
          severity: 'error',
          code: 'candidate_source_unavailable',
          message: 'tree carries no sourcePdf.artifactPath; cannot re-extract the candidate for redraft',
        }],
      };
    }
    const extraction = await extractVendorProtocolCandidateFromInput({
      workspaceRoot,
      artifactPath: sourceArtifact,
      persist: false,
    });

    const revision = (payload.revision ?? 1) + 1;
    const outcome = await this.draftOneProposal({
      tree,
      candidate: extraction.candidate,
      binding,
      bindingIndex,
      scaleOption,
      scaleIndex,
      revision,
      ...(payload.reviewPrompt ? { reviewPrompt: payload.reviewPrompt } : {}),
      updateExistingProposal: { payload, recordId: payload.recordId },
      ...(input.now ? { now: input.now } : {}),
    });
    if (outcome.diagnostic) diagnostics.push(outcome.diagnostic);
    return {
      documentId: payload.documentId,
      treeRecordId: tree.recordId,
      proposalRecordIds: outcome.proposalRecordId ? [outcome.proposalRecordId] : [],
      eventGraphRecordIds: outcome.eventGraphRecordId ? [outcome.eventGraphRecordId] : [],
      diagnostics,
    };
  }

  private async persistTree(tree: ProtocolDecisionTree, diagnostics: IntakeDiagnostic[]): Promise<ProtocolDecisionTree | null> {
    const { store, validator } = this.deps;
    const existing = await store.get(tree.recordId);
    if (existing) {
      diagnostics.push({ severity: 'info', code: 'tree_exists', message: `Decision tree ${tree.recordId} already exists; reusing` });
      return (existing.payload as unknown as ProtocolDecisionTree) ?? tree;
    }
    if (validator) {
      const check = validator.validate(tree as unknown as Record<string, unknown>, PROTOCOL_DECISION_TREE_SCHEMA_ID);
      if (!check.valid) {
        diagnostics.push({
          severity: 'error',
          code: 'tree_validation_failed',
          message: `Decision tree failed schema validation: ${JSON.stringify(check.errors ?? []).slice(0, 400)}`,
        });
        return null;
      }
    }
    const envelope = createEnvelope(tree as unknown as Record<string, unknown>, PROTOCOL_DECISION_TREE_SCHEMA_ID);
    if (!envelope) {
      diagnostics.push({ severity: 'error', code: 'tree_envelope_failed', message: 'Could not build envelope for decision tree' });
      return null;
    }
    const created = await store.create({ envelope, message: `intake: decision tree ${tree.recordId}` });
    if (!created.success) {
      diagnostics.push({ severity: 'error', code: 'tree_create_failed', message: created.error ?? 'store.create failed' });
      return null;
    }
    return tree;
  }

  private async draftOneProposal(args: {
    tree: ProtocolDecisionTree;
    candidate: ProtocolCandidate;
    binding: ChoiceBinding;
    bindingIndex: number;
    scaleOption: DecisionTreeScaleOption;
    scaleIndex: number;
    revision: number;
    reviewPrompt?: string;
    now?: string;
    updateExistingProposal?: { payload: PersistedProposalPayload; recordId: string };
  }): Promise<{ proposalRecordId?: string; eventGraphRecordId?: string; diagnostic?: IntakeDiagnostic }> {
    const { tree, candidate, binding, bindingIndex, scaleOption, scaleIndex, revision } = args;
    const { workspaceRoot, store, validator } = this.deps;

    const proposalRecordId = args.updateExistingProposal
      ? args.updateExistingProposal.recordId
      : proposalIdFor(tree.recordId, bindingIndex, scaleIndex);

    // Dedupe guard for fresh intake (never overwrite reviewed work silently).
    if (!args.updateExistingProposal) {
      const existing = await store.get(proposalRecordId);
      if (existing) {
        const eventGraphRef = (existing.payload as Record<string, unknown>)?.['eventGraphRef'];
        const existingEventGraphId =
          eventGraphRef && typeof eventGraphRef === 'object'
            ? String((eventGraphRef as Record<string, unknown>)['id'] ?? '')
            : '';
        return {
          proposalRecordId,
          ...(existingEventGraphId ? { eventGraphRecordId: existingEventGraphId } : {}),
          diagnostic: { severity: 'info', code: 'proposal_exists', message: `${proposalRecordId} already exists; skipping` },
        };
      }
    }

    // Resolve the branch selection (fail loud on unresolved axes).
    let activeStepIds: string[];
    if (tree.axes.length === 0) {
      // Degenerate protocol: no branches to select — the whole linear run.
      activeStepIds = candidate.steps.map((step) => step.id);
    } else {
      const resolution = resolveBranchAxes({
        branchAxes: tree.axes,
        // Choices are a slug-only map by construction (enumerateChoiceBindings).
        choices: binding.choices as Record<string, string | number | boolean | null>,
      });
      if (!resolution.ok) {
        return {
          diagnostic: { severity: 'warning', code: 'branch_unresolved', message: resolution.gap },
        };
      }
      activeStepIds = resolution.activeStepIds;
    }

    const decisionBlock = buildDecisionBlock(tree, binding, scaleOption, args.reviewPrompt);

    const shouldCompile = Boolean(this.deps.compileRunner);
    const draft = await draftVendorProtocolEventGraph({
      workspaceRoot,
      candidate,
      compile: shouldCompile,
      ...(this.deps.compileRunner
        ? { compileRunner: this.deps.compileRunner, deterministicOnly: false }
        : { deterministicOnly: true }),
      persist: true,
    });

    const evgSuffix = revision > 1 ? `-r${revision}` : '';
    const promote = await promoteVendorProtocolEventGraph({
      workspaceRoot,
      draft,
      recordId: `EVG-${tree.recordId}-b${bindingIndex}-s${scaleIndex}${evgSuffix}`,
      allowIncompleteCompile: true,
      allowEmptyEvents: true,
    });
    // Blocked promotion still yields a reviewable proposal with the gap
    // visible; we never hide the decision trail behind a fabrication.
    const eventGraphRecordId = promote.recordId;

    const generatedAt = args.now ?? new Date().toISOString();
    const proposalPayload: Record<string, unknown> = {
      kind: 'subgraph-proposal',
      recordId: proposalRecordId,
      treeRef: { kind: 'record', id: tree.recordId, type: 'protocol-decision-tree' },
      documentId: candidate.source.documentId,
      branchPath: binding.branchPath,
      scaleLevel: scaleOption.level,
      ...(scaleOption.profileId
        ? { deckProfileRef: { kind: 'record', id: scaleOption.profileId, type: 'execution-scale-profile' } }
        : {}),
      choices: binding.choices,
      activeStepIds,
      eventGraphRef: { kind: 'record', id: eventGraphRecordId, type: 'event-graph' },
      compileStatus: draft.compileStatus,
      state: args.updateExistingProposal ? 'redrafted' : 'proposed',
      revision,
      generatedAt,
      notes: decisionBlock,
    };

    if (validator) {
      const check = validator.validate(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID);
      if (!check.valid) {
        return {
          eventGraphRecordId,
          diagnostic: {
            severity: 'error',
            code: 'proposal_validation_failed',
            message: `${proposalRecordId} failed schema validation: ${JSON.stringify(check.errors ?? []).slice(0, 400)}`,
          },
        };
      }
    }

    const envelope = createEnvelope(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID);
    if (!envelope) {
      return { eventGraphRecordId, diagnostic: { severity: 'error', code: 'proposal_envelope_failed', message: 'Could not build proposal envelope' } };
    }

    if (args.updateExistingProposal) {
      const updated = await store.update({ envelope, message: `intake: redraft ${proposalRecordId} rev ${revision}` });
      if (!updated.success) {
        return {
          eventGraphRecordId,
          diagnostic: { severity: 'error', code: 'proposal_update_failed', message: updated.error ?? 'store.update failed' },
        };
      }
    } else {
      const created = await store.create({ envelope, message: `intake: proposal ${proposalRecordId}` });
      if (!created.success) {
        return {
          eventGraphRecordId,
          diagnostic: { severity: 'error', code: 'proposal_create_failed', message: created.error ?? 'store.create failed' },
        };
      }
    }

    return { proposalRecordId, eventGraphRecordId };
  }

  private async writeReport(docSlug: string, report: Record<string, unknown>): Promise<void> {
    const reportPath = join(this.deps.workspaceRoot, 'artifacts', 'foundry', 'intake', `${docSlug}.intake.json`);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  }
}
