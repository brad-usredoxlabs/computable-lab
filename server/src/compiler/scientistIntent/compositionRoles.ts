/**
 * MIXROLE-1 (Brad ruling 2026-10-22, spec §5b): the generic composition ROLE-GAP
 * evaluator. ZERO domain knowledge: the gap role, the firing arms, the sibling role,
 * and the question text are DATA from config/drafting/composition-role-guidance.yaml
 * (loaded PER call, mirroring the mixture-cue + fraction-convention discipline:
 * absent file => check OFF — LOUD, one console.warn naming the path;
 * present-but-malformed => throws naming the path). No role literal, no reagent noun,
 * no biology, no intent inference appears in this file (repo rule #1 / CLAUDE.md
 * "The Hard Boundary"); the reason-code string follows the existing TS `as const`
 * registration precedent (channel contract, not policy).
 *
 * The defect this closes: a component whose declared role contradicts what it IS
 * (the enzyme that detaches the cells was emitted as the mixture's solvent) compiled
 * clean. Roles are how downstream reasoning reads a mixture, so a wrong role is a
 * wrong fact in the ledger even when every component is right. There is NO honest
 * machine-check for role FIT (roles are semantics, not structure — a solvent beside a
 * cells entry is the shape of virtually every correct cell-culture medium), so this
 * evaluator does NOT judge biology. It fires on the STRUCTURAL FINGERPRINT of an
 * honest gap — an entry that fell to the enum's fallback role in a composition where
 * role integrity matters — and asks the SCIENTIST for the intended use in their own
 * words. The answer rides the existing clarification-answers channel as opaque text;
 * the compiler never infers intent from a name, synonym, or word pattern, and never
 * resolves a gap by confidence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/** Stable reason code (TS registration of the clarification channel, per the
 *  UNREALIZED_* / MIXTURE_BLOB_* / COMPOSITION_FRACTION_SUM `as const` precedent in
 *  normalizeScientistIntent.ts). */
export const COMPOSITION_ROLE_GAP_REASON = 'composition-role-gap' as const;
export type CompositionRoleGapReason = typeof COMPOSITION_ROLE_GAP_REASON;

// ---------------------------------------------------------------------------
// The guidance DATA shape (config/drafting/composition-role-guidance.yaml)
// ---------------------------------------------------------------------------

/** One declared firing arm: the interpreter arm id (known to the evaluator) plus
 *  its DATA. `siblingRole` — the composition carries at least one OTHER entry whose
 *  role equals `role`. The arm id is an interpreter contract; the role name is DATA. */
export interface RoleGapFiresOnArm {
  arm: string;
  role?: string;
}

export interface CompositionRoleGuidanceConfig {
  gapRole: string;
  firesOn: readonly RoleGapFiresOnArm[];
  question: string;
}

/** One gap fact the evaluator raises (the normalize side stamps the
 *  actionLocation — the evaluator knows no action index). */
export interface RoleGapClarification {
  label: string;
  reason: CompositionRoleGapReason;
  message: string;
}

// ---------------------------------------------------------------------------
// Loader (per call, never process-cached; LOUD off-state, loud malformed)
// ---------------------------------------------------------------------------

export const COMPOSITION_ROLE_GUIDANCE_PATH = new URL(
  '../../../../config/drafting/composition-role-guidance.yaml', import.meta.url,
);

/** One warn per (path, reason) pair — the per-call load stays, the diagnostic
 *  does not spam (the compositionFractions fix1/D3 idiom). */
const roleGapOffWarned = new Set<string>();

function warnRoleGapCheckOff(path: string, reason: string): void {
  const key = `${path}\u0000${reason}`;
  if (roleGapOffWarned.has(key)) return;
  roleGapOffWarned.add(key);
  console.warn(`[composition-role-gap-check-off] ${reason} — the composition role-gap affordance is OFF; composition entries pass through unchanged. Guidance data home: ${path}`);
}

function requireString(value: unknown, label: string, path: string): string {
  if (typeof value !== 'string' || !value.length) {
    throw new Error(`composition role guidance (${path}): \`${label}\` must be a non-empty string`);
  }
  return value;
}

/** The arms the evaluator knows. An arm id is an interpreter contract (like the
 *  fraction convention's `phraseMatch` / `whenEvidence` arm names) — never a role. */
const KNOWN_ARMS: readonly string[] = ['siblingRole'];

function requireFiresOn(raw: unknown, path: string): RoleGapFiresOnArm[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`composition role guidance (${path}): \`firesOn\` must be a non-empty list of arms`);
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`composition role guidance (${path}): \`firesOn[${index}]\` must be an object with an \`arm\``);
    }
    const arm = requireString((entry as Record<string, unknown>).arm, `firesOn[${index}].arm`, path);
    if (!KNOWN_ARMS.includes(arm)) {
      throw new Error(`composition role guidance (${path}): \`firesOn[${index}]\` declares an unknown arm \`${arm}\` (known: ${KNOWN_ARMS.join(', ')})`);
    }
    const role = (entry as Record<string, unknown>).role;
    if (role !== undefined && typeof role !== 'string') {
      throw new Error(`composition role guidance (${path}): \`firesOn[${index}].role\` must be a string when present`);
    }
    return {
      arm,
      ...(typeof role === 'string' && role.length > 0 ? { role } : {}),
    };
  });
}

export function loadCompositionRoleGuidance(
  path: URL | string = COMPOSITION_ROLE_GUIDANCE_PATH,
): CompositionRoleGuidanceConfig | undefined {
  const displayPath = String(path);
  if (!existsSync(path)) {
    warnRoleGapCheckOff(displayPath, `guidance data home not found (${displayPath})`);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`composition role guidance unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) {
    warnRoleGapCheckOff(displayPath, `guidance data home (${displayPath}) is empty`);
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`composition role guidance (${displayPath}): must be an object`);
  }
  const doc = raw as Record<string, unknown>;
  if (doc.gapRole === undefined || doc.gapRole === null) {
    warnRoleGapCheckOff(displayPath, `guidance data home (${displayPath}) has no \`gapRole:\` section`);
    return undefined;
  }
  if (doc.firesOn === undefined || doc.firesOn === null) {
    warnRoleGapCheckOff(displayPath, `guidance data home (${displayPath}) has no \`firesOn:\` section`);
    return undefined;
  }
  if (doc.question === undefined || doc.question === null) {
    warnRoleGapCheckOff(displayPath, `guidance data home (${displayPath}) has no \`question:\` section`);
    return undefined;
  }
  return {
    gapRole: requireString(doc.gapRole, 'gapRole', displayPath),
    firesOn: requireFiresOn(doc.firesOn, displayPath),
    question: requireString(doc.question, 'question', displayPath),
  };
}

// ---------------------------------------------------------------------------
// Generic interpretation helpers (no domain knowledge)
// ---------------------------------------------------------------------------

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key]! : whole));
}

/** The (label, role) pair of one composition entry, generically. An entry that is
 *  not an object or carries no usable label/role is skipped (the expander's own
 *  defensive-drop already owns malformed entries; this bar never guesses one). */
function readEntry(raw: unknown): { label: string; role: string } | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const entry = raw as Record<string, unknown>;
  const label = typeof entry['material'] === 'string' ? entry['material'].trim() : '';
  const role = typeof entry['role'] === 'string' ? entry['role'].trim() : '';
  if (!label.length || !role.length) return undefined;
  return { label, role };
}

/** Does the composition satisfy the declared firing arms BESIDES the gap entry
 *  itself? Generic over the DATA arms — the evaluator knows the arm id, never a
 *  role name. */
function firesOnSatisfied(
  entries: ReadonlyArray<{ label: string; role: string }>,
  gapIndex: number,
  config: CompositionRoleGuidanceConfig,
): boolean {
  return config.firesOn.every((arm) => {
    if (arm.arm === 'siblingRole') {
      if (arm.role === undefined) return false;
      return entries.some((e, index) => index !== gapIndex && e.role === arm.role);
    }
    // Unreachable: the loader rejects unknown arms. Loud, never silent.
    throw new Error(`composition role guidance: unhandled firing arm \`${arm.arm}\``);
  });
}

/**
 * Evaluate one declared composition for the structural fingerprint of an honest
 * role gap. Returns ONE clarification per gap entry (never one per word of a label,
 * never a confidence ranking): label = the component's OWN name, reason =
 * composition-role-gap, message = the DATA question naming no enum member.
 *
 * SUPPRESSION (the bar-loop guard): once the scientist has ANSWERED a gap — an
 * answers entry whose KEY is exactly this entry's label — the gap does not re-fire.
 * The honest role stays the fallback role after any answer, so without this the
 * draft could never compile. Membership over the answered LABEL SET only; the
 * answer VALUE is never read, never validated, never interpreted here.
 */
export function evaluateCompositionRoleGaps(
  composition: readonly unknown[],
  config: CompositionRoleGuidanceConfig,
  answeredLabels: ReadonlySet<string>,
): RoleGapClarification[] {
  const entries = composition.map(readEntry);
  const gaps: RoleGapClarification[] = [];
  entries.forEach((entry, index) => {
    if (!entry) return;
    if (entry.role !== config.gapRole) return;
    if (!firesOnSatisfied(entries.filter((e): e is { label: string; role: string } => e !== undefined), index, config)) return;
    if (answeredLabels.has(entry.label)) return;
    gaps.push({
      label: entry.label,
      reason: COMPOSITION_ROLE_GAP_REASON,
      message: interpolate(config.question, { component: entry.label }),
    });
  });
  return gaps;
}
