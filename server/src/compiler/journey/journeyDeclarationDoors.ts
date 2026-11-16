/**
 * journeyDeclarationDoors — the ONE reader that turns a DECLARED journey
 * document into the door list a clarification card renders.
 *
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey). Ruling
 * (.hermes/plans/decisions/NOUN-CREATION-JOURNEY-EXECUTION-l2-20261115.md):
 * "doors are declared journey data, never requirements-engine derivations",
 * and "No page or chat handler may invent completion policy."
 *
 * So this module carries NO door ids, NO surfaces and NO checkpoint name of
 * its own: every field below is read from
 * `config/journey/declarations/<file>.yaml` — the same document
 * `lintJourneyDocument` gates (server/src/compiler/journey/nounCreateJourney
 * .test.ts). Renaming an `alternative_id` in that document changes the card
 * with no TypeScript edit; the pin at
 * resolution/nounCreateClarificationDoors.test.ts measures exactly that.
 *
 * The declaration's own consistency rule: `steps[].human_task.controls` names
 * the doors and `alternatives.options[]` gives each one its summary, surface
 * and accept capability. A control with no alternative (or an alternative
 * with no control) is a malformed declaration — this reader REFUSES it
 * loudly rather than rendering a partial door list that silently disagrees
 * with the document in the store.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** One DECLARED door (an `alternatives.options[]` entry, checked against `human_task.controls`). */
export interface JourneyDeclarationDoor {
  /** The alternative's `alternative_id` — the door's identity on the wire. */
  id: string;
  /** The alternative's own summary sentence (server copy, rendered verbatim). */
  summary: string;
  /** The declared work surface the door navigates to (`ingestion`, `record-create`, ...). */
  surface: string;
  /** The declared capability the ACCEPT executes (`journey.material-create`). */
  capabilityRef: string;
}

/** The declared journey projection a clarification carries. */
export interface JourneyDeclarationRef {
  journeyId: string;
  revision: number;
  /** `return_contract.checkpoint_ref` — where the origin prompt resumes. */
  checkpointRef: string;
  /** `return_contract.permitted_result_types` — the ONLY results a completion may declare. */
  permittedResultTypes: string[];
  /** `return_contract.require_explicit_resume` — a person must confirm the return. */
  requireExplicitResume: boolean;
  doors: JourneyDeclarationDoor[];
}

/** The declarations directory, resolved from THIS module (the shipped data, never a guess).
 *
 * Under the server the module URL is a file: URL. Under the app's vitest SSR
 * runner the same module is imported through vite (an http/jsdom URL), so the
 * module-relative URL cannot be converted. There the directory is found by
 * walking up from the runner's cwd to `config/journey/declarations` (the
 * repo root — vitest runs from `app/`). The directory is DATA, not policy:
 * both resolutions land on the one shipped folder. */
export const JOURNEY_DECLARATIONS_DIR = resolveDeclarationsDir();

function resolveDeclarationsDir(): string {
  try {
    const fromModule = fileURLToPath(new URL('../../../../config/journey/declarations', import.meta.url));
    if (existsSync(fromModule)) return fromModule;
  } catch {
    // non-file module URL (vite/jsdom) — fall through to the cwd walk
  }
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'config', 'journey', 'declarations');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('journey declarations directory not found from module URL or cwd');
}

interface RawDoor {
  alternative_id?: unknown;
  summary?: unknown;
  surface?: unknown;
  capability_ref?: unknown;
}

interface RawJourneyDocument {
  journey_id?: unknown;
  revision?: unknown;
  steps?: unknown;
  alternatives?: unknown;
  return_contract?: unknown;
}

function controlsOf(doc: RawJourneyDocument): string[] {
  const steps = Array.isArray(doc.steps) ? doc.steps : [];
  const controls: string[] = [];
  for (const step of steps) {
    const humanTask = (step as { human_task?: { controls?: unknown } } | undefined)?.human_task;
    const declared = humanTask?.controls;
    if (!Array.isArray(declared)) continue;
    for (const control of declared) {
      if (typeof control === 'string' && control.length > 0) controls.push(control);
    }
  }
  return controls;
}

/**
 * Project a parsed journey document into its door list. PURE — the caller
 * supplies the document (a test mutates its own copy and measures the
 * emitted set change; the engine/lint paths pass the shipped parse).
 *
 * Throws when the document's alternatives disagree with the controls it
 * declares: one document, one door list, no partial render.
 */
export function doorsFromJourneyDocument(doc: unknown): JourneyDeclarationDoor[] {
  const journal = (doc ?? {}) as RawJourneyDocument;
  const options = Array.isArray((journal.alternatives as { options?: unknown } | undefined)?.options)
    ? ((journal.alternatives as { options: RawDoor[] }).options)
    : [];
  const controls = controlsOf(journal);
  const doors: JourneyDeclarationDoor[] = options.map((option) => ({
    id: typeof option.alternative_id === 'string' ? option.alternative_id : '',
    summary: typeof option.summary === 'string' ? option.summary : '',
    surface: typeof option.surface === 'string' ? option.surface : '',
    capabilityRef: typeof option.capability_ref === 'string' ? option.capability_ref : '',
  }));
  const doorIds = doors.map((door) => door.id);
  const missingDoor = controls.find((control) => !doorIds.includes(control));
  if (missingDoor !== undefined) {
    throw new Error(
      `journey declaration ${String(journal.journey_id)}: human_task.controls names "${missingDoor}" but alternatives.options[] declares no such alternative_id`,
    );
  }
  const strayDoor = doorIds.find((id) => controls.length > 0 && !controls.includes(id));
  if (strayDoor !== undefined) {
    throw new Error(
      `journey declaration ${String(journal.journey_id)}: alternative_id "${strayDoor}" is not named in steps[].human_task.controls`,
    );
  }
  return doors;
}

/** Project the whole declared journey a clarification needs (id, revision, checkpoint, doors). */
export function journeyRefFromDocument(doc: unknown): JourneyDeclarationRef {
  const journal = (doc ?? {}) as RawJourneyDocument;
  const returnContract = (journal.return_contract ?? {}) as {
    checkpoint_ref?: unknown;
    permitted_result_types?: unknown;
    require_explicit_resume?: unknown;
  };
  const checkpointRef = typeof returnContract.checkpoint_ref === 'string' ? returnContract.checkpoint_ref : '';
  if (!checkpointRef) {
    throw new Error(`journey declaration ${String(journal.journey_id)}: return_contract.checkpoint_ref is required`);
  }
  const permittedResultTypes = Array.isArray(returnContract.permitted_result_types)
    ? returnContract.permitted_result_types.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    journeyId: typeof journal.journey_id === 'string' ? journal.journey_id : '',
    revision: typeof journal.revision === 'number' ? journal.revision : 0,
    checkpointRef,
    permittedResultTypes,
    requireExplicitResume: returnContract.require_explicit_resume === true,
    doors: doorsFromJourneyDocument(journal),
  };
}

let declarationCache: { key: string; value: JourneyDeclarationRef } | undefined;

/**
 * Read the SHIPPED declaration whose `journey_id` is `journeyId`.
 *
 * Returns undefined when no declaration declares that id (a host that ships
 * no such journey offers no doors — never an invented default). Throws when
 * the document is present but malformed (see doorsFromJourneyDocument).
 */
export function loadJourneyDeclaration(journeyId: string): JourneyDeclarationRef | undefined {
  if (declarationCache?.key === journeyId) return declarationCache.value;
  const files = readdirSync(JOURNEY_DECLARATIONS_DIR).filter((name) => name.endsWith('.yaml')).sort();
  for (const file of files) {
    const doc = parse(readFileSync(join(JOURNEY_DECLARATIONS_DIR, file), 'utf8')) as RawJourneyDocument;
    if (doc?.journey_id !== journeyId) continue;
    const value = journeyRefFromDocument(doc);
    declarationCache = { key: journeyId, value };
    return value;
  }
  return undefined;
}

/** The SHIPPED parsed document whose `journey_id` is `journeyId` (undefined when none declares it). */
export function loadJourneyDocument(journeyId: string): unknown | undefined {
  const files = readdirSync(JOURNEY_DECLARATIONS_DIR).filter((name) => name.endsWith('.yaml')).sort();
  for (const file of files) {
    const doc = parse(readFileSync(join(JOURNEY_DECLARATIONS_DIR, file), 'utf8')) as RawJourneyDocument;
    if (doc?.journey_id !== journeyId) continue;
    return doc;
  }
  return undefined;
}

/** The declared doors of `journeyId` (thin read of `loadJourneyDeclaration`). */
export function loadJourneyDeclarationDoors(journeyId: string): JourneyDeclarationDoor[] {
  return loadJourneyDeclaration(journeyId)?.doors ?? [];
}

/** The journey an unresolvable MATERIAL noun is created through (declared in the shipped document). */
export const NOUN_CREATION_JOURNEY_ID = 'journey-noun-create';

/**
 * The scientist-intent VOCABULARY's declared domain tag for material nouns
 * (`schema/scientist-intent/scientist-intent-vocabulary.yaml`, an arg's
 * `domain:`). A tag read from the vocabulary's own data — NOT a door, a
 * surface or a route.
 */
export const MATERIAL_ARG_DOMAIN_TAG = 'material';

/** True when the declared argument contract names the vocabulary's material domain. */
export function isMaterialNounContract(declared: { domain?: string | readonly string[] }): boolean {
  const domain = declared.domain;
  if (domain === undefined) return false;
  const tags = typeof domain === 'string' ? [domain] : domain;
  return tags.some((tag) => tag.toLowerCase() === MATERIAL_ARG_DOMAIN_TAG);
}

/**
 * The one server-owned sentence naming an unbound material noun (the card
 * renders these words verbatim; the client never composes its own absence
 * sentence — the same rule the labware absence card follows).
 */
export function notALocalTermReason(label: string): string {
  return `${label} is not a local term in this lab.`;
}

/**
 * The clarification's journey projection for an unbound MATERIAL noun.
 *
 * `candidateLabel` is the person's own noun (identity form), never a resolved
 * record: the ruling keeps extracted values as CANDIDATES with a visible
 * source, and the door carries it so the landing surface can prefill it
 * without minting anything.
 */
export function nounCreateJourneyForCandidate(candidateLabel: string): (JourneyDeclarationRef & {
  candidateLabel: string;
  doors: Array<JourneyDeclarationDoor & { candidateLabel: string }>;
}) | undefined {
  const declared = loadJourneyDeclaration(NOUN_CREATION_JOURNEY_ID);
  if (!declared) return undefined;
  return {
    ...declared,
    candidateLabel,
    doors: declared.doors.map((door) => ({ ...door, candidateLabel })),
  };
}
