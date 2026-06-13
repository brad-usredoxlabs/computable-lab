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

function formatGraphLemurContext(context: EditorContext): string {
  const graphLemur = context.graphLemur;
  if (!graphLemur) return '';

  const lines: string[] = ['## GraphLemur Context'];
  lines.push(
    '',
    'GraphLemur operating contract:',
    '- Treat the vendor protocol candidate and source PDF metadata as the authoritative source material for protocol-derived drafts.',
    '- Preserve source evidence anchors, uncertainty, and diagnostic caveats in event notes or metadata whenever the graph cannot represent a biological or procedural detail exactly.',
    '- Do not invent missing vendor-protocol details. Ask for clarification or mark the assumption as unresolved when the source candidate is ambiguous.',
    '- When adapting the protocol to a requested labware format, keep the original protocol intent visible and only change the parts required by the user request.',
  );
  if (graphLemur.revisionMode) {
    lines.push(
      '',
      'Mode: revise the current source-backed preview draft.',
      '- Use the current preview draft as the baseline; do not restart from scratch unless the user explicitly asks for a fresh draft.',
      '- Apply the newest user correction as a targeted revision while preserving unaffected events, labware, ontology bindings, and source anchors.',
      '- Return a full replacement draft, not a partial patch.',
    );
  } else {
    lines.push(
      '',
      'Mode: create an initial source-backed draft from the vendor protocol candidate.',
    );
  }

  if (graphLemur.sourcePdf) {
    const pdf = graphLemur.sourcePdf;
    lines.push('', 'Source PDF:');
    if (pdf.title) lines.push(`- title: ${pdf.title}`);
    if (pdf.vendor) lines.push(`- vendor: ${pdf.vendor}`);
    if (pdf.url) lines.push(`- url: ${pdf.url}`);
    if (pdf.artifactPath) lines.push(`- artifactPath: ${pdf.artifactPath}`);
    if (pdf.sha256) lines.push(`- sha256: ${pdf.sha256}`);
  }

  if (graphLemur.sourceProtocolCandidate) {
    const candidate = graphLemur.sourceProtocolCandidate;
    lines.push('', 'Source protocol candidate:');
    lines.push(JSON.stringify({
      title: candidate.title,
      scope: candidate.scope,
      source: candidate.source,
      materials: candidate.materials ?? [],
      labware: candidate.labware ?? [],
      equipment: candidate.equipment ?? [],
      steps: candidate.steps ?? [],
      diagnostics: candidate.diagnostics ?? [],
    }, null, 2));
  }

  if (graphLemur.currentPreviewDraft) {
    lines.push('', context.draftRevision ? 'Legacy GraphLemur preview draft:' : 'Current preview draft to revise:');
    lines.push(JSON.stringify(graphLemur.currentPreviewDraft, null, 2));
  }

  if (graphLemur.revisionHistory && graphLemur.revisionHistory.length > 0) {
    lines.push('', 'Prior user corrections:');
    for (const entry of graphLemur.revisionHistory.slice(-6)) {
      lines.push(`- ${entry.createdAt}: ${entry.prompt}`);
    }
  }

  return lines.join('\n');
}

function formatDraftRevisionContext(context: EditorContext): string {
  const draftRevision = context.draftRevision;
  if (!draftRevision) return '';

  const lines: string[] = ['## Preview Revision Context'];
  lines.push(
    '',
    'Mode: revise the current ghost preview draft.',
    '- Use the current preview draft as the baseline; do not restart from scratch unless the user explicitly asks for a fresh draft.',
    '- Apply the newest user correction as a targeted revision while preserving unaffected events, labware, ontology bindings, source prompts, and skipped-preview diagnostics.',
    '- Return a full replacement draft, not a partial patch.',
  );

  lines.push('', 'Current preview draft to revise:');
  lines.push(JSON.stringify(draftRevision.currentPreviewDraft, null, 2));

  if (draftRevision.revisionHistory && draftRevision.revisionHistory.length > 0) {
    lines.push('', 'Prior user corrections:');
    for (const entry of draftRevision.revisionHistory.slice(-6)) {
      lines.push(`- ${entry.createdAt}: ${entry.prompt}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Surface-aware prompt sections
// ============================================================================

export type AiSurface =
  | 'event-editor'
  | 'workspace.deck'
  | 'run-workspace'
  | `run-workspace:${'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims'}`
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature'
  | 'protocol-ide';

type BaseSurface = 'event-editor' | 'run-workspace' | 'materials' | 'formulations' | 'ingestion' | 'literature' | 'protocol-ide';

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
  'protocol-ide': `
You are an AI assistant helping a human reviewer improve the Protocol Foundry pre-compiler/compiler pipeline.
The user is reviewing a life-science vendor protocol, extracted text/PDF evidence, pre-compiled artifacts, compiler output, event graph state, architect recommendations, and issue cards.

Your job is to compare the source protocol against the event graph and help decide whether the proposed spec is correct, should be narrowed, or should be rejected as redundant.
Keep proposed fixes narrow: one observable compiler/pre-compiler behavior, a small file set, and acceptance criteria that a competent local coder can patch in one session.
Prefer breadth-first improvement: one useful spec per protocol/PDF for the current round, then implementation by the Ralph coder-critic-retry loop.
Everything that can be data should be data: prefer structured context, assertions, claims, evidence, semantic keys, graph anchors, and machine-checkable acceptance criteria over prose-only patches.
Do not invent missing protocol details. If evidence is missing or ambiguous, say what artifact or citation should be checked.
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
  // The workspace deck tab IS an event editor — it drafts event graphs onto
  // a canvas. Without the full event-graph prompt (detail schemas, labware
  // model, output format) the model improvises malformed event details
  // (observed: add_material with only a material recordId — renders as
  // nothing). It previously fell through to the generic chat preamble.
  if (surface === 'event-editor' || surface === 'workspace.deck') {
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

  // No timestamps or generated ids here: the rendered prompt must be a pure
  // function of (template, context) so identical editor state produces a
  // byte-identical prefix that llama-server's prompt cache can reuse.
  // Event provenance is stamped server-side when drafts are parsed.
  const prompt = `${materialRules.trim()}\n\n---\n\n${template}`
    .replace('{{LABWARES}}', formatLabwares(context.labwares))
    .replace('{{EVENT_SUMMARY}}', formatEventSummary(context.eventSummary))
    .replace('{{WELL_STATE_SNAPSHOT}}', formatWellStateSnapshot(context))
    .replace('{{VOCAB_PACK}}', formatVocabPack(context.vocabPackId, context.availableVerbs))
    .replace('{{DECK_CONTEXT}}', formatDeckContext(context))
    .replace('{{MATERIAL_TRACKING}}', formatMaterialTracking(context))
    .replace('{{RUN_ID}}', context.runId ?? 'none');

  const extraContexts = [
    formatGraphLemurContext(context),
    formatDraftRevisionContext(context),
  ].filter(Boolean);
  return extraContexts.length > 0 ? `${prompt}\n\n---\n\n${extraContexts.join('\n\n---\n\n')}` : prompt;
}

/**
 * Logical cache identity for a (surface, context) pair. Sent as the llama.cpp
 * `cache_key` on both background warm requests and real draft requests so the
 * server routes them to the same slot (and thus the same warmed KV prefix).
 * Must stay in sync between the warm triggers and the orchestrator — that is
 * why it lives here as the single derivation.
 */
export function deriveContextCacheKey(
  surface: AiSurface | undefined,
  context: EditorContext,
): string {
  if (surface?.startsWith('run-workspace') && context.runId) {
    return `run:${context.runId}`;
  }
  return `event-editor:${context.runId ?? context.eventGraphId ?? 'default'}`;
}

/**
 * Render the per-turn volatile editor state (selection, pane selections,
 * prompt mentions) as an `[Editor state]` block. This rides at the top of the
 * user message — NOT the system prompt — so the system prefix stays
 * byte-stable between graph mutations and llama-server can reuse its KV cache.
 * Returns null when there is no volatile state worth sending.
 */
export function buildVolatileContextMessage(context: EditorContext): string | null {
  const sections: string[] = [];

  const selectedWells = formatSelectedWells(context.selectedWells);
  if (selectedWells !== '(none selected)') sections.push(`Selected wells: ${selectedWells}`);

  const source = formatPaneSelection('Source Selection', context.sourceSelection);
  if (!source.endsWith('(none)')) sections.push(source);

  const target = formatPaneSelection('Target Selection', context.targetSelection);
  if (!target.endsWith('(none)')) sections.push(target);

  const mentions = formatMentions(context);
  if (mentions !== '(none)') sections.push(`Prompt mentions:\n${mentions}`);

  if (sections.length === 0) return null;
  return `[Editor state]\n${sections.join('\n')}`;
}
