/**
 * L2-CLARIFY-TARGET-1 (Change 1) — the ASSUMED-VALUE policy is DATA.
 *
 * The policy lives in the drafting-config home under an `assumedValues:`
 * section (the per-call `nounShape` discipline — loaded PER call, never
 * process-cached, so a data edit needs no stack restart). It declares, for a
 * (verb, argument) slot, the value the CARD offers as a VISIBLE assumption the
 * scientist approves or edits — the ONLY home for that number. Nothing is ever
 * staged on an assumption (the never-guess law): the slot starts UNANSWERED and
 * the scientist approves the declared number or types a different one.
 *
 * Two declared families:
 *   • `quantities:` — a `kind: quantity` arg (verb/argument/label/value/unit/
 *     source/question). `question` is the slot's wording, carrying the
 *     placeholders `{label}` `{value}` `{unit}` (wording is data too — the
 *     card renders the server's declared sentence, never invents copy).
 *   • `wells:` — a `kind: wells` arg (verb/argument/question).
 *
 * Loader contract (nounShape parity, server/src/compiler/resolution/nounShape
 * .ts:29 path idiom + :52-109 loader): a present-but-malformed entry THROWS
 * naming the path and the offending entry; an absent file or absent section
 * ⇒ the EMPTY policy (no assumption is offered anywhere — zero fallback, zero
 * synthesis of a number in TypeScript).
 *
 * The lookup is an EXACT (verb, argument) join — no fallback, no per-domain
 * default. The loader names NO argument, NO verb, NO value, NO unit: it reads
 * whatever the DATA declares. The data⇄vocabulary lint (a declaration must name
 * an `argContracts` entry of the declared kind) lives in the test, never here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const ASSUMED_VALUES_POLICY_PATH = new URL('../../../../config/drafting/shorthand-drafting.yaml', import.meta.url);

/** One declared quantity assumption (the chip's content, verbatim from DATA). */
export interface AssumedQuantityEntry {
  verb: string;
  argument: string;
  /** The slot's human label (rendered on the chip). */
  label: string;
  /** The declared assumed number (the ONLY home for it). */
  value: number;
  /** The declared unit (rendered on the chip; the fold's unit check). */
  unit: string;
  /** The provenance line shown in the chip's title/aria (never bare). */
  source: string;
  /** The slot's question wording; carries {label} {value} {unit} placeholders. */
  question: string;
}

/** One declared wells-slot question (the target-slot content). */
export interface AssumedWellsEntry {
  verb: string;
  argument: string;
  /** The slot's question wording (rendered verbatim — wording is data). */
  question: string;
}

export interface AssumedValuesPolicy {
  quantities: readonly AssumedQuantityEntry[];
  wells: readonly AssumedWellsEntry[];
}

function isNonEmptyString(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.trim().length > 0;
}

/** Load + validate the `assumedValues:` section PER call. Absent file or
 *  absent section ⇒ the EMPTY policy (no assumption offered anywhere). A
 *  present-but-malformed entry throws, naming the path and the entry. */
export function loadAssumedQuantities(path: URL | string = ASSUMED_VALUES_POLICY_PATH): AssumedValuesPolicy {
  const displayPath = String(path);
  if (!existsSync(path)) return { quantities: [], wells: [] };
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`assumed-values data unreadable: ${error instanceof Error ? error.message : String(error)} (${displayPath})`);
  }
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { quantities: [], wells: [] };
  const section = (raw as Record<string, unknown>).assumedValues;
  if (section === undefined || section === null) return { quantities: [], wells: [] };
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`assumed-values data (${displayPath}): \`assumedValues:\` must be an object`);
  }
  const sectionRecord = section as Record<string, unknown>;
  const quantitiesRaw = sectionRecord.quantities;
  const wellsRaw = sectionRecord.wells;

  const quantities: AssumedQuantityEntry[] = [];
  if (quantitiesRaw !== undefined) {
    if (!Array.isArray(quantitiesRaw)) {
      throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities\` must be a list`);
    }
    quantitiesRaw.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}]\` must be an object`);
      }
      const e = entry as Record<string, unknown>;
      if (!isNonEmptyString(e.verb) || !isNonEmptyString(e.argument)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}]\` needs a non-empty \`verb\` and \`argument\``);
      }
      if (!isNonEmptyString(e.label)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}]\` needs a non-empty \`label\``);
      }
      if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value <= 0) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}].value\` must be a finite number > 0`);
      }
      if (!isNonEmptyString(e.unit)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}].unit\` must be a non-empty string`);
      }
      if (!isNonEmptyString(e.source)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}].source\` must be a non-empty string`);
      }
      if (!isNonEmptyString(e.question) || !e.question.includes('{value}') || !e.question.includes('{unit}')) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.quantities[${index}].question\` must be a non-empty string containing \`{value}\` and \`{unit}\``);
      }
      quantities.push({ verb: e.verb, argument: e.argument, label: e.label, value: e.value, unit: e.unit, source: e.source, question: e.question });
    });
  }

  const wells: AssumedWellsEntry[] = [];
  if (wellsRaw !== undefined) {
    if (!Array.isArray(wellsRaw)) {
      throw new Error(`assumed-values data (${displayPath}): \`assumedValues.wells\` must be a list`);
    }
    wellsRaw.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.wells[${index}]\` must be an object`);
      }
      const e = entry as Record<string, unknown>;
      if (!isNonEmptyString(e.verb) || !isNonEmptyString(e.argument) || !isNonEmptyString(e.question)) {
        throw new Error(`assumed-values data (${displayPath}): \`assumedValues.wells[${index}]\` needs non-empty \`verb\`, \`argument\` and \`question\``);
      }
      wells.push({ verb: e.verb, argument: e.argument, question: e.question });
    });
  }

  return { quantities, wells };
}

/** Exact (verb, argument) join over the declared quantities. NO fallback —
 *  an absent declaration means NO assumption is offered for that slot. */
export function assumedQuantityFor(verb: string, argument: string, policy: AssumedValuesPolicy): AssumedQuantityEntry | null {
  return policy.quantities.find((entry) => entry.verb === verb && entry.argument === argument) ?? null;
}

/** Exact (verb, argument) join over the declared wells questions. */
export function assumedWellsFor(verb: string, argument: string, policy: AssumedValuesPolicy): AssumedWellsEntry | null {
  return policy.wells.find((entry) => entry.verb === verb && entry.argument === argument) ?? null;
}
