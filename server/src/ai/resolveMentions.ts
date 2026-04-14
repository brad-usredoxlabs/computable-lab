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
    if (mention.type === 'labware') {
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
    // Only include mentions that resolved successfully
    if (!mention.resolved) continue;

    lines.push(`  - raw: "${escapeYamlString(mention.raw)}"`);
    lines.push(`    kind: ${mention.kind}`);
    lines.push(`    id: ${escapeYamlString(mention.id)}`);
    lines.push(`    label: "${escapeYamlString(mention.label)}"`);
    
    // Serialize the resolved entity data with extra indentation
    const resolvedJson = JSON.stringify(mention.resolved, null, 2);
    const indentedResolved = resolvedJson.split('\n').map(line => '    ' + line).join('\n');
    lines.push(`    resolved: ${indentedResolved}`);
  }

  lines.push('</resolved_context>');
  
  return lines.join('\n');
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
  const successful = mentions.filter(m => m.resolved);
  if (successful.length === 0) return null;
  
  return serializeResolvedContext(successful);
}
