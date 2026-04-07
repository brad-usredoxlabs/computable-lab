/**
 * System prompt builder for the AI agent.
 *
 * Loads the markdown template and fills in editor context placeholders.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EditorContext, LabwareSummary, EventSummary } from './types.js';

const promptCache = new Map<string, string>();

/**
 * Load the prompt template from disk (cached after first load).
 */
function loadPromptTemplate(templatePath: string): string {
  const cached = promptCache.get(templatePath);
  if (cached) return cached;
  const absPath = resolve(templatePath);
  if (!existsSync(absPath)) {
    throw new Error(`System prompt template not found: ${absPath}`);
  }
  const template = readFileSync(absPath, 'utf-8');
  promptCache.set(templatePath, template);
  return template;
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

function formatPaneSelection(
  label: string,
  selection?: EditorContext['sourceSelection'] | EditorContext['targetSelection'],
): string {
  if (!selection || selection.wells.length === 0) return `${label}: (none)`;
  return `${label}: ${selection.labwareName} (${selection.labwareId}) -> ${selection.wells.join(', ')}`;
}

function formatWellStateSnapshot(context: EditorContext): string {
  const entries = context.wellStateSnapshot ?? [];
  if (entries.length === 0) return '(none)';
  return entries
    .map((entry) => {
      const materials = entry.materials.length > 0
        ? entry.materials
            .map((material) => {
              const parts = [material.label];
              if (typeof material.volume_uL === 'number') parts.push(`${material.volume_uL.toFixed(3)} uL`);
              if (material.concentration) parts.push(`${material.concentration.value} ${material.concentration.unit}`);
              else if (material.concentrationUnknown) parts.push('concentration=unknown');
              if (typeof material.count === 'number') parts.push(`count=${material.count.toFixed(3)}`);
              if (material.materialSpecRefId) parts.push(`spec=${material.materialSpecRefId}`);
              if (material.aliquotRefId) parts.push(`aliquot=${material.aliquotRefId}`);
              return parts.join(' | ');
            })
            .join('; ')
        : 'empty';
      const flags = [
        `total=${entry.totalVolume_uL.toFixed(3)} uL`,
        `events=${entry.eventCount}`,
        ...(entry.harvested ? ['harvested=true'] : []),
        ...(entry.lastEventId ? [`last=${entry.lastEventId}`] : []),
      ].join(', ');
      return `- ${entry.labwareName} (${entry.labwareId}) ${entry.wellId}: ${materials} [${flags}]`;
    })
    .join('\n');
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

function formatMentions(context: EditorContext): string {
  if (!context.mentions || context.mentions.length === 0) return '(none)';
  return context.mentions.map((mention) => {
    if (mention.type === 'material') {
      return `- material ${mention.entityKind ?? 'material'}: ${mention.label}${mention.id ? ` (${mention.id})` : ''}`;
    }
    if (mention.type === 'labware') {
      return `- labware: ${mention.label}${mention.id ? ` (${mention.id})` : ''}`;
    }
    return `- ${mention.selectionKind ?? 'selection'} selection: ${mention.label}${mention.labwareId ? ` [${mention.labwareId}]` : ''}${mention.wells?.length ? ` -> ${mention.wells.join(', ')}` : ''}`;
  }).join('\n');
}

// ============================================================================
// Surface-aware prompt sections
// ============================================================================

export type AiSurface =
  | 'event-editor'
  | 'run-workspace'
  | `run-workspace:${'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims'}`
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature';

type BaseSurface = 'event-editor' | 'run-workspace' | 'materials' | 'formulations' | 'ingestion' | 'literature';

const SURFACE_PREAMBLES: Record<BaseSurface, string> = {
  'event-editor': '',  // Default — uses the full event-graph-agent template
  'run-workspace': `
You are an AI assistant helping a scientist navigate a run workspace.
The user is viewing a laboratory run with multiple tabs (overview, plan, biology, readouts, results, claims).
Help them understand run status, interpret results, suggest next steps, and answer questions about the run's plan and execution.
You do NOT have access to the event graph editor tools in this context.
`,
  'materials': `
You are an AI assistant helping a scientist manage their materials inventory.
The user is browsing prepared materials, aliquots, vendor reagents, and biological/derived outputs.
Help them find materials, understand lineage, suggest usage, and answer questions about material properties.
You do NOT have access to the event graph editor tools in this context.
`,
  'formulations': `
You are an AI assistant helping a scientist create and manage formulations (recipes).
The user is working with ingredient compositions, concentrations, and recipe execution.
Help them design formulations, calculate concentrations, suggest ingredient substitutions, and troubleshoot preparation workflows.
You do NOT have access to the event graph editor tools in this context.
`,
  'ingestion': `
You are an AI assistant helping a scientist ingest external data into the lab system.
The user is uploading vendor plate maps, spreadsheets, and catalog pages for automated parsing.
Help them select the right source type, troubleshoot parsing failures, review extracted candidates, and configure ontology preferences.
You do NOT have access to the event graph editor tools in this context.
`,
  'literature': `
You are an AI assistant helping a scientist explore biological literature and extract knowledge.
The user is searching sources like PubMed and reviewing AI-extracted claims, assertions, and evidence.
Help them refine searches, interpret extracted knowledge, assess confidence, and identify relevant findings.
You do NOT have access to the event graph editor tools in this context.
`,
};

/**
 * Domain-specific prompt templates for run-centered draft operations.
 * Maps tab-qualified surfaces to their template files in prompts/.
 */
const DOMAIN_PROMPT_TEMPLATES: Partial<Record<string, string>> = {
  'run-workspace:plan': 'prompts/event-graph-draft.md',
  'run-workspace:biology': 'prompts/meaning-draft.md',
  'run-workspace:claims': 'prompts/evidence-draft.md',
};

/**
 * Get a surface-specific preamble to prepend to the system prompt.
 * Supports tab-qualified surfaces like 'run-workspace:results' by matching
 * the base prefix (e.g. 'run-workspace').
 */
export function getSurfacePreamble(surface: AiSurface): string {
  if (surface in SURFACE_PREAMBLES) return SURFACE_PREAMBLES[surface as BaseSurface];
  const base = surface.split(':')[0] as BaseSurface;
  return SURFACE_PREAMBLES[base] || '';
}

function formatContextSummary(context: EditorContext): string {
  return Object.entries(context)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
}

/**
 * Build a surface-aware system prompt.
 * For the event-editor surface, delegates to buildSystemPrompt with the full template.
 * For domain-specific draft surfaces, loads the dedicated prompt template.
 * For other surfaces, builds a lighter prompt with a surface-specific preamble.
 */
export function buildSurfaceAwarePrompt(
  surface: AiSurface,
  context: EditorContext,
): string {
  if (surface === 'event-editor') {
    return buildSystemPrompt(context);
  }

  // Domain-specific draft surfaces get their dedicated prompt template
  const domainTemplate = DOMAIN_PROMPT_TEMPLATES[surface];
  if (domainTemplate) {
    try {
      const template = loadPromptTemplate(domainTemplate);
      const contextSummary = formatContextSummary(context);
      return `${template.trim()}

## Run Context

${contextSummary || '(no specific context provided)'}
`.trim();
    } catch {
      // Fall through to generic preamble if template not found
    }
  }

  // Non-editor surfaces get a simpler prompt with the surface preamble
  const preamble = getSurfacePreamble(surface);
  const contextSummary = formatContextSummary(context);

  return `${preamble.trim()}

## Current Context

${contextSummary || '(no specific context provided)'}

## Instructions

- Respond helpfully based on the surface context above.
- If the user asks about something outside this surface's scope, explain that they should navigate to the appropriate page.
- Be concise and scientifically accurate.
`.trim();
}

/**
 * Build the full system prompt from the template and editor context.
 */
export function buildSystemPrompt(
  context: EditorContext,
  templatePath = 'prompts/event-graph-agent.md',
): string {
  const template = loadPromptTemplate(templatePath);
  const materialRules = loadPromptTemplate('prompts/material-system-rules.md');

  // Generate a group ID for this prompt
  const groupId = `ag-${Date.now().toString(36)}`;
  const isoNow = new Date().toISOString();

  return `${materialRules.trim()}\n\n---\n\n${template}`
    .replace('{{LABWARES}}', formatLabwares(context.labwares))
    .replace('{{EVENT_SUMMARY}}', formatEventSummary(context.eventSummary))
    .replace('{{SELECTED_WELLS}}', formatSelectedWells(context.selectedWells))
    .replace('{{SOURCE_SELECTION}}', formatPaneSelection('Source Selection', context.sourceSelection))
    .replace('{{TARGET_SELECTION}}', formatPaneSelection('Target Selection', context.targetSelection))
    .replace('{{WELL_STATE_SNAPSHOT}}', formatWellStateSnapshot(context))
    .replace('{{VOCAB_PACK}}', formatVocabPack(context.vocabPackId, context.availableVerbs))
    .replace('{{DECK_CONTEXT}}', formatDeckContext(context))
    .replace('{{MATERIAL_TRACKING}}', formatMaterialTracking(context))
    .replace('{{PROMPT_MENTIONS}}', formatMentions(context))
    .replace('{{RUN_ID}}', context.runId ?? 'none')
    .replace('{{ISO_NOW}}', isoNow)
    .replace('{{GROUP_ID}}', groupId);
}
