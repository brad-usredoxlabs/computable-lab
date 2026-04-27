/**
 * LabContextResolvePass — resolves lab context from smart defaults and
 * optional LLM-driven directive overrides.
 *
 * Sources of lab context (in priority order):
 * 1. Manual user input (manualLabContextOverrides from session) — highest precedence
 * 2. LLM directive override (when directiveText is non-empty)
 * 3. Smart defaults (96-well-plate, 1 plate, 96 samples, no equipment overrides)
 *
 * Precedence: manual > directive > default
 *
 * The LLM call is intentionally narrow: it returns ONLY override fields,
 * not full context. This makes it cheap, structured, and easy to validate.
 */

import { z } from 'zod';
import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabContext {
  labwareKind: string;
  plateCount: number;
  sampleCount: number;
  equipmentOverrides: Array<{ role: string; equipmentId: string }>;
}

export interface CreateLabContextResolvePassDeps {
  llmClient: {
    complete: (args: { prompt: string; maxTokens?: number }) => Promise<string>;
  };
  defaults?: Partial<LabContext>; // override defaults for testing
  /** Manual overrides from session (highest precedence: manual > directive > default) */
  manualOverrides?: Partial<LabContext>;
}

// ---------------------------------------------------------------------------
// Constants & Schema
// ---------------------------------------------------------------------------

const SMART_DEFAULTS: LabContext = {
  labwareKind: '96-well-plate',
  plateCount: 1,
  sampleCount: 96,
  equipmentOverrides: [],
};

const OverrideSchema = z.object({
  labwareKind: z.string().optional(),
  plateCount: z.number().int().positive().optional(),
  sampleCount: z.number().int().positive().optional(),
  equipmentOverrides: z
    .array(
      z.object({
        role: z.string(),
        equipmentId: z.string(),
      }),
    )
    .optional(),
});

const MAX_RAW_RESPONSE_LOG = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from a raw LLM response.
 * Handles markdown fences (```json ... ```) and surrounding prose.
 * Returns null on failure.
 */
function extractJson(raw: string): unknown | null {
  // Try markdown fence first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Find first { and last }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Build the override-only prompt for the LLM.
 */
function buildOverridePrompt(
  defaults: LabContext,
  directiveText: string,
): string {
  const defaultsStr = JSON.stringify({
    labwareKind: defaults.labwareKind,
    plateCount: defaults.plateCount,
    sampleCount: defaults.sampleCount,
  });

  return [
    'You are a lab-protocol intent extractor. Given:',
    `- Current default lab context: ${defaultsStr}`,
    `- User directive: "${directiveText}"`,
    '',
    'Return a JSON object with ONLY the fields the user wants to change.',
    'Omit fields they did not mention. Valid keys: labwareKind, plateCount, sampleCount, equipmentOverrides.',
    'Return ONLY the JSON, no prose.',
    '',
    'Example:',
    '- "adapt for 384-well plates" → {"labwareKind": "384-well-plate"}',
    '- "use 4 plates with 96 samples each" → {"plateCount": 4, "sampleCount": 96}',
    '- "no changes" → {}',
  ].join('\n');
}

/**
 * Merge override fields onto defaults.
 */
function mergeOverrides(
  defaults: LabContext,
  overrides: z.infer<typeof OverrideSchema>,
): LabContext {
  return {
    labwareKind: overrides.labwareKind ?? defaults.labwareKind,
    plateCount: overrides.plateCount ?? defaults.plateCount,
    sampleCount: overrides.sampleCount ?? defaults.sampleCount,
    equipmentOverrides:
      overrides.equipmentOverrides ?? defaults.equipmentOverrides,
  };
}

/**
 * Truncate a string to maxChars for logging.
 */
function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '...';
}

// ---------------------------------------------------------------------------
// Pass factory
// ---------------------------------------------------------------------------

export function createLabContextResolvePass(
  deps: CreateLabContextResolvePassDeps,
): Pass {
  const defaults: LabContext = {
    ...SMART_DEFAULTS,
    ...(deps.defaults ?? {}),
  };

  // Apply manual overrides on top of defaults (manual > default)
  const manualBase: LabContext = {
    labwareKind: deps.manualOverrides?.labwareKind ?? defaults.labwareKind,
    plateCount: deps.manualOverrides?.plateCount ?? defaults.plateCount,
    sampleCount: deps.manualOverrides?.sampleCount ?? defaults.sampleCount,
    equipmentOverrides:
      deps.manualOverrides?.equipmentOverrides ?? defaults.equipmentOverrides,
  };

  return {
    id: 'lab_context_resolve',
    family: 'normalize',
    async run(args: PassRunArgs): Promise<PassResult> {
      const directiveText = (
        args.state.input['directiveText'] as string | undefined
      )?.trim();

      // Empty directive → return manual overrides (or defaults if none) immediately
      if (!directiveText) {
        return {
          ok: true,
          output: { labContext: manualBase },
          diagnostics: [],
        };
      }

      const prompt = buildOverridePrompt(manualBase, directiveText);

      // First attempt
      let rawResponse = await deps.llmClient.complete({
        prompt,
        maxTokens: 500,
      });
      let parsed = OverrideSchema.safeParse(extractJson(rawResponse));

      // Retry once on validation failure
      if (!parsed.success) {
        const retryPrompt =
          prompt +
          '\n\nYour previous response failed validation: ' +
          parsed.error.message +
          '\nReturn valid JSON matching the schema.';

        rawResponse = await deps.llmClient.complete({
          prompt: retryPrompt,
          maxTokens: 500,
        });
        parsed = OverrideSchema.safeParse(extractJson(rawResponse));
      }

      // Both attempts failed → fall through to manual base with warning
      if (!parsed.success) {
        // Log raw response under [lab_context_resolve_shape_mismatch] prefix
        console.log(
          `[lab_context_resolve_shape_mismatch] raw response: ${truncate(rawResponse, MAX_RAW_RESPONSE_LOG)}`,
        );

        return {
          ok: true,
          output: { labContext: manualBase },
          diagnostics: [
            {
              severity: 'warning',
              code: 'lab_context_resolve_llm_failed',
              message:
                'LLM override extraction failed twice; using manual overrides (or smart defaults)',
              pass_id: 'lab_context_resolve',
            },
          ],
        };
      }

      // Merge directive overrides onto defaults first, then apply manual on top
      // to enforce manual > directive > default precedence
      const directiveResult = mergeOverrides(defaults, parsed.data);
      const resolved = mergeOverrides(directiveResult, deps.manualOverrides ?? {});
      return {
        ok: true,
        output: { labContext: resolved },
        diagnostics: [],
      };
    },
  };
}
