import type { Derivation } from './derivations/types.js';
import { slugify } from '../compiler/material/MaterialCompiler.js';

export interface SemanticInputDecl {
  name: string;
  derivedFrom: { input: string; fn: string };
  required: boolean;
}

export interface VerbDefinitionLite {
  canonical: string;
  semanticInputs?: SemanticInputDecl[];
}

export interface BuildSemanticKeyArgs {
  verb: VerbDefinitionLite;
  resolvedInputs: Record<string, unknown>;
  phaseId: string;
  ordinal: number;
  derivations: Record<string, Derivation>;
}

export interface SemanticKeyResult {
  semanticKey: string;
  semanticKeyComponents: {
    verb: string;
    identity: Record<string, string | string[]>;
    phaseId: string;
    ordinal: number;
  };
}

export type BuildResult =
  | { ok: true; result: SemanticKeyResult }
  | { ok: false; reason: string };

export function buildSemanticKey(args: BuildSemanticKeyArgs): BuildResult {
  const identity: Record<string, string | string[]> = {};
  const declarations = args.verb.semanticInputs ?? [];

  for (const decl of declarations) {
    const inputValue = args.resolvedInputs[decl.derivedFrom.input];
    if (inputValue === undefined) {
      if (decl.required) {
        return { ok: false, reason: `required input '${decl.name}' missing` };
      }
      continue;
    }
    const fn = args.derivations[decl.derivedFrom.fn];
    if (!fn) {
      return { ok: false, reason: `unknown derivation '${decl.derivedFrom.fn}'` };
    }
    const result = fn(inputValue);
    if (!result.ok) {
      if (decl.required) {
        return { ok: false, reason: `required derivation for '${decl.name}' failed: ${result.reason}` };
      }
      continue;
    }
    identity[decl.name] = result.value;
  }

  const identityParts: string[] = [];
  for (const decl of declarations) {
    const v = identity[decl.name];
    if (v === undefined) continue;
    identityParts.push(Array.isArray(v) ? v.join('+') : v);
  }

  const rawSlug = [
    args.verb.canonical,
    ...identityParts,
    args.phaseId,
    String(args.ordinal),
  ].join('-');
  const semanticKey = 'EVT-' + slugify(rawSlug);

  return {
    ok: true,
    result: {
      semanticKey,
      semanticKeyComponents: {
        verb: args.verb.canonical,
        identity,
        phaseId: args.phaseId,
        ordinal: args.ordinal,
      },
    },
  };
}
