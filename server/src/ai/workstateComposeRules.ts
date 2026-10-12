/**
 * PB-CH-6 fix1 F1 — WORKSTATE COMPOSE RULES block (product-side).
 *
 * On the generic drafting mounts (`/analysis`, `/literature?view=build`) the
 * model emits bare-surface workstate tabs with no `target` because the only
 * guidance there is the tool schema — the compile envelope requires
 * {surface, target} per tab (workstate-intent.schema.yaml) but no prompt text
 * ever said so (gate receipts: MALFORMED_ENVELOPE). This module ships the
 * rule text as DATA and the orchestrator pushes it into the shared
 * system-message prefix (warm AND real path, one site).
 *
 * Data, not code (repo rule #1): the surface membership is the `rules:`
 * section of config/drafting/workstate-composition.yaml; the rule text is
 * `server/prompts/workstate-compose-rules.md`. Zero surface literals live in
 * this file. Unlike the PB-CH-10 grounding block there is NO store scan —
 * the rules carry no ground-truth ids, so a non-listed surface costs nothing.
 *
 * Reload asymmetry (the analysisReferenceGrounding.ts contract, copied): the
 * policy YAML is read PER CALL (no process cache); the prompt md goes through
 * a process cache like every other prompt template, so a deployed stack needs
 * a restart for md edits to take effect.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

// ---------------------------------------------------------------------------
// Policy DATA: the `rules:` section of config/drafting/workstate-composition.yaml
// ---------------------------------------------------------------------------

export interface WorkstateRulesPolicy {
  /** Surface ids the block is pushed on — membership is DATA, never a TS branch. */
  surfaces: string[];
  /** Rule-text prompt template, resolved relative to the server root. */
  file: string;
}

const defaultPolicyPath = new URL('../../../config/drafting/workstate-composition.yaml', import.meta.url);

function nonEmptyStringList(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new Error(`workstate composition policy: ${context} must be a non-empty string list`);
  }
  return value.map((v) => String(v).trim());
}

/**
 * Read the `rules:` section. ABSENT ⇒ null (the feature is off — the file
 * stays valid without it, so the policy reader never forces the section).
 * Present-but-malformed throws honestly (a half-declared rule block is a
 * config bug, not a silent no-op). `surfaces: []` is treated as OFF (null):
 * an empty membership list means "push nowhere".
 * Loaded per call — do NOT add a process cache (the analysis-composition.yaml
 * precedent, analysisCompile.ts:127-130).
 */
export function loadWorkstateRulesSection(policyPath: string | URL = defaultPolicyPath): WorkstateRulesPolicy | null {
  const raw = parse(readFileSync(policyPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('workstate composition policy must be an object');
  }
  const rulesRaw = (raw as Record<string, unknown>).rules;
  if (rulesRaw === undefined || rulesRaw === null) return null;
  if (typeof rulesRaw !== 'object' || Array.isArray(rulesRaw)) {
    throw new Error('workstate composition policy: `rules` must be an object');
  }
  const obj = rulesRaw as Record<string, unknown>;
  if (obj.surfaces === undefined || obj.surfaces === null) return null;
  // `surfaces: []` is OFF, not malformed: an empty membership list means
  // "push nowhere" — same ruling as the grounding section.
  if (Array.isArray(obj.surfaces) && obj.surfaces.length === 0) return null;
  const surfaces = nonEmptyStringList(obj.surfaces, 'rules.surfaces');
  if (typeof obj.file !== 'string' || obj.file.trim().length === 0) {
    throw new Error('workstate composition policy: rules.file must be a non-empty string');
  }
  return { surfaces, file: obj.file.trim() };
}

// ---------------------------------------------------------------------------
// Rule text DATA: the md named by rules.file (default
// server/prompts/workstate-compose-rules.md)
// ---------------------------------------------------------------------------

const promptCache = new Map<string, string>();

/**
 * Same shape as systemPrompt.ts's loader (cached after first load — the md is
 * process-cached by design; only the YAML is per-call). systemPrompt.ts is
 * locked and its loader is private, so this module owns its own copy for its
 * own file. `rules.file` is resolved relative to the server root — the same
 * resolution the analysis-reference-grounding.md path uses.
 */
function loadPromptTemplate(templatePath: string | URL): string {
  const key = String(templatePath);
  const cached = promptCache.get(key);
  if (cached) return cached;
  const absPath = key.startsWith('file:') ? new URL(key).pathname : key;
  if (!existsSync(absPath)) {
    throw new Error(`Workstate rules prompt template not found: ${absPath}`);
  }
  const template = readFileSync(absPath, 'utf-8');
  promptCache.set(key, template);
  return template;
}

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

/**
 * The orchestrator's per-request entry point: load the rules section, gate on
 * surface MEMBERSHIP read from DATA (no surface-name branch in TS), and render
 * the rule text. No store scan, no ids — the block is pure policy text.
 */
export function buildWorkstateRulesBlockForSurface(
  surface: string | undefined,
  policyPath: string | URL = defaultPolicyPath,
): string | null {
  const rules = loadWorkstateRulesSection(policyPath);
  if (!rules) return null;
  if (!surface || !rules.surfaces.includes(surface)) return null;
  const templatePath = new URL(`../../../server/${rules.file}`, import.meta.url);
  return loadPromptTemplate(templatePath);
}
