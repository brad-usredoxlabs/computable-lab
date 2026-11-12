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
/** Ajv errors are named one per line: file, JSON path, message. */
function describe(file: string, errors: readonly ErrorObject[]): string[] {
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
/** Read every *.yaml in dir and admit it. One unparseable file must not blank the catalogue. */
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
  const admitted = await admitCapabilityCatalogue(descriptors, knownHandlerIds);
  if (admitted.ok) {
    return diagnostics.length === 0 ? admitted : { ok: false, capabilities: admitted.capabilities, diagnostics };
  }
  return { ok: false, capabilities: admitted.capabilities, diagnostics: [...diagnostics, ...admitted.diagnostics] };
}
