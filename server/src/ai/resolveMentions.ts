/**
 * Module for resolving mention tokens to their entity data.
 *
 * This module provides the resolveMentionsForPrompt function that
 * parses mention tokens from a prompt and fetches their associated
 * entity data using provided dependency functions.
 */

import { parsePromptMentionMatches, type ParsedPromptMention } from './promptMentions.js';

/**
 * A resolved mention with attached entity data.
 */
export interface ResolvedMention {
  raw: string;                              // the original [[...]] token
  kind: 'material-spec' | 'aliquot' | 'material' | 'labware' | 'selection' | 'protocol' | 'graph-component';
  id: string;
  label: string;
  resolved?: Record<string, unknown>;       // entity data, if lookup succeeded
  error?: string;                            // if lookup failed
}

/**
 * Dependencies for resolving mentions.
 * Each fetch function is optional - missing deps leave resolved undefined.
 */
export interface ResolveMentionDeps {
  fetchMaterialSpec?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchAliquot?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchMaterial?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchLabware?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchProtocol?: (id: string) => Promise<Record<string, unknown> | null>;
  fetchGraphComponent?: (id: string) => Promise<Record<string, unknown> | null>;
}

/**
 * Resolve all mentions in a prompt, fetching entity data for each.
 *
 * @param prompt - The prompt text containing mention tokens
 * @param deps - Dependency functions for fetching entity data
 * @returns Array of resolved mentions with entity data attached
 */
export async function resolveMentionsForPrompt(
  prompt: string,
  deps: ResolveMentionDeps,
): Promise<ResolvedMention[]> {
  const parsed = parsePromptMentionMatches(prompt);
  
  // Deduplicate by raw token string
  const seen = new Set<string>();
  const uniqueParsed: ParsedPromptMention[] = [];
  
  for (const entry of parsed) {
    if (!seen.has(entry.raw)) {
      seen.add(entry.raw);
      uniqueParsed.push(entry);
    }
  }

  const results: ResolvedMention[] = [];

  for (const entry of uniqueParsed) {
    const { mention, raw } = entry;
    // Derive kind from mention.type, with entityKind as override for material mentions
    let kind: 'material-spec' | 'aliquot' | 'material' | 'labware' | 'selection' | 'protocol' | 'graph-component';
    if (mention.type === 'tube') {
      // Tube mentions are size literals, not records — don't resolve them as a
      // material (which would trigger a bogus fetch). The token stays in the
      // prompt as free-text context for the model.
      continue;
    } else if (mention.type === 'labware') {
      kind = 'labware';
    } else if (mention.type === 'selection') {
      kind = 'selection';
    } else if (mention.type === 'protocol') {
      // protocol type - use entityKind which is either 'protocol' or 'graph-component'
      kind = (mention.entityKind ?? 'protocol') as 'protocol' | 'graph-component';
    } else {
      // material type - use entityKind or default to 'material'
      kind = (mention.entityKind ?? 'material') as 'material-spec' | 'aliquot' | 'material';
    }
    const id = mention.id ?? '';
    const label = mention.label;

    const result: ResolvedMention = {
      raw,
      kind,
      id,
      label,
    };

    // Fetch entity data based on kind
    let fetched: Record<string, unknown> | null | undefined;

    switch (kind) {
      case 'material-spec':
        if (deps.fetchMaterialSpec) {
          fetched = await deps.fetchMaterialSpec(id);
        }
        break;
      case 'aliquot':
        if (deps.fetchAliquot) {
          fetched = await deps.fetchAliquot(id);
        }
        break;
      case 'material':
        if (deps.fetchMaterial) {
          fetched = await deps.fetchMaterial(id);
        }
        break;
      case 'labware':
        if (deps.fetchLabware) {
          fetched = await deps.fetchLabware(id);
        }
        break;
      case 'protocol':
        if (deps.fetchProtocol) {
          fetched = await deps.fetchProtocol(id);
        }
        break;
      case 'graph-component':
        if (deps.fetchGraphComponent) {
          fetched = await deps.fetchGraphComponent(id);
        }
        break;
      case 'selection':
        // Selection mentions don't have a fetcher - they're resolved client-side
        break;
    }

    if (fetched) {
      result.resolved = fetched;
    } else if (fetched === null && (
      kind === 'material-spec' || kind === 'aliquot' || kind === 'material' || kind === 'labware' || kind === 'protocol' || kind === 'graph-component'
    )) {
      // Only set error if a fetcher was provided but returned null
      const fetcherName = kind === 'material-spec' ? 'fetchMaterialSpec' :
                         kind === 'aliquot' ? 'fetchAliquot' :
                         kind === 'material' ? 'fetchMaterial' :
                         kind === 'labware' ? 'fetchLabware' :
                         kind === 'protocol' ? 'fetchProtocol' :
                         kind === 'graph-component' ? 'fetchGraphComponent' : null;
      
      if (fetcherName && deps[fetcherName as keyof ResolveMentionDeps]) {
        result.error = `No entity found for ${kind}:${id}`;
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Serialize resolved mentions to a YAML-like string for injection into prompts.
 * Uses simple hand-serialization without external YAML libraries.
 */
export function serializeResolvedContext(mentions: ResolvedMention[]): string {
  const lines: string[] = [];
  
  lines.push('<resolved_context>');
  lines.push('# Pre-resolved references from the user\'s prompt. Use these values');
  lines.push('# directly — do not call tools to re-fetch them.');
  lines.push('resolved:');

  for (const mention of mentions) {
    // Include mentions that resolved to a record, AND explicit [[...]] refs whose
    // record couldn't be fetched (e.g. a draft material-spec). The token itself
    // is the user's grounded choice, so it still belongs here — otherwise the
    // agent re-asks for a clarification it already has.
    if (!mention.resolved && !isExplicitPromptRef(mention)) continue;

    lines.push(`  - raw: "${escapeYamlString(mention.raw)}"`);
    lines.push(`    kind: ${mention.kind}`);
    lines.push(`    id: ${escapeYamlString(mention.id)}`);
    lines.push(`    label: "${escapeYamlString(mention.label)}"`);

    if (mention.resolved) {
      // Serialize the resolved entity data with extra indentation
      const resolvedJson = JSON.stringify(mention.resolved, null, 2);
      const indentedResolved = resolvedJson.split('\n').map(line => '    ' + line).join('\n');
      lines.push(`    resolved: ${indentedResolved}`);
    } else {
      // Grounded by reference: the record isn't preloaded, but the id + label are
      // the user's explicit choice — treat as resolved, do not re-clarify.
      lines.push(
        `    resolved: { "kind": "${escapeYamlString(mention.kind)}", "id": "${escapeYamlString(mention.id)}", "label": "${escapeYamlString(mention.label)}", "groundedByReference": true }`,
      );
    }
  }

  lines.push('</resolved_context>');

  return lines.join('\n');
}

/**
 * An explicit `[[kind:id|label]]` reference the user (or a prior grounded answer)
 * placed in the prompt. Such a token is an authoritative choice even when the
 * record can't be fetched (e.g. a draft material-spec that was never persisted),
 * so it still belongs in resolved_context. Selection mentions are excluded —
 * they're resolved client-side and carry no fetchable record id.
 */
function isExplicitPromptRef(mention: ResolvedMention): boolean {
  return mention.kind !== 'selection' && Boolean(mention.id && mention.id.trim());
}

/**
 * Escape special characters for YAML string values.
 */
function escapeYamlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Build a system message containing the resolved context.
 * Returns null if there are no successfully resolved mentions.
 */
export function buildResolvedContextMessage(mentions: ResolvedMention[]): string | null {
  const usable = mentions.filter((m) => m.resolved || isExplicitPromptRef(m));
  if (usable.length === 0) return null;

  return serializeResolvedContext(usable);
}
