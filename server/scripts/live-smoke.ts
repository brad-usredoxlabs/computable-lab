#!/usr/bin/env tsx
/**
 * live-smoke.ts — the ONE live smoke (spec §6). Manual/orch-only; NEVER CI,
 * never vitest-collected (lives under server/scripts/, outside src/), never
 * curls the running stack. Drives the REAL handler in-process with the REAL
 * inference client — the same construction path the production handler uses
 * (active-profile resolution via resolveAiProfile), exactly like the tests do
 * with a stub. ONE prompt, ONE model interaction chain (the route's own
 * retries are the route's).
 *
 * The model is NAMED AT RUN TIME from the lane config's active profile — no
 * model/profile name literal appears in this file. If no active profile
 * resolves, the script reports that and exits non-zero (it could not run).
 *
 * Exit code (orch ruling OQ4(a)): 0 whenever a call COMPLETED — success,
 * clarification, and malformed output all produce artifacts; the artifact's
 * classification line carries the verdict. This script is evidence, not a
 * gate. Classification comes from replayKernel's shared classifyCompileResponse
 * so replay and live cannot disagree (bait §11.11).
 *
 * Artifact (untracked): server/.artifacts/live-smoke/<UTC-timestamp>/
 *   artifact.json  — profile name + model + baseUrl host (NO key material),
 *                    prompt, HTTP outcome (status + body keys), classification
 *   raw-output.json — the model's RAW scientist-intent emission(s) verbatim
 *
 * Run: cd <wt>/server && npx tsx scripts/live-smoke.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntentCompileFromPromptHandlers } from '../src/api/handlers/IntentCompileFromPromptHandlers.js';
import { createInferenceClient } from '../src/ai/InferenceClient.js';
import { resolveAiProfile } from '../src/config/types.js';
import { initializeApp } from '../src/server.js';
import { classifyCompileResponse } from '../src/compiler/scientistIntent/goldens/replayKernel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');

// OQ5(a): the transfer+read happy-path scenario as FREE TEXT (same scenario
// as golden 1, no fixture-body copy — replay and live stay independent).
const PROMPT = [
  'A scientist protocol in plain words:',
  'Take 50 microliters out of the source plate and move it into the destination plate.',
  'After the transfer, read the source plate on the plate reader at 450 nm absorbance.',
].join('\n');

interface RawCall {
  requestModel?: string;
  toolCalls: Array<{ name: string; arguments: string }>;
  content: string | null;
}

async function main(): Promise<number> {
  // Boot the REAL app context (real store — the live leg's inventory comes
  // from the real lab records, which is the point of the live leg).
  const ctx = await initializeApp(SERVER_DIR);
  const ai = ctx.appConfig?.ai;
  const activeProfileName = ai?.activeProfile;
  const profile = activeProfileName ? ai?.profiles?.[activeProfileName] : undefined;
  if (!activeProfileName || !profile?.inference?.baseUrl || !profile?.inference?.model) {
    console.log('live-smoke: NO active profile resolves in the lane config — cannot run (spec §1(e)).');
    return 1;
  }

  // Same construction path as the production handler's default client
  // (active-profile inference config; the handler's fixed call settings).
  const realClient = createInferenceClient({
    provider: 'openai-compatible',
    baseUrl: profile.inference.baseUrl,
    model: profile.inference.model,
    ...(profile.inference.apiKey !== undefined ? { apiKey: profile.inference.apiKey } : {}),
    ...(profile.inference.maxTokens !== undefined ? { maxTokens: profile.inference.maxTokens } : {}),
    ...(profile.inference.streamIdleTimeoutMs !== undefined ? { streamIdleTimeoutMs: profile.inference.streamIdleTimeoutMs } : {}),
    enableThinking: false,
    temperature: 0,
  });

  // Recording wrapper: forwards to the REAL client, retains the RAW emission.
  const rawCalls: RawCall[] = [];
  const recordingClient = {
    complete: async (req: Parameters<typeof realClient.complete>[0]) => {
      const response = await realClient.complete(req);
      const message = response?.choices?.[0]?.message;
      rawCalls.push({
        requestModel: typeof (req as { model?: string }).model === 'string' ? (req as { model?: string }).model : undefined,
        toolCalls: (message?.tool_calls ?? []).map((tc) => ({ name: tc.function.name, arguments: tc.function.arguments })),
        content: typeof message?.content === 'string' ? message.content : null,
      });
      return response;
    },
  };

  const handlers = createIntentCompileFromPromptHandlers(ctx, { llmClient: recordingClient as never });

  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const reply = {
    status(code: number) { currentStatus = code; return reply; },
    send(payload: unknown) { calls.push({ status: currentStatus, payload }); return reply; },
  };

  await handlers.compileFromPrompt(
    { body: { protocolText: PROMPT, answers: { sample_type: 'bacterial' } }, log: { error: () => {} } } as never,
    reply as never,
  );

  if (calls.length === 0) {
    console.log('live-smoke: handler produced no reply — could not complete a call.');
    return 1;
  }

  const call = calls[0]!;
  const status = call.status ?? 200;
  const payload = (call.payload ?? {}) as Record<string, unknown>;
  const verdict = classifyCompileResponse(status, payload);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = join(SERVER_DIR, '.artifacts', 'live-smoke', stamp);
  mkdirSync(artifactDir, { recursive: true });

  const artifact = {
    runAt: new Date().toISOString(),
    profile: activeProfileName,
    model: profile.inference.model,
    baseUrlHost: new URL(profile.inference.baseUrl).host,
    prompt: PROMPT,
    modelInteractionChain: 'one handler call (the route\'s own retries are the route\'s)',
    httpStatus: status,
    responseBodyKeys: Object.keys(payload).sort(),
    outcome: payload['outcome'] ?? null,
    error: payload['error'] ?? null,
    classification: verdict,
    note: 'Evidence, not a gate (OQ4(a)): exit 0 on any completed call. Malformed model output = EXTRACTION_FAILURE; clarification = NOT_SUCCESS_CLARIFICATION. No tier/family/size claims anywhere.',
  };
  writeFileSync(join(artifactDir, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(join(artifactDir, 'raw-output.json'), `${JSON.stringify(rawCalls, null, 2)}\n`);

  console.log(JSON.stringify(artifact, null, 2));
  console.log(`RAW scientist-intent emission(s): ${JSON.stringify(rawCalls)}`);
  console.log(`ARTIFACT DIR: ${artifactDir}`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`live-smoke: could not run: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
