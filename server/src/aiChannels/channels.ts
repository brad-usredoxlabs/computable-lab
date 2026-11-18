/**
 * AI-deliverable channels — declarative registry loader
 * (L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1 u1declare).
 *
 * Every channel a draft turn can deliver is DECLARED in
 * schema/registry/ai-deliverable-channels/ai-deliverable-channels.yaml, never
 * hardcoded (repo rule #1). Decision AI-DELIVERABLE-CHANNELS-ARE-DATA: each
 * channel has exactly one treatment from {card, mount, navigate, wall,
 * answer} — NO "ignore" state; a channel the surface cannot present is
 * declared `wall` (a NAMED failure, never silence). This module only loads +
 * validates the declaration (Ajv is the single authority, repo rule #3) and
 * exposes `assertChannelTreated`, the named-failure primitive u2/u3 call.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';

export type AiDeliverableChannelTreatment = 'card' | 'mount' | 'navigate' | 'wall' | 'answer';

export interface AiDeliverableChannel {
  id: string;
  meaning: string;
  treatment: AiDeliverableChannelTreatment;
}

const REL = 'registry/ai-deliverable-channels';

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function reqStr(obj: Record<string, unknown>, key: string, context: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return v.trim();
}

/**
 * Ajv validate against the sibling schema (repo rule #3). Duplicate ids are
 * reported first so the most actionable error wins. No channel-id allow-list
 * lives in TypeScript.
 */
function assertValidRegistry(schemaDir: string, doc: unknown): void {
  const channels = (doc as { channels?: Array<{ id?: unknown }> }).channels ?? [];
  const seen = new Set<unknown>();
  for (const c of channels) {
    if (seen.has(c.id)) {
      throw new Error(`ai-deliverable-channels registry invalid: duplicate channel id "${String(c.id)}"`);
    }
    seen.add(c.id);
  }
  const schema = parse(readFileSync(resolve(schemaDir, REL, 'ai-deliverable-channels.schema.yaml'), 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  if (!ajv.validate(schema, doc)) {
    throw new Error(`ai-deliverable-channels registry invalid: ${ajv.errorsText()}`);
  }
}

function normalizeChannel(raw: unknown, index: number): AiDeliverableChannel {
  const obj = asObject(raw, `channels[${index}]`);
  return {
    id: reqStr(obj, 'id', `channels[${index}]`),
    meaning: reqStr(obj, 'meaning', `channels[${index}]`),
    treatment: reqStr(obj, 'treatment', `channels[${index}]`) as AiDeliverableChannelTreatment,
  };
}

/**
 * Load + validate the registry from `schemaDir`. Throws (naming the offending
 * channel where recoverable) if the declaration is invalid against its schema.
 */
export function loadAiDeliverableChannels(schemaDir: string): { channels: AiDeliverableChannel[] } {
  const parsed = parse(
    readFileSync(resolve(schemaDir, REL, 'ai-deliverable-channels.yaml'), 'utf8'),
  ) as unknown;
  assertValidRegistry(schemaDir, parsed);
  const doc = asObject(parsed, 'ai-deliverable-channels registry');
  if (!Array.isArray(doc.channels)) {
    throw new Error('ai-deliverable-channels registry must have a channels array');
  }
  return { channels: doc.channels.map((c, i) => normalizeChannel(c, i)) };
}

/**
 * Convenience loader mirroring `loadDefaultSurfacesRegistry` (surfaces.ts:170).
 */
export function loadDefaultAiDeliverableChannels(schemaDir: string): { channels: AiDeliverableChannel[] } {
  return loadAiDeliverableChannels(schemaDir);
}

/**
 * The named-failure primitive (decision rule 3): an undeclared channel is a
 * NAMED failure, never silence. u2/u3 call this when a turn carries an
 * undeclared channel.
 */
export function assertChannelTreated(channels: AiDeliverableChannel[], id: string): AiDeliverableChannel {
  const found = channels.find((c) => c.id === id);
  if (!found) {
    throw new Error(`channel "${id}" has no declared treatment`);
  }
  return found;
}
