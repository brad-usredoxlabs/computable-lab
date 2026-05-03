/**
 * Server-side mention parser for prompt tokens.
 *
 * This module exports parsing semantics that mirror the app-side parser
 * for material, material-spec, aliquot, labware, and selection tokens.
 */

export interface PromptMention {
  type: 'material' | 'labware' | 'selection' | 'protocol';
  entityKind?: 'material' | 'material-spec' | 'aliquot' | 'protocol' | 'graph-component';
  selectionKind?: 'source' | 'target';
  id?: string;
  label: string;
  labwareId?: string;
  wells?: string[];
}

export interface ParsedPromptMention {
  mention: PromptMention;
  raw: string;
  start: number;
  end: number;
}

/**
 * Alias for ParsedPromptMention to match the spec's expected export name.
 */
export type PromptMentionMatch = ParsedPromptMention;

/**
 * The regex pattern for matching mention tokens.
 * Format: [[kind:id|label]] or [[kind:id|label|extra]]
 */
const MENTION_PATTERN = /\[\[(material|material-spec|aliquot|labware|selection|protocol|graph-component):(.*?)\]\]/g;

/**
 * Parse all mention matches from a prompt string.
 * Returns an array of parsed mention objects with their positions.
 */
export function parsePromptMentionMatches(prompt: string): ParsedPromptMention[] {
  const mentions: ParsedPromptMention[] = [];
  // Reset lastIndex — the module-scoped regex carries state from the previous
  // call when the `g` flag is set, which silently returns 0 matches when this
  // function is invoked twice in the same request (e.g. once in
  // runChatbotCompile to build effectiveMentions and again inside the
  // deterministic_precompile pass to build the placeholder map).
  MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_PATTERN.exec(prompt)) !== null) {
    const kind = match[1];
    const body = match[2] ?? '';
    const start = match.index;
    const raw = match[0];
    const end = start + raw.length;

    if (kind === 'material' || kind === 'material-spec' || kind === 'aliquot') {
      const [id = '', label = id] = body.split('|');
      if (!id) continue;
      mentions.push({
        mention: {
          type: 'material',
          entityKind: kind,
          id,
          label,
        },
        raw,
        start,
        end,
      });
      continue;
    }

    if (kind === 'labware') {
      const [id = '', label = id] = body.split('|');
      if (!id) continue;
      mentions.push({
        mention: {
          type: 'labware',
          id,
          label,
        },
        raw,
        start,
        end,
      });
      continue;
    }

    if (kind === 'selection') {
      const parts = body.split('|');
      const selectionKindRaw = parts[0] ?? '';
      const labwareId = parts[1] ?? '';
      const wellsRaw = parts[2] ?? '';
      const label = parts[3] ?? '';

      if ((selectionKindRaw !== 'source' && selectionKindRaw !== 'target') || !labwareId) continue;

      mentions.push({
        mention: {
          type: 'selection',
          selectionKind: selectionKindRaw,
          labwareId,
          wells: wellsRaw ? wellsRaw.split(',').filter(Boolean) : [],
          label: label || `${selectionKindRaw}:${labwareId}`,
        },
        raw,
        start,
        end,
      });
      continue;
    }
    if (kind === 'protocol' || kind === 'graph-component') {
      const [id = '', label = id] = body.split('|');
      if (!id) continue;
      mentions.push({
        mention: {
          type: 'protocol',
          entityKind: kind,
          id,
          label,
        },
        raw,
        start,
        end,
      });
      continue;
    }
  }

  return mentions;
}

/**
 * Parse mentions from a prompt string, returning just the mention objects.
 */
export function parsePromptMentions(prompt: string): PromptMention[] {
  return parsePromptMentionMatches(prompt).map((entry) => entry.mention);
}
