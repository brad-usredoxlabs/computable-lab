/**
 * chainArithmetic — MATRES-CHAIN §7.4 (OQ-2 ruling (b)): the declared-policy
 * loader + PURE compile-time evaluator for the execute-chain arithmetic ACs.
 *
 * The FULFIL fulfillment-compatibility precedent, mirrored: policy-as-YAML-data
 * (config/drafting/execute-chain-arithmetic.yaml), PER-CALL load (never
 * process-cached — a data edit needs no stack restart; a fixture-injected path
 * gets its own instance), malformed data THROWS naming the path, and the
 * ABSENT file is LOUD off: console.warn naming the path, evaluation returns
 * null — never silent (orch ruling verbatim).
 *
 * Zero policy in TypeScript: rule ids, collection/value/unit paths, the
 * comparison, and the unit scale table are read back out of the document.
 * Zero volume/unit/count literals here (bait 8): the evaluator implements the
 * generic operators (sumCompare, countEquals) over declared paths only. The
 * named missing lint predicate (aggregate sum/count compare) is a PROPOSED
 * FOLLOW-UP capability item (OQ-2 ruling) — NOT smuggled into lint-v1 here.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { resolvePath } from '../lint/PathResolver.js';

export const CHAIN_ARITHMETIC_DATA_FILE = 'config/drafting/execute-chain-arithmetic.yaml';

/** Production location (module-relative, the adapters.yaml precedent — the
 *  config/ dir lives at the repo root, two levels above server/src/chain). */
export function defaultChainArithmeticPath(): string {
  return fileURLToPath(new URL(`../../../${CHAIN_ARITHMETIC_DATA_FILE}`, import.meta.url));
}

export interface ArithmeticRule {
  id: string;
  title: string;
  operator: string;
  collectionPath: string;
  valuePath?: string;
  unitPath?: string;
  againstValuePath?: string;
  againstUnitPath?: string;
  comparison?: string;
  declaredCountPath?: string;
  message: string;
}

export interface ChainArithmeticPolicy {
  /** Unit name -> scale factor (the DATA table; a unit absent from it is a
   *  declared-fact gap the evaluator reports honestly, never guesses). */
  scales(): ReadonlyMap<string, number>;
  rules(): readonly ArithmeticRule[];
}

export interface ArithmeticViolation {
  ruleId: string;
  message: string;
}

function requireString(value: unknown, field: string, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Malformed chain arithmetic policy at ${path}: '${field}' must be a non-empty string`);
  }
  return value;
}

/** Load + structurally validate the arithmetic policy. ABSENT file = LOUD off
 *  (console.warn naming the path, returns null — the draft compiles without
 *  the arithmetic gate, disclosed, never silently). Malformed data THROWS
 *  naming the path. */
export function loadChainArithmeticPolicy(filePath = defaultChainArithmeticPath()): ChainArithmeticPolicy | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    console.warn(`chain arithmetic policy absent at ${filePath} — the execute-chain arithmetic gate is OFF for this compile (declared-data gap, never silent)`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Cannot parse chain arithmetic policy at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Malformed chain arithmetic policy at ${filePath}: expected a mapping`);
  }
  const doc = parsed as Record<string, unknown>;
  const scalesRaw = doc.scales;
  if (!scalesRaw || typeof scalesRaw !== 'object' || Array.isArray(scalesRaw)) {
    throw new Error(`Malformed chain arithmetic policy at ${filePath}: 'scales' must be a mapping of unit -> number`);
  }
  const scales = new Map<string, number>();
  for (const [unit, factor] of Object.entries(scalesRaw as Record<string, unknown>)) {
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) {
      throw new Error(`Malformed chain arithmetic policy at ${filePath}: scale '${unit}' must be a positive number`);
    }
    scales.set(unit, factor);
  }
  if (!Array.isArray(doc.rules) || doc.rules.length === 0) {
    throw new Error(`Malformed chain arithmetic policy at ${filePath}: 'rules' must be a non-empty array`);
  }
  const rules: ArithmeticRule[] = doc.rules.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Malformed chain arithmetic policy at ${filePath}: rules[${i}] must be a mapping`);
    }
    const r = entry as Record<string, unknown>;
    return {
      id: requireString(r.id, `rules[${i}].id`, filePath),
      title: requireString(r.title, `rules[${i}].title`, filePath),
      operator: requireString(r.operator, `rules[${i}].operator`, filePath),
      collectionPath: requireString(r.collectionPath, `rules[${i}].collectionPath`, filePath),
      ...(typeof r.valuePath === 'string' ? { valuePath: r.valuePath } : {}),
      ...(typeof r.unitPath === 'string' ? { unitPath: r.unitPath } : {}),
      ...(typeof r.againstValuePath === 'string' ? { againstValuePath: r.againstValuePath } : {}),
      ...(typeof r.againstUnitPath === 'string' ? { againstUnitPath: r.againstUnitPath } : {}),
      ...(typeof r.comparison === 'string' ? { comparison: r.comparison } : {}),
      ...(typeof r.declaredCountPath === 'string' ? { declaredCountPath: r.declaredCountPath } : {}),
      message: requireString(r.message, `rules[${i}].message`, filePath),
    };
  });
  return { scales: () => scales, rules: () => rules };
}

function select(data: unknown, path: string): { found: boolean; value: unknown } {
  const r = resolvePath(data as Record<string, unknown>, path);
  return { found: r.found, value: r.value };
}

/**
 * Evaluate the declared rules against the draft composite. Returns one
 * violation per failing rule, NAMING the rule id (the card shows which data
 * rule blocked the draft). Pure read: writes nothing, mutates nothing.
 */
export function evaluateChainArithmetic(policy: ChainArithmeticPolicy, draft: Record<string, unknown>): ArithmeticViolation[] {
  const violations: ArithmeticViolation[] = [];
  const scales = policy.scales();

  for (const rule of policy.rules()) {
    const collection = select(draft, rule.collectionPath);
    if (!collection.found || !Array.isArray(collection.value)) {
      violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} — collection '${rule.collectionPath}' is not an array in the draft` });
      continue;
    }

    if (rule.operator === 'sumCompare') {
      if (rule.valuePath === undefined || rule.againstValuePath === undefined) {
        throw new Error(`Chain arithmetic rule '${rule.id}' declares operator sumCompare without valuePath/againstValuePath`);
      }
      let sum = 0;
      let unitGap: string | null = null;
      for (const item of collection.value) {
        const v = select(item, rule.valuePath);
        if (!v.found || typeof v.value !== 'number') continue;
        let factor = 1;
        if (rule.unitPath !== undefined) {
          const u = select(item, rule.unitPath);
          const unit = typeof u.value === 'string' ? u.value : '';
          const declared = scales.get(unit);
          if (declared === undefined) { unitGap = unit; break; }
          factor = declared;
        }
        sum += v.value * factor;
      }
      if (unitGap !== null) {
        violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} — unit '${unitGap}' is not in the declared scale table (execute-chain-arithmetic.yaml); the evaluator never guesses a conversion` });
        continue;
      }
      const against = select(draft, rule.againstValuePath);
      if (!against.found || typeof against.value !== 'number') {
        violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} — the compared value at '${rule.againstValuePath}' is missing from the draft` });
        continue;
      }
      let againstFactor = 1;
      if (rule.againstUnitPath !== undefined) {
        const u = select(draft, rule.againstUnitPath);
        const unit = typeof u.value === 'string' ? u.value : '';
        const declared = scales.get(unit);
        if (declared === undefined) {
          violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} — unit '${unit}' is not in the declared scale table (execute-chain-arithmetic.yaml)` });
          continue;
        }
        againstFactor = declared;
      }
      const againstScaled = against.value * againstFactor;
      const failed = rule.comparison === 'lte'
        ? sum > againstScaled
        : (() => { throw new Error(`Chain arithmetic rule '${rule.id}' declares unsupported comparison '${rule.comparison ?? ''}'`); })();
      if (failed) {
        violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} (sum ${sum} > ${againstScaled} on the declared unit scale)` });
      }
      continue;
    }

    if (rule.operator === 'countEquals') {
      if (rule.declaredCountPath === undefined) {
        throw new Error(`Chain arithmetic rule '${rule.id}' declares operator countEquals without declaredCountPath`);
      }
      const declared = select(draft, rule.declaredCountPath);
      if (!declared.found || typeof declared.value !== 'number') {
        violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} — the declared count at '${rule.declaredCountPath}' is missing from the draft` });
        continue;
      }
      if (collection.value.length !== declared.value) {
        violations.push({ ruleId: rule.id, message: `${rule.id}: ${rule.message} (composite carries ${collection.value.length}, declared ${declared.value})` });
      }
      continue;
    }

    throw new Error(`Chain arithmetic rule '${rule.id}' declares unsupported operator '${rule.operator}'`);
  }
  return violations;
}
