#!/usr/bin/env node
/**
 * FAME-8 GATEFIX3 D1 (closes the GATEFIX2 review defects) — mint the SECOND
 * contested-claim successor revision and replay ANR-000068's exact inputs +
 * parameters against it (lane :3092). Supersedes the GATEFIX2 successor
 * ANREV-000021 (unchanged, immutable — its entryScript predates the GATEFIX3
 * contract change, so the entryScript must be re-minted to stay byte-identical
 * to the tracked file).
 *
 * What this script does (tracked, replayable artifact — no product-code change):
 *   1. Reads the successor entryScript (assignment-contested-entry.py) from disk.
 *   2. Fetches the SOURCE revision ANREV-000016 at runtime and COPIES its
 *      engineRef / inputs / parameterSchema / requiredCapabilities / sdkVersion /
 *      methodNotes into the new revision (never hardcoded id-bearing fields; the
 *      only parent ref is ANREV-000016).
 *   3. POST /api/analysis-revisions (x-user-id: USR-BRAD) -> new revision id.
 *   4. DEFENSIVE NO-OP, stated plainly (GATEFIX3 Defect 1 honesty fix): the
 *      GATEFIX2 version carried a draft->active "transition step" that COULD
 *      NEVER be entered and whose catch was fail-open (it would have swallowed
 *      the server's schema refusal and proceeded). analysis-revision declares
 *      NO payload `state` — schema/knowledge/analysis-revision.schema.yaml:12
 *      unevaluatedProperties:false, no state property; not in
 *      registry-kinds.registry.yaml `kinds:`; the execute path gates ONLY the
 *      engine (analysisRunner.ts), never a revision state — so a revision of
 *      this kind as-created has NO state, and `payload.state === 'draft'` is
 *      false BY CONSTRUCTION for this kind. There is no draft->active
 *      transition to perform: this branch reads state, reports it, and if it
 *      ever somehow were 'draft' it REFUSES to proceed (fail-closed) instead
 *      of hand-forging a schema-invalid PUT or swallowing a refusal.
 *   5. Fetches ANR-000068 at runtime and POST /api/analysis-runs against the NEW
 *      revision with inputs + parameters COPIED VERBATIM from its payload
 *      (parameters.assignments carries BOTH claims — entry 0 verified + entry 1
 *      CHEBI:143577 provisional, same RT window).
 *   6. POST /api/analysis-runs/:id/execute, polls to terminal status.
 *   7. Prints the new revisionId, runId, and every produced artifact id.
 *
 * Fail CLOSED: any non-2xx throws with the exact status + body (the receipt
 * carries the precise server refusal — a product gap = BLOCKED with this
 * evidence, never a swallowed failure).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const BACKEND = process.env.CL_BACKEND || 'http://localhost:3092';
const USER = process.env.CL_USER || 'USR-BRAD';
const SOURCE_REVISION_ID = 'ANREV-000016';
const SOURCE_RUN_ID = 'ANR-000068';
const NEW_TITLE =
  'FAME-8 gatefix — contested-claim visibility in assignment_results + enforced 3-field flag contract (successor of ANREV-000016; supersedes ANREV-000021)';
const NEW_RUN_TITLE =
  'FAME-8 GATEFIX3 D1 replay of ANR-000068 (contested-claim visibility, enforced flag contract) — verbatim inputs + parameters on the GATEFIX3 successor revision';
const POLL_MS = 1500;
const POLL_MAX_MS = 120000;

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

async function apiCall(pathname, opts = {}) {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers = { 'x-user-id': USER };
  let bodyText;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    bodyText = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BACKEND}${pathname}`, { method, headers, body: bodyText });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${method} ${pathname} -> HTTP ${res.status}: ${JSON.stringify(json ?? null)}`);
  }
  return { status: res.status, json, text };
}

function recordOf(json) {
  const r = json && typeof json === 'object' ? json.record : undefined;
  return r && typeof r === 'object' ? r : json;
}

function payloadOf(json) {
  const rec = recordOf(json);
  return rec && typeof rec === 'object' && rec.payload ? rec.payload : rec;
}

async function main() {
  // (1) successor entryScript from disk
  const entryScriptPath = path.join(here, 'assignment-contested-entry.py');
  const entryScript = fs.readFileSync(entryScriptPath, 'utf-8');
  log(`entryScript loaded from ${entryScriptPath} (${entryScript.length} chars, CONTESTED_CLAIM x${entryScript.split('CONTESTED_CLAIM').length - 1})`);

  // (2) source revision at runtime — copy the id-bearing fields
  const srcJson = (await apiCall(`/api/records/${SOURCE_REVISION_ID}`)).json;
  const src = payloadOf(srcJson);
  if (src.id !== SOURCE_REVISION_ID) throw new Error(`source revision payload.id mismatch: ${src.id}`);
  const revisionBody = {
    title: NEW_TITLE,
    description:
      'FAME-8 GATEFIX3 D1 (closes the GATEFIX2 adversarial-review defects; supersedes ANREV-000021): successor to ANREV-000016. ' +
      'The entryScript is ANREV-000016 verbatim EXCEPT: at the declared-order ' +
      'TARGET_WINDOW_OVERLAP claimant point, the losing claim is appended to the ' +
      'WINNER row\'s flags as a machine-readable CONTESTED_CLAIM:<label>|<compound_ref ' +
      'id>|<assignment_state> flag (pipe-separated, one per losing claim), and the ' +
      '3-field pipe contract is ENFORCED at the emission point (GATEFIX3 Defect 2): ' +
      'a losing claim whose label / compound_ref id / assignment_state contains \'|\' ' +
      'rejects the run with CODE_PARAM_INVALID naming the offending entry + field ' +
      '(no silent escape or mutation); the contract is also declared in the ' +
      'artifact\'s flags column definition. Winner attribution, areas, percents, ' +
      'buckets, eligibility and every numeric output are UNCHANGED; the ' +
      'TARGET_WINDOW_OVERLAP log is kept. No product-code change — this is a ' +
      'data/record change to the entryScript.',
    parentRevisionRef: {
      kind: 'record',
      id: SOURCE_REVISION_ID,
      type: 'analysis-revision',
      label: 'ANREV-000016 (FAME-4 area-% over the declared eligible set — superseded by this contested-claim-visibility successor)',
    },
    entryScript,
    sdkVersion: src.sdkVersion,
    methodNotes: src.methodNotes,
    inputs: src.inputs,
    parameterSchema: src.parameterSchema,
    engineRef: src.engineRef,
    ...(src.requiredCapabilities ? { requiredCapabilities: src.requiredCapabilities } : {}),
  };

  // (3) mint the successor revision
  const created = (await apiCall('/api/analysis-revisions', { method: 'POST', body: revisionBody })).json;
  const recordId =
    (created && typeof created.recordId === 'string' && created.recordId) ||
    (recordOf(created) && typeof recordOf(created).recordId === 'string' && recordOf(created).recordId);
  if (!recordId) throw new Error(`POST /api/analysis-revisions did not return a recordId: ${JSON.stringify(created)}`);
  log(`MINTED revision ${recordId}`);

  // (4) DEFENSIVE NO-OP — stated plainly, fail-closed (GATEFIX3 Defect 1).
  // analysis-revision declares NO payload `state` (schema/knowledge/
  // analysis-revision.schema.yaml:12 unevaluatedProperties:false; not in
  // registry-kinds.registry.yaml kinds; the execute path gates only the
  // engine), so `before.state === 'draft'` is false BY CONSTRUCTION for this
  // kind and no draft->active transition exists to perform. The GATEFIX2
  // version's try/catch here was fail-open (a hypothetical PUT of a
  // schema-invalid payload would have been swallowed and the script
  // proceeded). GATEFIX3: the branch is a defensive no-op — if the kind ever
  // DID carry state=draft, we throw (fail-closed) rather than PUT or
  // hand-forge anything.
  const before = payloadOf((await apiCall(`/api/records/${recordId}`)).json);
  const asCreatedState = before.state === undefined ? null : before.state;
  const asCreatedLifecycleId = before.lifecycleId === undefined ? null : before.lifecycleId;
  log(`new revision state as-created: ${JSON.stringify(asCreatedState)} lifecycleId=${JSON.stringify(asCreatedLifecycleId)}`);
  let transitioned = false;
  let transitionNote = '';
  if (before.state === 'draft') {
    throw new Error(
      `unexpected: analysis-revision ${recordId} as-created payload.state === 'draft' — this kind declares no payload state (schema/knowledge/analysis-revision.schema.yaml:12); refusing to transition/hand-forge (fail-closed)`,
    );
  } else {
    transitionNote = `no transition exists to perform: the transition arm was NOT entered (payload state as-created = ${JSON.stringify(asCreatedState)} — absent, because analysis-revision declares no payload 'state' (schema/knowledge/analysis-revision.schema.yaml:12 unevaluatedProperties:false, no state property; kind not in registry-kinds.registry.yaml kinds; the execute path gates only the engine, never a revision state)). The GATEFIX2 'transition step' was a defensive no-op that could never be entered for this kind; no PUT was sent and none is required — no hand-forged records, no schema-invalid payload`;
  }
  log(`transition: ${transitionNote}`);

  // (5) source run at runtime — verbatim inputs + parameters
  const runSrc = payloadOf((await apiCall(`/api/records/${SOURCE_RUN_ID}`)).json);
  if (runSrc.id !== SOURCE_RUN_ID) throw new Error(`source run payload.id mismatch: ${runSrc.id}`);
  const runBody = {
    title: NEW_RUN_TITLE,
    revisionRef: { kind: 'record', id: recordId, type: 'analysis-revision' },
    inputs: runSrc.inputs,
    parameters: runSrc.parameters,
  };
  const runCreated = (await apiCall('/api/analysis-runs', { method: 'POST', body: runBody })).json;
  const runId =
    (runCreated && typeof runCreated.recordId === 'string' && runCreated.recordId) ||
    (recordOf(runCreated) && typeof recordOf(runCreated).recordId === 'string' && recordOf(runCreated).recordId);
  if (!runId) throw new Error(`POST /api/analysis-runs did not return a recordId: ${JSON.stringify(runCreated)}`);
  log(`MINTED run ${runId} (revisionRef ${recordId})`);

  // (6) execute + poll to terminal
  const exec = (await apiCall(`/api/analysis-runs/${runId}/execute`, { method: 'POST', body: {} })).json;
  log(`execute response status: ${JSON.stringify(exec && exec.status)}`);
  const start = Date.now();
  let runPayload = payloadOf((await apiCall(`/api/records/${runId}`)).json);
  let status = runPayload.status;
  while (!['succeeded', 'failed', 'cancelled'].includes(status)) {
    if (Date.now() - start > POLL_MAX_MS) throw new Error(`run ${runId} still ${status} after ${POLL_MAX_MS}ms`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    runPayload = payloadOf((await apiCall(`/api/records/${runId}`)).json);
    status = runPayload.status;
    log(`poll: run ${runId} status=${status}`);
  }
  if (status !== 'succeeded') {
    const err = runPayload.error ?? runPayload.errorMessage ?? runPayload.outputManifest ?? null;
    throw new Error(`run ${runId} terminal status=${status}: ${JSON.stringify(err)}`);
  }
  log(`run ${runId} SUCCEEDED`);

  // (7) artifacts
  const manifest = runPayload.outputManifest;
  const artifactRefs = (runPayload.outputArtifactRefs ?? []).map((r) => r.id);
  const manifestNames = Object.keys((manifest && manifest.artifactRefs) || {});
  log(`artifacts (outputArtifactRefs): ${artifactRefs.join(', ')}`);
  log(`artifacts (outputManifest.artifactRefs): ${manifestNames.join(', ')}`);
  const arName = 'assignment_results';
  const arRef = (manifest && manifest.artifactRefs && manifest.artifactRefs[arName]) || null;
  log(`assignment_results artifact: ${arRef ? arRef.artifactRecordId : '(not found in manifest.artifactRefs)'}`);

  console.log('---RESULT---');
  console.log(JSON.stringify({
    revisionId: recordId,
    transitioned,
    transitionNote,
    runId,
    status,
    artifactIds: artifactRefs,
    assignment_results: arRef && arRef.artifactRecordId,
  }, null, 2));
}

main().catch((e) => {
  console.error('FAME-8-GATEFIX3 BLOCKED ' + e.message);
  process.exit(1);
});
