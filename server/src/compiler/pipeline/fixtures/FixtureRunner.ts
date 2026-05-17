/**
 * FixtureRunner - Runs a compile pipeline with a mocked LLM.
 *
 * The runner builds a mock LlmClient that returns the fixture's pinned
 * ai_precompile output verbatim, then invokes runChatbotCompile and
 * collects the actual TerminalArtifacts.
 */

import type { LlmClient, AiPrecompileOutput } from '../passes/ChatbotCompilePasses.js';
import type { CompletionRequest, CompletionResponse } from '../../../ai/types.js';
import type { RunChatbotCompileArgs, RunChatbotCompileResult } from '../../../ai/runChatbotCompile.js';
import { runChatbotCompile } from '../../../ai/runChatbotCompile.js';
import type { Fixture, FixtureResult } from './FixtureTypes.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import type { FileAttachment } from '../../../ai/types.js';

// Ensure pattern expanders are registered (side-effect import)
import '../../../compiler/patterns/index.js';

// ---------------------------------------------------------------------------
// buildTestDeps — minimal stubs for non-LLM dependencies
// ---------------------------------------------------------------------------

/**
 * Build a minimal ExtractionRunnerService stub that returns empty results.
 */
function buildTestExtractionService(): ExtractionRunnerService {
  return {
    run: async (_req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> => ({
      target_kind: _req.target_kind,
      source: _req.source,
      candidates: [],
      diagnostics: [],
    }),
  } as unknown as ExtractionRunnerService;
}

/**
 * Deterministic alias map for labware hints — mirrors the same map used by
 * createLabwareLookup so test fixtures can resolve hints to record IDs.
 */
const TEST_LABWARE_ALIAS_MAP: Record<string, string> = {
  generic_24x1_5ml_tube_rack: 'lbw-def-generic-50x1p5ml-tube-rack',
  generic_6x15ml_tube_rack: 'lbw-def-generic-6x15ml-tube-rack',
  generic_4x50ml_tube_rack: 'lbw-def-generic-4x50ml-tube-rack',
  generic_96_well_plate: 'lbw-def-generic-96-well-plate',
  generic_384_well_plate: 'lbw-def-generic-384-well-plate',
  generic_24_well_plate: 'lbw-def-generic-24-well-plate',
  generic_96_well_deep_plate: 'lbw-def-generic-96-well-deep-plate',
  generic_1_well_reservoir: 'lbw-def-generic-reservoir-1-v1',
  generic_8_well_reservoir: 'lbw-def-generic-8-reservoir',
  generic_12_well_reservoir: 'lbw-def-generic-12-reservoir',
  generic_2_well_reservoir: 'lbw-def-generic-2-well-reservoir',
  generic_24_well_reservoir: 'lbw-def-generic-24-well-reservoir',
  generic_96_tip_rack: 'lbw-def-generic-96-tip-rack',
  generic_96x0p2ml_pcr_rack: 'lbw-def-generic-96x0p2ml-pcr-rack',
  integra_tiprack_12_5ul_384: 'lbw-def-integra-tiprack-12-5ul-384-v1',
  integra_tiprack_1250ul_96: 'lbw-def-integra-tiprack-1250ul-96-v1',
  integra_tiprack_125ul_384: 'lbw-def-integra-tiprack-125ul-384-v1',
  integra_tiprack_300ul_96: 'lbw-def-integra-tiprack-300ul-96-v1',
  nest_96_wellplate_200ul_flat: 'lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1',
  nest_96_wellplate_2ml_deep: 'lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1',
  nest_12_reservoir_22ml: 'lbw-def-opentrons-nest-12-reservoir-22ml-v1',
  nest_8_reservoir_22ml: 'lbw-def-opentrons-nest-8-reservoir-22ml-v1',
};

/**
 * Build a minimal searchLabwareByHint stub that resolves hints via the
 * deterministic alias map.  This lets fixtures that reference labware by
 * human-readable hints (e.g. "96-well plate") get proper record IDs in the
 * resolve_labware output.
 */
function buildTestSearchLabwareByHint() {
  return async (hint: string): Promise<Array<{ recordId: string; title: string }>> => {
    const normalized = hint.toLowerCase().trim();
    if (!normalized) return [];

    // Direct alias map lookup
    const directAlias = TEST_LABWARE_ALIAS_MAP[normalized];
    if (directAlias) {
      return [{ recordId: directAlias, title: directAlias }];
    }

    // Fuzzy: try replacing hyphens/spaces with underscores
    const underscored = normalized.replace(/[\s-]+/g, '_');
    if (underscored !== normalized) {
      const alias = TEST_LABWARE_ALIAS_MAP[underscored];
      if (alias) {
        return [{ recordId: alias, title: alias }];
      }
    }

    // Substring match: check if any alias key contains the normalized hint
    // or if the normalized hint contains part of the alias key
    for (const [key, recordId] of Object.entries(TEST_LABWARE_ALIAS_MAP)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return [{ recordId, title: recordId }];
      }
    }

    // Token-based fuzzy match: split both into tokens and check overlap
    const hintTokens = new Set(normalized.split(/[\s_\-]+/).filter(Boolean));
    for (const [key, recordId] of Object.entries(TEST_LABWARE_ALIAS_MAP)) {
      const keyTokens = new Set(key.split(/[\s_\-]+/).filter(Boolean));
      let overlap = 0;
      for (const t of hintTokens) if (keyTokens.has(t)) overlap++;
      // Require at least 2 overlapping tokens and >50% of hint tokens matched
      if (overlap >= 2 && hintTokens.size > 0 && overlap / hintTokens.size >= 0.5) {
        return [{ recordId, title: recordId }];
      }
    }

    // Aggressive fuzzy: for concatenated tokens like "96well", try splitting
    // them into sub-tokens and matching against key tokens
    for (const [key, recordId] of Object.entries(TEST_LABWARE_ALIAS_MAP)) {
      const keyTokens = new Set(key.split(/[\s_\-]+/).filter(Boolean));
      const hintTokensRaw = normalized.split(/[\s_\-]+/).filter(Boolean);
      let totalOverlap = 0;
      for (const ht of hintTokensRaw) {
        // Check if any key token is contained in the hint token or vice versa
        for (const kt of keyTokens) {
          if (ht.includes(kt) || kt.includes(ht)) {
            totalOverlap++;
            break;
          }
        }
      }
      if (totalOverlap >= 2 && hintTokensRaw.length > 0 && totalOverlap / hintTokensRaw.length >= 0.5) {
        return [{ recordId, title: recordId }];
      }
    }

    return [];
  };
}

// ---------------------------------------------------------------------------
// buildMockLlmClient — create an LlmClient that returns the pinned output
// ---------------------------------------------------------------------------

function buildMockLlmClient(mockedOutput: AiPrecompileOutput): LlmClient {
  return {
    complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
      const content = JSON.stringify(mockedOutput);
      return {
        id: 'fixture-mock',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// runFixture — execute a fixture with mocked LLM
// ---------------------------------------------------------------------------

export async function runFixture(
  fixture: Fixture,
  opts?: {
    deps?: Partial<RunChatbotCompileArgs['deps']>;
    conversationId?: string;
  },
): Promise<FixtureResult> {
  // Deterministic-only fixtures don't have a mocked LLM output — the
  // deterministic precompile is the unit under test, so the LLM is fully
  // bypassed. The fixture validator already enforces that mocked_ai_precompile_output
  // is present for non-deterministic fixtures.
  const deterministicOnly = fixture.deterministicOnly === true;
  const llmClient: LlmClient | null = opts?.deps?.llmClient
    ?? (deterministicOnly
      ? null
      : buildMockLlmClient(fixture.mocked_ai_precompile_output!));

  const attachments = fixture.input.attachments?.map((a) => ({
    name: a.filename,
    mime_type: a.mimeType,
    content: a.content,
  }));
  const conversationId = opts?.conversationId ?? fixture.input.conversationId;

  const args: RunChatbotCompileArgs = {
    prompt: fixture.input.prompt,
    ...(attachments ? { attachments } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(deterministicOnly ? { deterministicOnly: true } : {}),
    deps: {
      extractionService: buildTestExtractionService(),
      llmClient,
      searchLabwareByHint: opts?.deps?.searchLabwareByHint ?? buildTestSearchLabwareByHint(),
      ...(opts?.deps?.labStateCache ? { labStateCache: opts.deps.labStateCache } : {}),
    },
  };

  const result: RunChatbotCompileResult = await runChatbotCompile(args);

  return {
    outcome: result.outcome,
    terminalArtifacts: result.terminalArtifacts,
    raw: result,
  };
}
