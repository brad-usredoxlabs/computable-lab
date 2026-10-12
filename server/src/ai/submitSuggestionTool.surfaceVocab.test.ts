/**
 * PB-CH-4b — the forced tool's SURFACE VOCABULARY is data, not a hardcoded
 * near-truth.
 *
 * Gate run-5 evidence: the model guessed `surface: "protocol"` three times
 * because the two surface descriptions named an example pair instead of the
 * registered ids. The compiler's UNSUPPORTED_SURFACE rejection was CORRECT
 * (workstateCompile.ts — the single membership authority, untouched here);
 * the model's menu was blind.
 *
 * Contract under test (spec §Design, exact):
 *  (a) no registry -> the builder returns AGENT_INTENT_TOOL_DEF BY REFERENCE
 *      (byte-identical fallback; every existing pin keeps passing);
 *  (b) a registry -> the two surface descriptions name the joined ids and drop
 *      the static examples, and NOTHING ELSE in the def changes (deep-diff);
 *  (c) an empty id list behaves as (a);
 *  (d) the static const is never mutated in place (the clone rule).
 *
 * No enum, no validation, no policy branch: the ids ARRIVE as data (repo rule
 * #1) and the compiler stays the only membership check (repo rule #3).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  AGENT_INTENT_TOOL_NAME,
  buildAgentIntentToolDef,
} from './submitSuggestionTool.js';
import type { ToolDefinition } from './types.js';

type Params = {
  required?: string[];
  properties: Record<string, {
    type?: string;
    enum?: string[];
    properties?: Record<string, {
      type?: string;
      enum?: string[];
      description?: string;
      items?: { properties?: Record<string, { description?: string }> };
    }>;
  }>;
};

const paramsOf = (def: ToolDefinition) => def.function.parameters as Params;

/** The two surface description slots on the static def. */
const staticSurfaceDesc = (def: ToolDefinition) => {
  const p = paramsOf(def);
  return {
    actionSurface: p.properties.action?.properties?.surface?.description ?? null,
    tabSurface: p.properties.workstate?.properties?.tabs?.items?.properties?.surface?.description ?? null,
  };
};

/** Pristine snapshot of the static const, taken at import time. */
const STATIC_SNAPSHOT = JSON.stringify(AGENT_INTENT_TOOL_DEF);

describe('buildAgentIntentToolDef — surface vocabulary is injected data (PB-CH-4b)', () => {
  it('(a) no registry: returns AGENT_INTENT_TOOL_DEF BY REFERENCE (byte-identical fallback)', () => {
    const def = buildAgentIntentToolDef();
    expect(def).toBe(AGENT_INTENT_TOOL_DEF);
    expect(JSON.stringify(def)).toBe(STATIC_SNAPSHOT);
  });

  it('(c) empty id list behaves exactly as (a)', () => {
    const def = buildAgentIntentToolDef([]);
    expect(def).toBe(AGENT_INTENT_TOOL_DEF);
  });

  it('(b) registry ids land in BOTH surface descriptions and the static examples are gone', () => {
    const def = buildAgentIntentToolDef(['alpha', 'beta']);
    expect(def).not.toBe(AGENT_INTENT_TOOL_DEF);

    const { actionSurface, tabSurface } = staticSurfaceDesc(def);
    expect(actionSurface).toBe(
      'open-surface: a registered surface id — registered ids: alpha, beta. Nothing else is valid.',
    );
    expect(tabSurface).toBe(
      'A registered surface id — registered ids: alpha, beta. Nothing else is valid.',
    );

    // The blind-menu examples must not survive anywhere in the two fields.
    for (const description of [actionSurface, tabSurface]) {
      expect(description).toContain('alpha, beta');
      expect(description).not.toContain('run-design');
      expect(description).not.toContain('"analysis"');
      expect(description).not.toContain('protocol');
    }
  });

  it('(b2) deep-diff: with the two descriptions swapped back, the built def EQUALS the static def', () => {
    const def = buildAgentIntentToolDef(['alpha', 'beta', 'run-execute']);
    const reconciled = structuredClone(def);
    const rp = paramsOf(reconciled);
    const staticDesc = staticSurfaceDesc(AGENT_INTENT_TOOL_DEF);
    (rp.properties.action?.properties?.surface as { description: string }).description = staticDesc.actionSurface ?? '';
    (rp.properties.workstate?.properties?.tabs?.items?.properties?.surface as { description: string }).description = staticDesc.tabSurface ?? '';
    // Everything else — name, top description, intent enum, required, every other
    // field description — is byte-identical to the static def.
    expect(JSON.stringify(reconciled)).toBe(STATIC_SNAPSHOT);
  });

  it('(b3) no enum is added to either surface field (the compiler owns membership)', () => {
    const def = buildAgentIntentToolDef(['alpha', 'beta']);
    const p = paramsOf(def);
    expect(p.properties.action?.properties?.surface?.enum).toBeUndefined();
    expect(p.properties.workstate?.properties?.tabs?.items?.properties?.surface?.enum).toBeUndefined();
    // The intent menu itself is untouched.
    expect(p.required).toEqual(['intent']);
    expect(p.properties.intent?.enum).toEqual(
      (paramsOf(AGENT_INTENT_TOOL_DEF).properties.intent?.enum ?? []).slice(),
    );
    expect(def.function.name).toBe(AGENT_INTENT_TOOL_NAME);
  });

  it('(d) the static const is NEVER mutated in place (clone rule)', () => {
    buildAgentIntentToolDef(['alpha', 'beta']);
    buildAgentIntentToolDef(['gamma']);
    expect(JSON.stringify(AGENT_INTENT_TOOL_DEF)).toBe(STATIC_SNAPSHOT);
    expect(staticSurfaceDesc(AGENT_INTENT_TOOL_DEF)).toEqual({
      actionSurface: 'open-surface: a registered surface id (e.g. "analysis", "run-design").',
      tabSurface: 'A registered surface id (e.g. "run-design", "analysis").',
    });
  });

  it('(b4) a single id renders without a separator artifact', () => {
    const def = buildAgentIntentToolDef(['analysis']);
    expect(staticSurfaceDesc(def).tabSurface).toBe(
      'A registered surface id — registered ids: analysis. Nothing else is valid.',
    );
  });
});
