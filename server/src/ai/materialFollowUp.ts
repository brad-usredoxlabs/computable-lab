/**
 * What a material pick still owes — asked from the registry's table, not from a
 * hardcoded branch.
 *
 * Why: the layer the biologist picked decides what is left. A formulation fixes
 * its own concentration, so only a VOLUME is still owed; a bare concept owes both
 * a concentration and a volume; an aliquot owes nothing (it is already a measured
 * thing). Those rules are declared in `schema/lab/material-profile.registry.yaml`
 * under `clarification.layers.<layer>.requires`, because they are the material
 * hierarchy's own arithmetic — not the AI layer's opinion.
 *
 * The old behaviour asked for "a volume and a concentration" about a material
 * whose NAME was a concentration ("1 mM Clofibrate in DMSO"), which no answer
 * could satisfy. Deriving the question from the chosen layer is what makes it
 * answerable.
 */
import type { AgentClarificationRequest } from './types.js';
import type { MaterialLayer } from './materialRefFields.js';

/** The slice of the registry's policy this module needs (kept structural). */
export interface LayerPolicyEntry {
  label: string;
  field: string;
  question: string;
  requires: string[];
}

export interface LayerPolicy {
  layers: Partial<Record<MaterialLayer, LayerPolicyEntry>>;
}

/** Render a registry question template. `{label}` → the material's name. */
export function renderLayerQuestion(template: string, label: string): string {
  return template.replace(/\{label\}/g, label).replace(/\s+/g, ' ').trim();
}

/**
 * The details keys a pick at `layer` still owes. `[]` means the add is
 * well-formed as it stands. Returns null when the registry declares nothing for
 * the layer (the caller falls back rather than inventing a requirement).
 */
export function outstandingRequirements(
  policy: LayerPolicy | undefined,
  layer: MaterialLayer,
  details: Record<string, unknown>,
  /**
   * The TYPE's own requirement list (a cell line owes a count, never a volume).
   * Takes priority over the global default table — reading the default here is
   * what made the follow-up demand a volume from a cell line (2026-09-20).
   */
  requirements?: readonly string[] | null,
): string[] | null {
  const required = requirements != null ? [...requirements] : policy?.layers?.[layer]?.requires;
  if (!required) return null;
  return required.filter((key) => {
    const value = details[key];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (typeof value === 'number') return !Number.isFinite(value);
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
  });
}

export function followUpForLayer(options: {
  policy: LayerPolicy | undefined;
  layer: MaterialLayer;
  label: string;
  well?: string;
  /** Every well the answer covers (a range is one act). */
  wells?: readonly string[];
  details: Record<string, unknown>;
  /** The TYPE's requirement list — see outstandingRequirements. */
  requirements?: readonly string[] | null;
  /** Stable id for the request; the binding join key. */
  requestId: string;
}): AgentClarificationRequest | null {
  const missing = outstandingRequirements(options.policy, options.layer, options.details, options.requirements);
  if (!missing || missing.length === 0) return null;
  const entry = options.policy?.layers?.[options.layer];
  const wells = options.wells && options.wells.length > 1
    ? [`${options.wells[0]}–${options.wells[options.wells.length - 1]} (${options.wells.length} wells)`]
    : options.well
      ? [options.well]
      : [];
  const where = wells.length > 0 ? ` (${wells[0]})` : '';
  // The layer's own question names the thing; the missing keys say what is owed.
  const question = entry
    ? renderLayerQuestion(entry.question, options.label)
    : `Which ${options.layer} is "${options.label}"?`;
  const owed = `I still need ${missing.join(' and ')} for ${options.label}${where}.`;
  return {
    id: options.requestId,
    kind: 'parameter',
    prompt: `${question} ${owed}`.trim(),
    entityType: 'parameter',
    menuProvider: 'choice',
    origin: 'harness' as const,
    options: [],
    materialLayer: options.layer,
  };
}
