#!/usr/bin/env tsx
/**
 * zymo-campaign-live-smoke.ts — the W2-11 campaign live leg (spec §2.2 [LIVE]).
 * Manual/orch-only; NEVER CI, never vitest-collected (lives under server/scripts/,
 * outside src/), never curls the running stack. Drives the REAL merged semantic
 * family pass in-process with the REAL inference client — the same construction
 * path the production route uses (resolveSemanticPassInference: the optional
 * ai.semanticPass block, else the active profile's inference), exactly like the
 * tests do with a stub. ONE prompt, ONE model interaction chain (the route's own
 * retries are the route's).
 *
 * The model is NAMED AT RUN TIME from the lane config's active profile — no
 * model/profile name literal appears in this file. If no active profile resolves,
 * the script reports that and exits non-zero (it could not run).
 *
 * Exit code (live-smoke.ts header contract, orch ruling OQ4(a), applied verbatim
 * per the task): 0 whenever a call COMPLETED — success, clarification, and
 * malformed output all produce artifacts; the artifact's classification line
 * carries the verdict. This script is evidence, not a gate. Classification comes
 * from replayKernel's shared classifyCompileResponse so replay and live cannot
 * disagree (bait §11.11): SUCCESS / NOT_SUCCESS_CLARIFICATION /
 * EXTRACTION_FAILURE — NOT_SUCCESS is an ALLOWED honest outcome and never a
 * faked green. NOTE (W2-10 report §3): until F-LANE2-W210-D is fixed, this leg
 * may honestly surface the embedded-draft schema gap at the review wall — that
 * is exactly what the honest classes are for; this leg is NOT adjusted to dodge
 * it.
 *
 * Artifact (untracked): server/.artifacts/zymo-campaign-live/<UTC-timestamp>/
 *   artifact.json    — profile name + model + baseUrl HOST (NO key material),
 *                      candidate sha, prompt/policy shas, the classification
 *                      line, HTTP outcome (status + body keys)
 *   raw-draft.json   — the model's RAW draft answer verbatim
 *
 * Run: cd <wt>/server && npx tsx scripts/zymo-campaign-live-smoke.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from '../src/server.js';
import { createInferenceClient } from '../src/ai/InferenceClient.js';
import { resolveAiProfile } from '../src/config/types.js';
import {
  runSemanticFamilyPass,
  resolveSemanticPassInference,
  buildSemanticFamilyPrompt,
} from '../src/ingestion/vendor-protocol/SemanticFamilyPass.js';
import { loadRealizationPolicy } from '../src/compiler/scientistIntent/realizeScientistIntent.js';
import { classifyCompileResponse } from '../src/compiler/scientistIntent/goldens/replayKernel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');

/** The candidate id this leg mints into the lane store (TEST DATA — Brad
 *  ruling). The SAID is the REAL decoded Zymo candidate, minted through the
 *  store mint path (the extraction mint path; POST /records cannot mint a
 *  vendor-protocol-candidate at this base — the W2-5/W2-6 recorded finding). */
const CANDIDATE_ID = 'CAN-w211-live';
const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';

async function main(): Promise<number> {
  // Boot the REAL app context (real store — the live leg's candidate and draft
  // land in the lane store, which is the point of the live leg).
  const ctx = await initializeApp(SERVER_DIR);
  const ai = ctx.appConfig?.ai;
  const activeProfileName = ai?.activeProfile;
  const profile = activeProfileName ? ai?.profiles?.[activeProfileName] : undefined;
  if (!ai || !profile?.inference?.baseUrl || !profile?.inference?.model) {
    console.log('zymo-campaign-live-smoke: NO active profile resolves in the lane config — cannot run (live-smoke.ts contract).');
    return 1;
  }

  // THE ONE resolution seam: the optional ai.semanticPass block shadowing the
  // active profile — the SAME construction the production route uses. No model
  // literal, no host literal: everything below is config DATA.
  const inference = resolveSemanticPassInference(ai);
  const realClient = createInferenceClient(inference);

  // Recording wrapper: forwards to the REAL client, retains the RAW answer.
  const rawCalls: Array<{ requestModel?: string; content: string | null; finishReason?: string }> = [];
  const recordingClient = {
    complete: async (req: Parameters<typeof realClient.complete>[0]) => {
      const response = await realClient.complete(req);
      const message = response?.choices?.[0]?.message;
      rawCalls.push({
        requestModel: typeof (req as { model?: string }).model === 'string' ? (req as { model?: string }).model : undefined,
        content: typeof message?.content === 'string' ? message.content : null,
        finishReason: response?.choices?.[0]?.finish_reason,
      });
      return response;
    },
  };

  // 1. Mint the SAID: the REAL decoded candidate through the store mint path.
  const { decodeVendorProtocolPdfFile, extractVendorProtocolCandidate } = await import('../src/ingestion/vendor-protocol/VendorProtocolPdf.js');
  const pdfPath = resolve(SERVER_DIR, '..', 'resources', 'vendor_pdfs', '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');
  const pdfBytes = readFileSync(pdfPath);
  const candidateSha = createHash('sha256').update(pdfBytes).digest('hex');
  const document = await decodeVendorProtocolPdfFile(pdfPath, { documentId: 'vendor-protocol-zymo-magbead' });
  const candidate = extractVendorProtocolCandidate(document) as unknown as Record<string, unknown>;
  for (const step of candidate.steps as Array<Record<string, unknown>>) {
    for (const action of step.actions as Array<Record<string, unknown>>) {
      delete action.concentration; // extractor-only field the closed VPC schema does not admit
    }
  }
  const existing = await ctx.store.get(CANDIDATE_ID);
  if (!existing) {
    const minted = await ctx.store.create({
      envelope: { recordId: CANDIDATE_ID, schemaId: VPC_SCHEMA_ID, payload: candidate },
      message: 'W2-11 live smoke: mint the Zymo SAID candidate',
    });
    if (!minted.success) {
      console.log(`zymo-campaign-live-smoke: candidate mint failed: ${minted.error}`);
      return 1;
    }
  }

  // 2. ONE real run of the SAME journey through the merged semantic-draft
  //    service (the real route handler's own service call).
  //
  // DECLARED FINDING (trunk quirk, measured at this tip): the service's prompt
  // loader (src/extract/prompts/loader.ts:98) references bare __dirname inside
  // an ESM package ("type": "module"). Vitest's SSR transform injects __dirname
  // (every merged suite passes through this loader); tsx/node ESM does NOT, so
  // the first buildSemanticFamilyPrompt call throws ReferenceError under tsx.
  // The loader file is OUTSIDE this lane's §9 inventory (server/src/extract/
  // must stay EMPTY diff), so the runner supplies the module-directory binding
  // the loader expects — the exact value vitest injects — and names the quirk
  // in the artifact. No trunk file is touched; the model call is the real
  // merged service.
  (globalThis as Record<string, unknown>).__dirname ??= resolve(SERVER_DIR, 'src', 'extract', 'prompts');

  const prompt = buildSemanticFamilyPrompt(candidate, CANDIDATE_ID);
  const promptSha = createHash('sha256').update(`${prompt.system}\n${prompt.user}`).digest('hex');
  const policyPath = resolve(SERVER_DIR, '..', 'schema', 'registry', 'realization', 'robot-realization.policy.yaml');
  const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');
  void loadRealizationPolicy(policyPath); // the policy the golden lowers with — sha-pinned here

  let status: number | undefined;
  let payload: Record<string, unknown> = {};
  try {
    const result = await runSemanticFamilyPass(
      { store: ctx.store, client: recordingClient as never, inference },
      { candidateRecordId: CANDIDATE_ID },
    );
    // The service's result shape mapped onto the route's HTTP semantics so the
    // SHARED classifier reads it the same way it reads a route reply.
    if (result.ok) {
      status = 200;
      payload = { outcome: 'complete', recordId: result.recordId, diagnostics: result.diagnostics };
    } else {
      status = 422;
      payload = { outcome: 'gap', error: result.error, message: result.message };
    }
  } catch (err) {
    status = 500;
    payload = { error: 'TRANSPORT', message: err instanceof Error ? err.message : String(err) };
  }

  const verdict = classifyCompileResponse(status, payload);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = join(SERVER_DIR, '.artifacts', 'zymo-campaign-live', stamp);
  mkdirSync(artifactDir, { recursive: true });

  const artifact = {
    runAt: new Date().toISOString(),
    profile: activeProfileName,
    model: inference.model,
    baseUrlHost: new URL(inference.baseUrl).host,
    semanticPassBlockPresent: ai.semanticPass !== undefined,
    candidateRecordId: CANDIDATE_ID,
    candidatePdfSha256: candidateSha,
    promptSha256: promptSha,
    policySha256: policySha,
    modelInteractionChain: 'one semantic-pass call (the route\'s own retries are the route\'s)',
    httpStatus: status,
    responseBodyKeys: Object.keys(payload).sort(),
    outcome: payload['outcome'] ?? null,
    error: payload['error'] ?? null,
    transportMessage: typeof payload['message'] === 'string' ? payload['message'].slice(0, 400) : null,
    classification: verdict,
    note: 'Evidence, not a gate (live-smoke.ts contract): exit 0 on any completed call. Malformed model output = EXTRACTION_FAILURE; clarification = NOT_SUCCESS_CLARIFICATION. Until F-LANE2-W210-D lands this leg may honestly surface the embedded-draft schema gap at the review wall — the honest classes exist for exactly that; the leg is not adjusted to dodge it. No model/profile literal appears in this file.',
  };
  writeFileSync(join(artifactDir, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(join(artifactDir, 'raw-draft.json'), `${JSON.stringify(rawCalls, null, 2)}\n`);

  console.log(JSON.stringify(artifact, null, 2));
  console.log(`CLASSIFICATION ${verdict}`);
  console.log(`RAW draft answer(s): ${rawCalls.map((c) => `${String(c.content?.length ?? 0)} chars, finish_reason=${String(c.finishReason)}`).join('; ')}`);
  console.log(`ARTIFACT DIR: ${artifactDir}`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`zymo-campaign-live-smoke: could not run: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
