/**
 * System prompt builder for the AI agent.
 *
 * Loads the markdown template and fills in editor context placeholders.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EditorContext, LabwareSummary, EventSummary } from './types.js';

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
      let addr: string;
      if (lw.addressing?.type === 'grid') {
        const rows = Array.isArray(lw.addressing.rows) ? lw.addressing.rows.length : (lw.addressing.rows ?? 0);
        const cols = Array.isArray(lw.addressing.columns) ? lw.addressing.columns.length : (lw.addressing.columns ?? 0);
        addr = `${rows} rows x ${cols} cols`;
      } else if (lw.addressing?.type) {
        addr = lw.addressing.type;
      } else if (lw.rows != null || lw.columns != null) {
        addr = `${lw.rows ?? '?'} rows x ${lw.columns ?? '?'} cols`;
      } else {
        addr = 'unknown layout';
      }
      return `- **${lw.name}** (${lw.labwareId}): ${lw.labwareType}, ${addr}`;
    })
    .join('\n');
}

function formatEventSummary(eventSummary: EditorContext['eventSummary']): string {
  // Frontend sends a pre-formatted string
  if (typeof eventSummary === 'string') return eventSummary;
  // Structured format
  if (eventSummary.totalEvents === 0) return 'No events yet (empty graph).';
  const recent = eventSummary.recentEvents
    .map((e: EventSummary) => {
      let desc = `${e.verb} (${e.event_type})`;
      if (e.materialLabel) desc += ` — ${e.materialLabel}`;
      if (e.targetWells && e.targetWells.length > 0) desc += ` → ${e.targetWells.join(', ')}`;
      return `- ${e.eventId}: ${desc}`;
    })
    .join('\n');
  return `${eventSummary.totalEvents} events total. Recent:\n${recent}`;
}

function formatSelectedWells(selectedWells?: EditorContext['selectedWells']): string {
  if (!selectedWells) return '(none selected)';
  // Frontend sends string[]
  if (Array.isArray(selectedWells)) {
    return selectedWells.length === 0 ? '(none selected)' : `Wells: ${selectedWells.join(', ')}`;
  }
  // Structured format
  if (selectedWells.wells.length === 0) return '(none selected)';
  return `Labware: ${selectedWells.labwareId}, Wells: ${selectedWells.wells.join(', ')}`;
}

function formatVocabPack(vocabPackId: string, verbs: EditorContext['availableVerbs']): string {
  const verbList = verbs
    .map((v) => {
      if (typeof v === 'string') return `- \`${v}\``;
      let line = `- \`${v.verb}\` (${v.eventKind})`;
      if (v.description) line += `: ${v.description}`;
      return line;
    })
    .join('\n');
  return `${vocabPackId}\n\nAvailable verbs:\n${verbList}`;
}

function formatDeckContext(context: EditorContext): string {
  const platform = context.deckPlatform ?? 'unknown';
  const variant = context.deckVariant ?? 'unknown';
  const mode = context.manualPipettingMode ? 'manual' : 'robot-aware';
  const placements = (context.deckPlacements ?? []).length > 0
    ? context.deckPlacements!
        .map((placement) => {
          const contents = placement.labwareId
            ? `labware=${placement.labwareId}`
            : placement.moduleId
              ? `module=${placement.moduleId}`
              : 'empty';
          return `- ${placement.slotId}: ${contents}`;
        })
        .join('\n')
    : '(no deck placements)';
  return `Platform: ${platform}\nVariant: ${variant}\nMode: ${mode}\nPlacements:\n${placements}`;
}

function formatMaterialTracking(context: EditorContext): string {
  const tracking = context.materialTracking;
  if (!tracking) return 'mode=relaxed, allowAdHocEventInstances=true';
  return `mode=${tracking.mode}, allowAdHocEventInstances=${tracking.allowAdHocEventInstances ? 'true' : 'false'}`;
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
    .replace('{{DECK_CONTEXT}}', formatDeckContext(context))
    .replace('{{MATERIAL_TRACKING}}', formatMaterialTracking(context))
    .replace('{{RUN_ID}}', context.runId ?? 'none')
    .replace('{{ISO_NOW}}', isoNow)
    .replace('{{GROUP_ID}}', groupId);
}
