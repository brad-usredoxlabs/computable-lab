/**
 * PB-CH-10 — analysis draft-args grounding (product-side).
 *
 * The analysis-intent outbound surfaces (the `/analysis` chat AND the run-page
 * chat's deck surface) currently give the model NO resolvable ids: the compiler
 * was right every time it refused a coined term (UNRESOLVED_TERM /
 * WRONG_REFERENCE_KIND), the model was simply never shown the real candidates.
 * This module computes the ground-truth block — the records the analysis
 * compiler can ACTUALLY resolve — and the orchestrator pushes it into the
 * shared system-message prefix (warm AND real path, both surfaces, one source).
 *
 * Data, not code (repo rule #1): the kind set is the analysis adapter's own
 * `referenceKinds` (via the existing `loadAnalysisCompositionPolicy` authority,
 * imported not re-implemented); the surfaces list, the per-kind cap and the
 * block title are the `grounding:` section of the same policy YAML; the rule
 * text is `server/prompts/analysis-reference-grounding.md`. Zero kind nouns and
 * zero surface literals live in this file.
 *
 * Reload asymmetry (spec bait): the policy YAML is read PER CALL (adding a
 * process cache here is forbidden — analysisCompile.ts:127-130); the prompt md
 * goes through a process cache like every other prompt template, so a deployed
 * stack needs a restart for md edits to take effect.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { loadAnalysisCompositionPolicy } from '../drafts/analysisCompile.js';

// ---------------------------------------------------------------------------
// Policy DATA: the `grounding:` section of config/drafting/analysis-composition.yaml
// ---------------------------------------------------------------------------

export interface AnalysisGroundingPolicy {
  /** Surface ids the block is pushed on — membership is DATA, never a TS branch. */
  surfaces: string[];
  /** Cap per kind: keeps the prompt delta ~1KB against measured ~14.7K-token prompts. */
  maxPerKind: number;
  /** Block heading, rendered verbatim. */
  title: string;
}

export interface AnalysisReferenceScanPolicy {
  /** The analysis spine's tier-1 kind set (the compiler's own referenceKinds). */
  referenceKinds: string[];
  /** null ⇒ no grounding configured ⇒ no block, no scan. */
  grounding: AnalysisGroundingPolicy | null;
}

const defaultPolicyPath = new URL('../../../config/drafting/analysis-composition.yaml', import.meta.url);

function nonEmptyStringList(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new Error(`analysis grounding policy: ${context} must be a non-empty string list`);
  }
  return value.map((v) => String(v).trim());
}

/**
 * Read the `grounding:` section. ABSENT ⇒ null (the feature is off — the file
 * stays valid without it, so the policy reader never forces the section).
 * Present-but-malformed throws honestly (a half-declared grounding is a config
 * bug, not a silent no-op). `surfaces: []` is treated as OFF (null): an empty
 * membership list means "push nowhere", and the negative arm of the capture
 * test pins that no store scan happens.
 * Loaded per call — do NOT add a process cache (analysisCompile.ts:127-130).
 */
export function loadAnalysisGroundingSection(policyPath: string | URL = defaultPolicyPath): AnalysisGroundingPolicy | null {
  const raw = parse(readFileSync(policyPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('analysis composition policy must be an object');
  }
  const groundingRaw = (raw as Record<string, unknown>).grounding;
  if (groundingRaw === undefined || groundingRaw === null) return null;
  if (typeof groundingRaw !== 'object' || Array.isArray(groundingRaw)) {
    throw new Error('analysis grounding policy: `grounding` must be an object');
  }
  const obj = groundingRaw as Record<string, unknown>;
  if (obj.surfaces === undefined || obj.surfaces === null) return null;
  // `surfaces: []` is OFF, not malformed: an empty membership list means
  // "push nowhere" — the negative arm of the capture test pins zero scans.
  if (Array.isArray(obj.surfaces) && obj.surfaces.length === 0) return null;
  const surfaces = nonEmptyStringList(obj.surfaces, 'grounding.surfaces');
  if (typeof obj.maxPerKind !== 'number' || !Number.isInteger(obj.maxPerKind) || obj.maxPerKind < 1) {
    throw new Error('analysis grounding policy: grounding.maxPerKind must be a positive integer');
  }
  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    throw new Error('analysis grounding policy: grounding.title must be a non-empty string');
  }
  return { surfaces, maxPerKind: obj.maxPerKind, title: obj.title.trim() };
}

// ---------------------------------------------------------------------------
// Rule text DATA: server/prompts/analysis-reference-grounding.md
// ---------------------------------------------------------------------------

const promptCache = new Map<string, string>();

/**
 * Same shape as systemPrompt.ts's loader (cached after first load — the md is
 * process-cached by design; only the YAML is per-call). systemPrompt.ts is
 * locked and its loader is private, so this module owns its own copy for its
 * own file.
 */
function loadPromptTemplate(templatePath: string | URL): string {
  const key = String(templatePath);
  const cached = promptCache.get(key);
  if (cached) return cached;
  const absPath = key.startsWith('file:') ? new URL(key).pathname : key;
  if (!existsSync(absPath)) {
    throw new Error(`Analysis grounding prompt template not found: ${absPath}`);
  }
  const template = readFileSync(absPath, 'utf-8');
  promptCache.set(key, template);
  return template;
}

const rulesPath = new URL('../../prompts/analysis-reference-grounding.md', import.meta.url);

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** The authoritative label a record carries (payload name/title/label, else recordId). */
function recordLabel(record: RecordEnvelope): string {
  const payload = record.payload as Record<string, unknown> | undefined;
  return trimmedString(payload?.name) ?? trimmedString(payload?.title) ?? trimmedString(payload?.label) ?? record.recordId;
}

function recordKind(record: RecordEnvelope): string | null {
  const payload = record.payload as Record<string, unknown> | undefined;
  return trimmedString(payload?.kind) ?? trimmedString(record.meta?.kind);
}

/** Code-unit ordering: byte-deterministic across locales, unlike localeCompare. */
function byRecordId(a: RecordEnvelope, b: RecordEnvelope): number {
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}

/**
 * Render the grounded reference block: for each declared reference kind, the
 * store's records for that kind, sorted by recordId (determinism — the warm
 * and the real prefix must be byte-identical or the KV warm cache dies),
 * capped at maxPerKind. null when nothing is listable or grounding is absent
 * (never an empty block: an empty candidate list is noise, not grounding).
 */
export async function buildAnalysisReferenceBlock(
  store: RecordStore,
  scan: AnalysisReferenceScanPolicy,
): Promise<string | null> {
  if (!scan.grounding) return null;
  const { maxPerKind, title } = scan.grounding;
  const lines: string[] = [title];
  for (const kind of scan.referenceKinds) {
    const records = (await store.list({ kind })).slice().sort(byRecordId).slice(0, maxPerKind);
    for (const record of records) {
      lines.push(`- ${recordKind(record) ?? kind} | ${record.recordId} | ${recordLabel(record)}`);
    }
  }
  if (lines.length === 1) return null;
  return [lines.join('\n'), loadPromptTemplate(rulesPath)].join('\n\n');
}

/**
 * The orchestrator's per-request entry point: load the grounding section, gate
 * on surface MEMBERSHIP read from DATA (no surface-name branch in TS), and
 * only then scan the store. A non-listed surface costs zero store calls.
 */
export async function buildAnalysisGroundingBlockForSurface(
  store: RecordStore,
  surface: string | undefined,
  policyPath: string | URL = defaultPolicyPath,
): Promise<string | null> {
  const grounding = loadAnalysisGroundingSection(policyPath);
  if (!grounding) return null;
  if (!surface || !grounding.surfaces.includes(surface)) return null;
  return buildAnalysisReferenceBlock(store, {
    referenceKinds: loadAnalysisCompositionPolicy().referenceKinds,
    grounding,
  });
}
