/**
 * System prompt builder for the AI agent.
 *
 * Loads the markdown template and fills in editor context placeholders.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EditorContext, LabwareSummary, EventSummary, VerbSummary } from './types.js';

let cachedTemplate: string | null = null;
let cachedTemplatePath: string | null = null;

/**
 * Load the prompt template from disk (cached after first load).
 */
function loadPromptTemplate(templatePath: string): string {
  if (cachedTemplate && cachedTemplatePath === templatePath) {
    return cachedTemplate;
  }

  const absPath = resolve(templatePath);
  if (!existsSync(absPath)) {
    throw new Error(`System prompt template not found: ${absPath}`);
  }

  cachedTemplate = readFileSync(absPath, 'utf-8');
  cachedTemplatePath = templatePath;
  return cachedTemplate;
}

function formatLabwares(labwares: LabwareSummary[]): string {
  if (labwares.length === 0) return '(none)';
  return labwares
    .map((lw) => {
      const addr = lw.addressing.type === 'grid'
        ? `${lw.addressing.rows?.length ?? 0} rows x ${lw.addressing.columns?.length ?? 0} cols`
        : lw.addressing.type;
      return `- **${lw.name}** (${lw.labwareId}): ${lw.labwareType}, ${addr}`;
    })
    .join('\n');
}

function formatEventSummary(eventSummary: { totalEvents: number; recentEvents: EventSummary[] }): string {
  if (eventSummary.totalEvents === 0) return 'No events yet (empty graph).';
  const recent = eventSummary.recentEvents
    .map((e) => {
      let desc = `${e.verb} (${e.event_type})`;
      if (e.materialLabel) desc += ` — ${e.materialLabel}`;
      if (e.targetWells && e.targetWells.length > 0) desc += ` → ${e.targetWells.join(', ')}`;
      return `- ${e.eventId}: ${desc}`;
    })
    .join('\n');
  return `${eventSummary.totalEvents} events total. Recent:\n${recent}`;
}

function formatSelectedWells(selectedWells?: { labwareId: string; wells: string[] }): string {
  if (!selectedWells || selectedWells.wells.length === 0) return '(none selected)';
  return `Labware: ${selectedWells.labwareId}, Wells: ${selectedWells.wells.join(', ')}`;
}

function formatVocabPack(vocabPackId: string, verbs: VerbSummary[]): string {
  const verbList = verbs
    .map((v) => {
      let line = `- \`${v.verb}\` (${v.eventKind})`;
      if (v.description) line += `: ${v.description}`;
      return line;
    })
    .join('\n');
  return `${vocabPackId}\n\nAvailable verbs:\n${verbList}`;
}

/**
 * Build the full system prompt from the template and editor context.
 */
export function buildSystemPrompt(
  context: EditorContext,
  templatePath = 'prompts/event-graph-agent.md',
): string {
  const template = loadPromptTemplate(templatePath);

  // Generate a group ID for this prompt
  const groupId = `ag-${Date.now().toString(36)}`;
  const isoNow = new Date().toISOString();

  return template
    .replace('{{LABWARES}}', formatLabwares(context.labwares))
    .replace('{{EVENT_SUMMARY}}', formatEventSummary(context.eventSummary))
    .replace('{{SELECTED_WELLS}}', formatSelectedWells(context.selectedWells))
    .replace('{{VOCAB_PACK}}', formatVocabPack(context.vocabPackId, context.availableVerbs))
    .replace('{{RUN_ID}}', context.runId ?? 'none')
    .replace('{{ISO_NOW}}', isoNow)
    .replace('{{GROUP_ID}}', groupId);
}
