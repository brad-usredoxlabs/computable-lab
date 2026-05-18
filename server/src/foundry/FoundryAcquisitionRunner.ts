import { join } from 'node:path';
import type { InferenceClient } from '../ai/types.js';
import type { ToolRegistry } from '../ai/ToolRegistry.js';
import { runFoundryToolAgent } from './FoundryToolAgent.js';
import {
  FoundryAcquisitionJobManager,
  type FoundryAcquisitionJobRecord,
} from './FoundryAcquisitionJobManager.js';
import { toolsForFoundryAcquisitionJob } from './FoundryRegistryTools.js';
import { buildFoundryAcquisitionStructuredResult } from './FoundryAcquisitionOutputs.js';

export interface RunFoundryAcquisitionJobInput {
  manager: FoundryAcquisitionJobManager;
  job: FoundryAcquisitionJobRecord;
  registry: ToolRegistry;
  client: InferenceClient;
  model: string;
  workspaceRoot: string;
}

export async function runFoundryAcquisitionJob(input: RunFoundryAcquisitionJobInput): Promise<FoundryAcquisitionJobRecord> {
  const tracePath = join(input.job.jobRoot, `tool-agent-${input.job.jobKind}.jsonl`);
  await input.manager.startJob(input.job.id, tracePath);

  const tools = toolsForFoundryAcquisitionJob(input.registry, input.job.jobKind);
  await input.manager.appendEvent(input.job.id, {
    source: 'server',
    phase: 'tools_ready',
    message: `Prepared ${tools.length} registry tool(s) for ${input.job.jobKind}`,
    details: { tools: tools.map((tool) => tool.definition.function.name) },
  });

  const agentResult = await runFoundryToolAgent({
    client: input.client,
    model: input.model,
    workdir: input.workspaceRoot,
    localToolNames: [],
    extraTools: tools,
    systemPrompt: acquisitionSystemPrompt(input.job.jobKind),
    prompt: acquisitionPrompt(input.job),
    tracePath,
    maxTurns: 40,
    maxTokens: 16_384,
    temperature: 0.1,
    requireCompletionPromise: false,
    onProgress: async (event) => {
      await input.manager.appendEvent(input.job.id, {
        source: event.phase === 'tool_started' || event.phase === 'tool_finished' ? 'tool' : 'agent',
        phase: event.phase,
        message: event.message,
        ...(event.details ? { details: event.details } : {}),
      });
    },
  });

  if (agentResult.status !== 'complete') {
    const outputSummary = await buildFoundryAcquisitionStructuredResult({
      tracePath,
      finalText: agentResult.finalText,
    });
    return input.manager.failJob(input.job.id, `Agent did not complete: ${agentResult.status}`, {
      status: agentResult.status,
      turns: agentResult.turns,
      toolCalls: agentResult.toolCalls,
      tracePath,
      finalText: agentResult.finalText.slice(0, 8000),
    }, outputSummary);
  }

  const outputSummary = await buildFoundryAcquisitionStructuredResult({
    tracePath,
    finalText: agentResult.finalText,
  });
  return input.manager.completeJob(input.job.id, {
    jobKind: input.job.jobKind,
    status: 'needs-review',
    turns: agentResult.turns,
    toolCalls: agentResult.toolCalls,
    tracePath,
    finalText: agentResult.finalText,
    outputSummary,
  }, agentResult.finalText, outputSummary);
}

function acquisitionSystemPrompt(kind: FoundryAcquisitionJobRecord['jobKind']): string {
  return [
    'You are a Protocol Foundry acquisition agent.',
    'Your job is to gather evidence with tools and produce a reviewable draft.',
    'Do not publish canonical records or claim the user approved anything.',
    'Prefer official vendor, database, or publication sources over secondary summaries.',
    'Cite every source URL, PMID, accession, or record identifier that supports a draft field.',
    kindInstructions(kind),
    'Return a concise Markdown report with sections: Summary, Sources, Draft, Validation, Open Questions.',
    'When drafting structured records, include a fenced json block containing the candidate payload.',
  ].join('\n');
}

function kindInstructions(kind: FoundryAcquisitionJobRecord['jobKind']): string {
  switch (kind) {
    case 'literature-extraction':
      return 'For literature jobs, use PubMed, Europe PMC, and related bio-source tools. Extract claims/evidence, not unsupported recommendations.';
    case 'protocol-from-document':
      return 'For protocol document jobs, search for the source document, download/extract the vendor PDF when available, call vendor_protocol_extract_candidate, call vendor_protocol_draft_event_graph to produce a compiler prompt and draft event graph with provenance, then call vendor_protocol_promote_event_graph only when the draft is ready to write as a canonical event-graph record.';
    case 'labware-from-spec':
      return 'For labware jobs, search official product/spec sources, download/extract the vendor PDF when available, call labware_spec_extract_candidate to draft vendor/catalog fields, topology, capacity, physical geometry, evidence, and validation gaps, call labware_spec_promote_candidate only when the draft is ready to write as a canonical labware-definition, then call opentrons_labware_generate_definition when enough geometry exists for a robot-facing custom labware JSON.';
    case 'material-from-source':
      return 'For material/vendor jobs, search official source material and draft identity, composition, vendor-product metadata, and ontology links.';
  }
}

function acquisitionPrompt(job: FoundryAcquisitionJobRecord): string {
  return [
    `Job kind: ${job.jobKind}`,
    `Original request: ${job.prompt}`,
    '',
    'Conversation so far:',
    ...job.turns.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`),
  ].join('\n');
}
