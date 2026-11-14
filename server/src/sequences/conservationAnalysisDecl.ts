/**
 * Validating reader for the conservation-analysis DECLARATION
 * (schema/sequence-analysis/conservation-analysis.schema.yaml) — the DATA
 * half of L2-JOURNEY-CONSERVATION-1.
 *
 * A declaration is the contract a later computation must be read against:
 * the objective as a recorded HUMAN decision, the metric denominator, the
 * gap/ambiguity policies, the coverage threshold and the coordinate
 * convention. It is NOT the computation — no engine entry, no interval
 * records, no tracks (those are later units) — and it commits nothing.
 *
 * The per-sequence alignment→source mapping is the shipped alignment
 * artifact's own field (coordinateMap, produced by
 * server/src/sequences/sequenceRuntime.ts); the declaration references it
 * by name (source: alignment.coordinateMap) and this reader never
 * re-derives or recomputes coordinates.
 *
 * The schema compiles ONCE at module load from the repo path (the
 * oligoOrderAiRead.ts idiom — readFileSync against import.meta.url, so
 * worktrees with a server/schema symlink need no cwd assumption). Refusals
 * are NAMED and derived entirely from validate.errors — there is no second
 * copy of the field list in TypeScript:
 *   - conservation_declaration_invalid: any missing or ill-typed required
 *     field, carrying the instancePath of the offending property.
 *   - conservation_declaration_claims_primer_suitability: the
 *     primer_suitability.claimed const failure — a declared column set is
 *     never a primer recommendation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';

export type ConservationDeclarationVerdict = { ok: true } | { ok: false; diagnostics: string[] };

const SCHEMA_URL = new URL('../../../schema/sequence-analysis/conservation-analysis.schema.yaml', import.meta.url);
const schema = parseYaml(readFileSync(fileURLToPath(SCHEMA_URL), 'utf8')) as Record<string, any>;

// Compiled ONCE at module load; Ajv is the sole authority (house harness:
// strict + allErrors, as in capabilityDescriptor.test.ts).
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validate = ajv.compile(schema);

/** instancePath of the offending property: a `required` failure names the
 *  missing property in params, not in the parent's instancePath. */
function errorPath(error: ErrorObject): string {
  const missing = (error.params as { missingProperty?: string }).missingProperty;
  return missing !== undefined ? `${error.instancePath}/${missing}` : (error.instancePath || '/');
}

/** Map Ajv errors to the two named rules. The primer rule is identified by
 *  the location of its const (primer_suitability.claimed) — a path in the
 *  declaration, not a copy of the schema's field list. */
function toDiagnostics(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((error) => {
    const path = errorPath(error);
    const detail = error.message ?? error.keyword;
    if (path === '/primer_suitability/claimed') {
      return `conservation_declaration_claims_primer_suitability: ${path} — ${detail}`;
    }
    return `conservation_declaration_invalid: ${path} — ${detail}`;
  });
}

/** Validate a conservation-analysis declaration. Never throws on
 *  document shape: an invalid declaration is a NAMED refusal with the
 *  offending paths, not a bare boolean. */
export function validateConservationAnalysisDeclaration(doc: unknown): ConservationDeclarationVerdict {
  void validate(doc);
  const diagnostics = toDiagnostics(validate.errors);
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true };
}
