/**
 * L2-JOURNEY-DOC-1 (unit u2lint): the journey-document lint pass — the semantic
 * closure a JSON schema cannot express (capability existence + step-to-step port
 * chaining). Rule order is deliberate and fixed: (i) SCHEMA GATE FIRST — one Ajv
 * addSchemas journey-port.schema.yaml before journey-document.schema.yaml so the
 * relative port $refs resolve (the capabilityCatalogue.ts idiom); on rejection,
 * return its errors and STOP — never run the semantic rules on an unshaped
 * document. (ii) CAPABILITY MEMBERSHIP — every steps[].capability_ref must be in
 * the admitted catalogue's capability_id set (built once, exact strings, no case
 * folding); the schema pins the PATTERN only, so this is the membership rule.
 * (iii) PORT CHAINING — the document's declared order is the binding order: index
 * i pairs with index i, within consecutive steps only; no other step is searched.
 * The consumer requirement is { port_type } plus provenance_layer only when the
 * input port declares it (MaterialReference is the sole port that does);
 * labware_reference is left absent so the shipped "undefined means definition"
 * default applies. validatePortBinding owns every port rule; this module only
 * builds the requirement, calls it, and relays diagnostic.code and
 * diagnostic.message VERBATIM. A missing producer at an index the consumer needs
 * is journey_port_missing_producer.
 *
 * A step port is a CLOSED vocabulary shape (journey-port.schema.yaml) with no
 * port_type of its own; its type is the $def it validates against, decided by the
 * same one Ajv — no second mapping table. RULE_* are the only new constants.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import { validatePortBinding } from './ports.js';
import type { MaterialProvenanceLayer, PortReference, PortRequirement, PortType } from './ports.js';

export const RULE_SCHEMA = 'journey_document_schema';
export const RULE_CAPABILITY_NOT_IN_CATALOGUE = 'journey_capability_not_in_catalogue';
export const RULE_PORT_MISSING_PRODUCER = 'journey_port_missing_producer';
export interface JourneyDocumentLintDiagnostic {
  rule: string;
  message: string;
  step_id?: string;
  next_step_id?: string;
  index?: number;
}
export interface JourneyDocumentLintResult { ok: boolean; diagnostics: JourneyDocumentLintDiagnostic[] }
/** What the schema gate proves before any semantic rule reads a shaped field. */
interface ShapedStep {
  id: string; capability_ref: string;
  input_ports: Array<Record<string, unknown>>; output_ports: Array<Record<string, unknown>>;
}
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');
/** One Ajv for the whole pass: the port vocabulary is added first, so both the
 * document's relative port $refs and the per-$def validators resolve to it. */
let compiled: { validate: ValidateFunction; portDefs: Record<string, ValidateFunction> } | undefined;
function getCompiled() {
  if (compiled !== undefined) return compiled;
  const load = (name: string) => parse(readFileSync(join(SCHEMA_DIR, name), 'utf8'));
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const portSchema = load('journey-port.schema.yaml') as { $defs: Record<string, unknown> };
  ajv.addSchema(portSchema);
  const validate = ajv.compile(load('journey-document.schema.yaml'));
  const portDefs: Record<string, ValidateFunction> = {};
  for (const [name, def] of Object.entries(portSchema.$defs)) portDefs[name] = ajv.compile(def as object);
  return (compiled = { validate, portDefs });
}
/** The single vocabulary $def a gated port validates as; a document port matches
 * exactly one (PortBinding oneOf), so anything else is unreachable. */
function portTypeOf(port: Record<string, unknown>, defs: Record<string, ValidateFunction>): PortType {
  const matches = Object.keys(defs).filter((name) => defs[name]?.(port) === true);
  if (matches.length !== 1) throw new Error(`internal invariant: port matched ${matches.length} vocabulary $defs (expected 1)`);
  return matches[0] as PortType;
}
/** Ajv errors are named one per line: JSON path, message. */
function schemaDiagnostics(errors: readonly ErrorObject[]): JourneyDocumentLintDiagnostic[] {
  return errors.map((e) => ({ rule: RULE_SCHEMA, message: `${e.instancePath || '/'}: ${e.message ?? e.keyword}` }));
}
export function lintJourneyDocument(document: unknown, catalogue: CapabilityDescriptor[]): JourneyDocumentLintResult {
  const { validate, portDefs } = getCompiled();
  if (!validate(document)) return { ok: false, diagnostics: schemaDiagnostics(validate.errors ?? []) };
  // The gate proved the shape; the semantic rules read only shaped fields.
  const steps = (document as { steps: ShapedStep[] }).steps;
  const diagnostics: JourneyDocumentLintDiagnostic[] = [];
  const admitted = new Set(catalogue.map((d) => d.capability_id));
  for (const step of steps) {
    if (!admitted.has(step.capability_ref)) {
      diagnostics.push({
        rule: RULE_CAPABILITY_NOT_IN_CATALOGUE,
        message: `step ${step.id} references capability_ref '${step.capability_ref}', which is not in the admitted capability catalogue`,
        step_id: step.id,
      });
    }
  }
  for (let n = 0; n + 1 < steps.length; n++) {
    const producerStep = steps[n]!;
    const consumerStep = steps[n + 1]!;
    const producerPorts = producerStep.output_ports;
    const consumerPorts = consumerStep.input_ports;
    for (let i = 0; i < Math.max(producerPorts.length, consumerPorts.length); i++) {
      const producerPort = producerPorts[i];
      const consumerPort = consumerPorts[i];
      if (consumerPort === undefined) continue; // no input declared here: nothing to bind
      if (producerPort === undefined) {
        diagnostics.push({
          rule: RULE_PORT_MISSING_PRODUCER,
          message: `step ${consumerStep.id} input port at index ${i} needs a producer, but step ${producerStep.id} declares no output port at index ${i}`,
          step_id: producerStep.id, next_step_id: consumerStep.id, index: i,
        });
        continue;
      }
      const requirement: PortRequirement = { port_type: portTypeOf(consumerPort, portDefs) };
      if (consumerPort.provenance_layer !== undefined) requirement.provenance_layer = consumerPort.provenance_layer as MaterialProvenanceLayer;
      // The $def check proved every field; name the type and hand the exact port to the binding rule.
      const producer = { ...producerPort, port_type: portTypeOf(producerPort, portDefs) } as PortReference;
      const binding = validatePortBinding(producer, requirement);
      if (!binding.ok) diagnostics.push({
        rule: binding.diagnostic.code, message: binding.diagnostic.message,
        step_id: producerStep.id, next_step_id: consumerStep.id, index: i,
      });
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}
