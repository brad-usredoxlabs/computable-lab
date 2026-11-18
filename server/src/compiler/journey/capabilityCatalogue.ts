/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (u2loader): admits a descriptor only when Ajv
 * validates the shape and implementation.handler_ref is in the caller's known set.
 * No throw, no normalisation, no handler-id literals; unit 3's route calls this.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');

/** The admitted slice callers may rely on; every other field is the schema's business. */
export interface CapabilityDescriptor {
  capability_id: string;
  implementation: { handler_kind: string; handler_ref: string };
  [field: string]: unknown;
}
export type CapabilityCatalogueResult =
  | { ok: true; capabilities: CapabilityDescriptor[] }
  | { ok: false; capabilities: CapabilityDescriptor[]; diagnostics: string[] };

/** Compile once per admission call: both schemas in one Ajv, so relative $refs resolve. */
async function compileDescriptorSchema() {
  const load = async (name: string) => parse(await readFile(join(SCHEMA_DIR, name), 'utf8'));
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(await load('journey-port.schema.yaml'));
  return ajv.compile(await load('capability-descriptor.schema.yaml'));
}

/** JSON path of a violation; root-level property keywords are named, never left as ''. */
function pathOf(error: ErrorObject): string {
  if (error.instancePath !== '') return error.instancePath;
  const params = error.params as Record<string, unknown>;
  const named = params.unevaluatedProperty ?? params.additionalProperty ?? params.missingProperty;
  return typeof named === 'string' ? `/${named}` : '/';
}
/** Ajv errors are named one per line: file, JSON path, message. The
 * journey-hiding rule closes with `then: false`, so its failure lands as a
 * root-level `false schema` error (plus the companion `if` error, which is
 * the same finding and not a second one); that failure is mapped here to its
 * named diagnostic. The rule's effect set lives in the descriptor schema's
 * allOf — only the diagnostic string lives in TS. */
const JOURNEY_HIDING = '/effects: journey_capability_hides_journey: a capability may declare at most one mutating effect; a second step belongs in the journey, not inside this capability';
function describe(file: string, errors: readonly ErrorObject[]): string[] {
  if (errors.some((error) => error.keyword === 'false schema')) {
    return [`${file}: ${JOURNEY_HIDING}`];
  }
  return errors.map((error) => `${file}: ${pathOf(error)}: ${error.message ?? error.keyword}`);
}
export async function admitCapabilityCatalogue(
  descriptors: ReadonlyArray<{ file: string; doc: unknown }>,
  knownHandlerIds: ReadonlySet<string>,
): Promise<CapabilityCatalogueResult> {
  const validate = await compileDescriptorSchema();
  const capabilities: CapabilityDescriptor[] = [];
  const diagnostics: string[] = [];
  for (const { file, doc } of descriptors) {
    if (!validate(doc)) {
      diagnostics.push(...describe(file, validate.errors ?? []));
      continue;
    }
    // Shape is proven; only now may the handler reference be read.
    const descriptor = doc as CapabilityDescriptor;
    const handlerRef = descriptor.implementation.handler_ref;
    if (!knownHandlerIds.has(handlerRef)) {
      diagnostics.push(`${file}: /implementation/handler_ref: unknown handler id '${handlerRef}'`);
      continue;
    }
    capabilities.push(descriptor);
  }
  // Sorted by capability id: directory listing order can never move the result.
  capabilities.sort((a, b) => (a.capability_id < b.capability_id ? -1 : a.capability_id > b.capability_id ? 1 : 0));
  return diagnostics.length === 0 ? { ok: true, capabilities } : { ok: false, capabilities, diagnostics };
}
/** Read every *.yaml in dir and admit it. One unparseable file must not blank the catalogue.
 *
 * The sibling registry at join(dir, '..', 'governed-writes.yaml') is the ONLY
 * declared source of a governed_write handler_ref. Its writes[].id values are
 * unioned into the known set; an ABSENT registry changes nothing (read-only
 * capabilities keep admitting exactly as before), while an unparseable
 * registry — or an entry lacking an id — is named and contributes nothing.
 * The three routes.ts call sites stay two-argument: the registry resolves
 * from dir, never from a new parameter. */
export async function loadCapabilityCatalogueDir(
  dir: string,
  knownHandlerIds: ReadonlySet<string>,
): Promise<CapabilityCatalogueResult> {
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => entry.name)
    .sort();
  const descriptors: Array<{ file: string; doc: unknown }> = [];
  const diagnostics: string[] = [];
  for (const file of names) {
    try {
      descriptors.push({ file, doc: parse(await readFile(join(dir, file), 'utf8')) });
    } catch (error) {
      diagnostics.push(`${file}: could not parse YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const registry = await readGovernedWriteRegistry(join(dir, '..', 'governed-writes.yaml'));
  if (registry.diagnostics.length > 0) diagnostics.push(...registry.diagnostics);
  const admitted = await admitCapabilityCatalogue(descriptors, registry.knownHandlerIds(knownHandlerIds));
  if (admitted.ok) {
    return diagnostics.length === 0 ? admitted : { ok: false, capabilities: admitted.capabilities, diagnostics };
  }
  return { ok: false, capabilities: admitted.capabilities, diagnostics: [...diagnostics, ...admitted.diagnostics] };
}
/** Parse the governed-write registry; absent file contributes nothing. */
async function readGovernedWriteRegistry(
  registryPath: string,
): Promise<{ diagnostics: string[]; knownHandlerIds: (base: ReadonlySet<string>) => ReadonlySet<string> }> {
  let parsed: unknown;
  try {
    parsed = parse(await readFile(registryPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { diagnostics: [], knownHandlerIds: (base) => base };
    }
    return {
      diagnostics: [`governed-writes.yaml: ${registryPath}: could not parse YAML: ${error instanceof Error ? error.message : String(error)}`],
      knownHandlerIds: (base) => base,
    };
  }
  const writes = Array.isArray((parsed as { writes?: unknown } | null)?.writes)
    ? ((parsed as { writes: unknown[] }).writes)
    : [];
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  writes.forEach((entry, index) => {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || id === '') {
      diagnostics.push(`governed-writes.yaml: ${registryPath}: writes[${index}]/id: missing or non-string id`);
      return;
    }
    ids.add(id);
  });
  return {
    diagnostics,
    knownHandlerIds: (base) => new Set([...base, ...ids]),
  };
}
