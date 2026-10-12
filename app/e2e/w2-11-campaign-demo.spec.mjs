/**
 * W2-11 ZYMO CAMPAIGN DEMO — CHECKED-IN GATE SPEC (spec §4, legs D1-D6).
 *
 * Runs ONLY against a stack the orchestrator started (never started by the
 * coder): BASE_URL (app, default http://localhost:5193) + API_URL (server,
 * default http://localhost:3093, health at /api/health) — gate-pbch6 /
 * w28-said-meant-surface / w29-review-ai-panel precedent. Receipts
 * (screenshots + pasted GET bodies) land under receipts/.
 *
 * RUN FORM (documented, orchestrator-run):
 *   cd app && npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium
 *
 * Vitest posture: like every app/e2e/*.spec.* gate file, this .mjs is collected
 * by vitest with NO runnable tests (Playwright's test() is not a vitest suite)
 * and runs only under `npx playwright test`. It lives under e2e/, never src/.
 * Fixture loads are LAZY (inside legs) — collection stays side-effect-free.
 *
 * SEEDING IS IDEMPOTENT AND REUSES COMMITTED FIXTURES ONLY (the merged W2-8
 * seeding pattern, campaign fixtures — spec §4 "copy the pattern", C11):
 *   resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf
 *     (pinned sha 257f57196f6c…) -> POST /api/vendors/graph-lemur/pdfs/upload
 *     (content-addressed id VPDF-257F57196F6C; the upload leg skips an existing
 *     record) + the extractedText backfill leg so the SAID pane renders.
 *   server/src/ingestion/vendor-protocol/campaign-fixtures/zymo-semantic-draft.frozen.yaml
 *     (self-pinned d878727a…) -> POST /api/records as extraction-draft
 *     XDR-w211-gate (GET-first, create on 404 only).
 *   POST /api/extraction/drafts/XDR-w211-gate/candidates/0/promote -> the
 *     born-draft family CAN-protocol-* (GET-first via the XDR's promoted ref).
 *   POST /api/records: the labware/material seed rows the robot answers name
 *     (LAB-w211-*, MAT-w211-*, pipette-capability/p20-multi-8).
 *   POST /api/records: PLR-w211-gate (planned-run, protocolRef -> the family)
 *     then RUN-w211-gate (run, plannedRunRef -> PLR-w211-gate) — the W211-OQ6
 *     seeding mechanics, PROVEN headlessly at this tip (probe: POST protocol /
 *     PLR / run all 200-201, GET /api/runs/RUN-…/workspace 200, run surfaces
 *     in GET /api/runs). NOTHING is invented at run time.
 *
 * D5 (robot realization) is the spec's OPERATIVE branch (§4 row D5): no server
 * route exposes realizeAndCompile (C27 — RealizationCompileGate.ts is a
 * LOOKALIKE); the leg runs the merged lowerRealization/realizeAndCompile in the
 * SERVER WORKSPACE via a generated tsx subprocess (golden-suite canon:
 * recordingStore + createResolveSpineFromContext) and PASTES the LPR payload +
 * the emitted document. Honestly named — no invented surface.
 *
 * D6 (run graph shown): the ONE merged UI entry is AiTabPanel's shorthand
 * recompile (app/src/event-editor/right-pane/ai/AiTabPanel.tsx:602 ->
 * apiClient.intentCompile, client.ts '/intent/compile' :4003). If the seeded
 * run surfaces it, drive it; otherwise the leg falls back to the honest
 * API-paste form (POST /api/intent/compile with the emitted scientist-intent
 * document, paste the artifacts) per the spec row — never a faked UI.
 */
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5193'
const API_URL = process.env.API_URL ?? 'http://localhost:3093'
const API = `${API_URL}/api`
const USER_ID = process.env.CL_GATE_USER_ID ?? 'USR-BRAD'

const ZYMO_PDF_SHA = '257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b'
const DRAFT_SHA = 'd878727ae69305d73623b6e6fd99ddf7a1bc999efd7b8d84c9c9944afdc98058'
const ANSWERS_SHA = 'ac383fe4c71d164b52decaa332aeea1c87617a7efab29d294b3cb3a49fd7492e'
const XDR_ID = 'XDR-w211-gate'
const PLR_ID = 'PLR-w211-gate'
const RUN_ID = 'RUN-w211-gate'

// Module scope: seededFamilyPayload() (module-scope helper, used by D5/D6)
// must see this binding; assigned in test.beforeAll below (advc-W211-c1 D1).
let familyId = null

function repoPath(...segments) {
  // app/e2e/ -> repo root
  return fileURLToPath(new URL(`../../${segments.join('/')}`, import.meta.url))
}
function readSelfPinned(absPath, expectedSha) {
  const bytes = readFileSync(absPath)
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (sha !== expectedSha) {
    throw new Error(`${absPath} sha ${sha} != pinned ${expectedSha} — fixture drift, gate refuses to run`)
  }
  return bytes
}

// LAZY fixture load (never at module top level — vitest collects this file).
let loaded = null
function fixtures() {
  if (loaded) return loaded
  const pdfBytes = readSelfPinned(
    repoPath('resources', 'vendor_pdfs', '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf'),
    ZYMO_PDF_SHA,
  )
  const draftText = readSelfPinned(
    repoPath('server', 'src', 'ingestion', 'vendor-protocol', 'campaign-fixtures', 'zymo-semantic-draft.frozen.yaml'),
    DRAFT_SHA,
  ).toString('utf8')
  const answersText = readSelfPinned(
    repoPath('server', 'src', 'ingestion', 'vendor-protocol', 'campaign-fixtures', 'zymo-robot-answers.frozen.yaml'),
    ANSWERS_SHA,
  ).toString('utf8')
  loaded = {
    pdfBytes,
    draftText,
    answersText,
    vpdfId: `VPDF-${ZYMO_PDF_SHA.slice(0, 12).toUpperCase()}`, // VPDF-257F57196F6C
  }
  return loaded
}

// Minimal YAML subset parser for the frozen fixtures (no app dep: app/ has no
// `yaml` package; the fixtures are simple block YAML authored by probe-freeze).
function parseBlockYaml(text) {
  const lines = text.split('\n')
  let i = 0
  function peekIndent() {
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim() || line.trim().startsWith('#')) { i += 1; continue }
      return line.search(/\S/)
    }
    return -1
  }
  function parseBlock(indent) {
    const first = lines[i].trim()
    if (first.startsWith('- ') || first === '-') return parseSeq(indent)
    return parseMap(indent)
  }
  function parseMap(indent) {
    const out = {}
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim() || line.trim().startsWith('#')) { i += 1; continue }
      const cur = line.search(/\S/)
      if (cur < indent) break
      if (cur > indent) throw new Error(`yaml parse: unexpected indent at ${line}`)
      const m = line.trim().match(/^([^:]+):\s*(.*)$/)
      if (!m) throw new Error(`yaml parse: not a key line: ${line}`)
      const key = m[1]
      const rest = m[2]
      i += 1
      if (rest === '' || rest === '|') {
        const childIndent = peekIndent()
        if (childIndent === -1 || childIndent <= indent) { out[key] = rest === '|' ? '' : parseBlock(indent + 2) }
        else if (rest === '|') {
          const buf = []
          while (i < lines.length && (lines[i].search(/\S/) >= childIndent || !lines[i].trim())) { buf.push(lines[i].slice(childIndent)); i += 1 }
          out[key] = buf.join('\n')
        } else out[key] = parseBlock(childIndent)
      } else out[key] = scalar(rest)
    }
    return out
  }
  function parseSeq(indent) {
    const out = []
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim() || line.trim().startsWith('#')) { i += 1; continue }
      const cur = line.search(/\S/)
      if (cur < indent) break
      const trimmed = line.trim()
      if (!trimmed.startsWith('-')) break
      const rest = trimmed.slice(1).trim()
      if (rest.includes(':') && !rest.startsWith('"')) {
        // inline map start: re-feed as a map line at deeper indent
        lines[i] = ' '.repeat(indent + 2) + rest
        out.push(parseMap(indent + 2))
      } else if (rest === '') {
        i += 1
        const childIndent = peekIndent()
        out.push(childIndent > indent ? parseBlock(childIndent) : null)
      } else {
        i += 1
        out.push(scalar(rest))
      }
    }
    return out
  }
  function scalar(raw) {
    const v = raw.trim()
    if (v === 'true') return true
    if (v === 'false') return false
    if (v === 'null') return null
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1)
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
    return v
  }
  return parseBlock(0)
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'x-user-id': USER_ID } })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}
async function apiPost(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
    body: JSON.stringify(payload),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}
async function apiPut(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
    body: JSON.stringify(payload),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}
async function getRecordEnvelope(recordId) {
  const res = await apiGet(`/records/${encodeURIComponent(recordId)}`)
  if (res.status !== 200 || !res.body?.record) throw new Error(`GET /records/${recordId} -> ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`)
  return res.body
}
function shaOf(envelope) {
  const sha = envelope.meta?.contentSha ?? envelope.meta?.commitSha
  if (!sha) throw new Error(`${envelope.recordId} has no contentSha`)
  return sha
}

// ---------------------------------------------------------------------------
// SEED LEG (idempotent, committed fixtures + seeded records only)
// ---------------------------------------------------------------------------

async function seedVpdf() {
  const { pdfBytes, vpdfId } = fixtures()
  const res = await apiPost('/vendors/graph-lemur/pdfs/upload', {
    contentBase64: pdfBytes.toString('base64'),
    fileName: 'zymobiomics-96-magbead-dna-kit.pdf',
    title: 'ZymoBIOMICS 96 MagBead DNA Kit (W2-11 campaign SAID)',
  })
  if (res.status !== 200) throw new Error(`VPDF seeding upload -> ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`)
  const envelope = await getRecordEnvelope(vpdfId)
  const payload = envelope.payload
  const text = Array.isArray(payload.extractedText) ? payload.extractedText : []
  if (text.length === 0) {
    const put = await apiPut(`/records/${encodeURIComponent(vpdfId)}`, {
      payload: {
        ...payload,
        extractedText: [
          { pageNumber: 1, text: 'ZymoBIOMICS 96 MagBead DNA Kit — kit overview and storage.' },
          { pageNumber: 2, text: 'ZymoBIOMICS 96 MagBead DNA Kit — general protocol overview, lysis options.' },
        ],
      },
      message: 'W2-11 gate spec: backfill extractedText (idempotent, rides the merged W2-8 leg pattern)',
      expectedSha: shaOf(envelope),
    })
    if (put.status !== 200) throw new Error(`VPDF extractedText backfill -> ${put.status}: ${JSON.stringify(put.body).slice(0, 300)}`)
  }
  return getRecordEnvelope(vpdfId)
}

async function seedXdr() {
  const { vpdfId, draftText } = fixtures()
  const draft = parseBlockYaml(draftText)
  const existing = await apiGet(`/records/${encodeURIComponent(XDR_ID)}`)
  if (existing.status === 200 && existing.body?.record) return existing.body.record
  const res = await apiPost('/records', {
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      status: 'pending_review',
      source_artifact: { kind: 'file', id: vpdfId, locator: 'zymobiomics-96-magbead-dna-kit.pdf' },
      candidates: [{ target_kind: 'protocol', draft, confidence: 0.9, uncertainty: 'inferred' }],
    },
    message: 'W2-11 gate spec: seed the frozen reviewed semantic draft (campaign fixture)',
  })
  if (res.status !== 200 && res.status !== 201) throw new Error(`XDR seeding -> ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`)
  return (await getRecordEnvelope(XDR_ID)).record
}

/** Promote the frozen draft through the REAL W2-5 route; returns the family id. */
async function promoteFamily() {
  const xdr = await getRecordEnvelope(XDR_ID)
  const promoted = xdr.payload?.promoted_candidates ?? xdr.payload?.promoted ?? null
  const known = xdr.payload?.promotedRecordId ?? null
  if (typeof known === 'string') {
    const fam = await apiGet(`/records/${encodeURIComponent(known)}`)
    if (fam.status === 200) return known
  }
  if (Array.isArray(promoted) && promoted.length > 0) {
    const id = promoted[0]?.recordId ?? promoted[0]?.id
    if (typeof id === 'string') {
      const fam = await apiGet(`/records/${encodeURIComponent(id)}`)
      if (fam.status === 200) return id
    }
  }
  const res = await apiPost(`/extraction/drafts/${encodeURIComponent(XDR_ID)}/candidates/0/promote`, {})
  if (res.status !== 200) throw new Error(`promotion -> ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`)
  const canonicalId = String(res.body?.recordId ?? '')
  if (!canonicalId.startsWith('CAN-protocol-')) throw new Error(`promotion returned unexpected recordId ${canonicalId}`)
  return canonicalId
}

const SEED_LABWARES = [
  { recordId: 'LAB-w211-sample-plate', payload: { kind: 'labware', title: 'Sample Plate', synonyms: ['sample_plate', 'sample plate'] } },
  { recordId: 'LAB-w211-reservoir', payload: { kind: 'labware', title: 'Reagent Reservoir', synonyms: ['reagent_reservoir', 'reagent reservoir'] } },
]
const SEED_MATERIALS = [
  { recordId: 'MAT-w211-lysis', payload: { kind: 'material', title: 'Lysis Solution', synonyms: ['lysis_solution'] } },
  { recordId: 'MAT-w211-magbeads', payload: { kind: 'material', title: 'MagBinding Beads', synonyms: ['magbinding_beads'] } },
  { recordId: 'MAT-w211-magbuffer', payload: { kind: 'material', title: 'MagBinding Buffer', synonyms: ['magbinding_buffer'] } },
  { recordId: 'MAT-w211-magwash1', payload: { kind: 'material', title: 'MagWash 1', synonyms: ['magwash_1'] } },
  { recordId: 'MAT-w211-magwash2', payload: { kind: 'aliquot', title: 'MagWash 2', label: 'magwash_2' } },
  { recordId: 'MAT-w211-water', payload: { kind: 'material', title: 'DNase/RNase Free Water', synonyms: ['dnase_rnase_free_water'] } },
]

// The recordingStore canon rows the D5/D6 server legs resolve against (the
// same rows the golden suite seeds; the pipette-capability row rides the
// profile's equipment binding).
const SEED_ROWS = [
  { recordId: 'pipette-capability/p20-multi-8', payload: { kind: 'pipette-capability', title: 'P20 Multi 8' } },
  ...SEED_LABWARES,
  ...SEED_MATERIALS,
]

async function seedBioRecords() {
  for (const row of [...SEED_LABWARES, ...SEED_MATERIALS]) {
    const existing = await apiGet(`/records/${encodeURIComponent(row.recordId)}`)
    if (existing.status === 200) continue
    const kind = row.payload.kind
    const schemaId = kind === 'aliquot'
      ? 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml'
      : kind === 'labware'
        ? 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml'
        : 'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
    const res = await apiPost('/records', {
      schemaId,
      payload: { ...row.payload, recordId: row.recordId },
      message: 'W2-11 gate spec: seed the lab rows the robot answers name',
    })
    if (res.status !== 200 && res.status !== 201) throw new Error(`seed ${row.recordId} -> ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`)
  }
}

async function seedRun(familyId) {
  const plr = await apiGet(`/records/${encodeURIComponent(PLR_ID)}`)
  if (plr.status !== 200) {
    const res = await apiPost('/records', {
      schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
      payload: {
        kind: 'planned-run',
        recordId: PLR_ID,
        title: 'ZymoBIOMICS 96 on the ASSIST PLUS (W2-11 gate plan)',
        protocolRef: { kind: 'record', type: 'protocol', id: familyId },
        sourceType: 'protocol',
        sourceRef: { kind: 'record', type: 'protocol', id: familyId },
        state: 'ready',
      },
      message: 'W2-11 gate spec: seed the planned-run pointing at the promoted family',
    })
    if (res.status !== 200 && res.status !== 201) throw new Error(`PLR seeding -> ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`)
  }
  const run = await apiGet(`/records/${encodeURIComponent(RUN_ID)}`)
  if (run.status !== 200) {
    const res = await apiPost('/records', {
      schemaId: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
      payload: {
        kind: 'run',
        recordId: RUN_ID,
        title: 'ZymoBIOMICS 96 campaign run (W2-11 gate)',
        status: 'planned',
        plannedRunRef: { kind: 'record', type: 'planned-run', id: PLR_ID },
      },
      message: 'W2-11 gate spec: seed the run (W211-OQ6 mechanics, proven headlessly at this tip)',
    })
    if (res.status !== 200 && res.status !== 201) throw new Error(`RUN seeding -> ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`)
  }
  const ws = await apiGet(`/runs/${encodeURIComponent(RUN_ID)}/workspace`)
  if (ws.status !== 200) {
    // Honest reporting per the spec's VERDICT clause — never a faked gate.
    throw new Error(`D4 BLOCKED honestly: GET /runs/${RUN_ID}/workspace -> ${ws.status}: ${JSON.stringify(ws.body).slice(0, 400)} — the merged product cannot serve the seeded run; report, do not fake`)
  }
  return ws
}

async function openReview(page) {
  const { vpdfId } = fixtures()
  await page.goto(`${BASE_URL}/`)
  await page.evaluate((u) => window.localStorage.setItem('cl.currentUserId', u), USER_ID)
  await page.goto(`${BASE_URL}/ingestion/vendor-pdf/${vpdfId}`)
  await page.waitForLoadState('networkidle')
}

async function sendChat(page, text) {
  const box = page.getByTestId('chat-input').locator('[contenteditable="true"], textarea, input[type="text"]').first()
  await box.click()
  await page.keyboard.type(text)
  await page.getByTestId('chat-input-send').click()
}

async function revisionCount(recordId) {
  const res = await apiGet(`/records/${encodeURIComponent(recordId)}/revisions`)
  if (res.status !== 200) throw new Error(`GET /records/${recordId}/revisions -> ${res.status}`)
  const records = res.body?.records ?? res.body?.revisions ?? []
  return { count: records.length, records }
}

function draftOf(envelope) {
  return envelope.payload?.candidates?.[0]?.draft ?? {}
}
function provenanceOf(envelope) {
  return (draftOf(envelope).steps ?? []).map((s) => s.intent?.provenance ?? null)
}

// ---------------------------------------------------------------------------
// SERVER-LEG HELPER (D5/D6): the merged realization functions are NOT exposed
// by any server route (spec §4 D5, C27 — RealizationCompileGate.ts is a
// LOOKALIKE). The legs run the MERGED functions via a tsx subprocess in the
// server workspace (the same canon the golden suite uses: recordingStore +
// createResolveSpineFromContext), generated at run time from the committed
// fixtures + seed rows. Honestly named — no invented surface, no faked gate.
// ---------------------------------------------------------------------------
function runServerLeg(mode, familyPayload, answersText, seedRows) {
  const serverDir = repoPath('server')
  mkdirSync(join(serverDir, 'tmp'), { recursive: true })
  const scriptPath = join(serverDir, 'tmp', 'w211-gate-leg.ts')
  const yamlPath = join(serverDir, 'tmp', 'w211-gate-intent.yaml')
  const body = [
    '/** GENERATED by w2-11-campaign-demo.spec.mjs (gate leg, untracked tmp/). */',
    "import { readFileSync } from 'node:fs';",
    "import { createHash } from 'node:crypto';",
    "import { parse } from 'yaml';",
    "import { lowerRealization, realizeAndCompile } from '../src/compiler/scientistIntent/realizeScientistIntent.js';",
    "import { recordingStore } from '../src/compiler/scientistIntent/goldens/replayKernel.js';",
    "import { createResolveSpineFromContext } from '../src/resolve/index.js';",
    `const family = ${JSON.stringify(familyPayload)};`,
    `const answers = parse(${JSON.stringify(answersText)});`,
    `const seedRows = ${JSON.stringify(seedRows)};`,
    'const axisId = (family.branch_axes ?? [])[0]?.axisId;',
    'const lpr = {',
    "  kind: 'local-protocol', protocolLayer: 'lab', recordId: 'LPR-w211-gate-robot-96',",
    "  title: 'ZymoBIOMICS 96 on the ASSIST PLUS (robot realization)', status: 'active',",
    "  inherits_from: { kind: 'record', type: 'protocol', id: family.recordId },",
    '  branch_resolution: [{ axisId, matched: true, branchIds: answers.axisAnswer.branchIds, choices: { [axisId]: answers.axisAnswer.chosenValue, sample_count: answers.sampleCount } }],',
    '  labwares: answers.labwares, equipment: answers.equipment, materials: answers.materials,',
    '};',
    'const lowered = await lowerRealization({ family, realization: lpr });',
    "if (!('intentYaml' in lowered)) { console.log('W211_LEG ' + JSON.stringify({ ok: false, stage: 'lower', failures: lowered.failures })); process.exit(0); }",
    "if (process.env.W211_LEG_MODE === 'lower') {",
    "  console.log('W211_LEG ' + JSON.stringify({ ok: true, stage: 'lower', yamlSha: createHash('sha256').update(lowered.intentYaml).digest('hex'), yaml: lowered.intentYaml, lprPayload: lpr }));",
    '  process.exit(0);',
    '}',
    'const recorder = recordingStore(seedRows);',
    'const spine = createResolveSpineFromContext({ store: recorder.store as never });',
    'const compiled = await realizeAndCompile({ family, realization: lpr, compileDeps: { spine } });',
    "if (!('compile' in compiled)) { console.log('W211_LEG ' + JSON.stringify({ ok: false, stage: 'compile', failures: compiled.failures })); process.exit(0); }",
    'const artifacts = compiled.compile.terminalArtifacts;',
    'const serialized = JSON.stringify(artifacts);',
    "console.log('W211_LEG ' + JSON.stringify({",
    '  ok: true, stage: \'compile\',',
    '  outcome: compiled.compile.outcome,',
    '  events: (artifacts.events ?? []).length,',
    '  lprPayload: lpr,',
    '  yamlSha: createHash(\'sha256\').update(lowered.intentYaml).digest(\'hex\'),',
    '  closure: { sample_plate: serialized.includes(\'sample_plate\'), reagent_reservoir: serialized.includes(\'reagent_reservoir\') },',
    '  yaml: lowered.intentYaml,',
    '  eventsJson: JSON.stringify(artifacts.events ?? []),',
    '}));',
    'process.exit(0);',
    '',
  ].join('\n')
  writeFileSync(scriptPath, body)
  const proc = spawnSync('npx', ['tsx', 'tmp/w211-gate-leg.ts'], {
    cwd: serverDir,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, W211_LEG_MODE: mode },
  })
  const line = (proc.stdout ?? '').split('\n').find((l) => l.startsWith('W211_LEG '))
  if (!line) {
    throw new Error(`server leg produced no result (exit ${proc.status}): ${(proc.stderr ?? '').slice(0, 400)}`)
  }
  const result = JSON.parse(line.slice('W211_LEG '.length))
  if (result.ok && result.yaml) writeFileSync(yamlPath, result.yaml)
  return result
}

async function seededFamilyPayload() {
  const fam = await getRecordEnvelope(familyId)
  return fam.payload
}

test.describe('W2-11 zymo campaign demo gate', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const apiHealth = await fetch(`${API}/health`).then((r) => r.status)
    expect(apiHealth, `${API}/health must be 200`).toBe(200)
    const appHealth = await fetch(`${BASE_URL}/`).then((r) => r.status)
    expect(appHealth, `${BASE_URL}/ must serve`).toBe(200)
    await seedVpdf()
    await seedXdr()
    await seedBioRecords()
    familyId = await promoteFamily()
    await seedRun(familyId)
  })

  test('PRECHECK: seeded SAID + MEANT + family + run present', async () => {
    const { vpdfId } = fixtures()
    const vpdf = await getRecordEnvelope(vpdfId)
    expect(vpdf.payload.kind).toBe('vendor-pdf')
    const xdr = await getRecordEnvelope(XDR_ID)
    expect(xdr.payload.kind).toBe('extraction-draft')
    expect(xdr.payload.source_artifact.id).toBe(vpdfId)
    const fam = await getRecordEnvelope(familyId)
    expect(fam.payload.kind).toBe('protocol')
    expect(fam.payload.protocolLayer).toBe('universal')
    const ws = await apiGet(`/runs/${encodeURIComponent(RUN_ID)}/workspace`)
    expect(ws.status, 'the seeded run must serve its workspace (OQ6 mechanics)').toBe(200)
    console.log(`[seed] ${vpdfId} + ${XDR_ID} + family ${familyId} + ${RUN_ID} present (fixture sha ${ZYMO_PDF_SHA.slice(0, 12)})`)
  })

  test('D1: immutable SAID — sha equal, zero mutating controls', async ({ page }) => {
    const { vpdfId } = fixtures()
    const before = await getRecordEnvelope(vpdfId)
    const shaBefore = shaOf(before)

    await openReview(page)
    await expect(page.getByTestId('semantic-draft-panel')).toBeVisible({ timeout: 20000 })

    // The wave-2 render carries NO save/save-as/use-extracted machinery (C13).
    for (const testid of ['vpdf-save', 'vpdf-save-as', 'vpdf-save-actions', 'vpdf-use-extracted', 'vpdf-saveas-modal']) {
      await expect(page.getByTestId(testid), `no ${testid} on the wave-2 render`).toHaveCount(0)
    }
    // Keyboard probing of the left pane: select-all + type must not mutate the record.
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    await page.keyboard.type('attempted rewrite via keyboard')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(800)

    const after = await getRecordEnvelope(vpdfId)
    expect(shaOf(after), 'SAID contentSha must be EQUAL after UI probing').toBe(shaBefore)
    await page.screenshot({ path: 'receipts/w211-d1-immutable-said.png', fullPage: true })
    console.log(`[D1 paste] VPDF ${vpdfId} sha before=${shaBefore} after=${shaOf(after)}`)
  })

  test('D2: editable MEANT — label edit saves, survives reload, provenance byte-equal', async ({ page }) => {
    const before = await getRecordEnvelope(XDR_ID)
    const shaBefore = shaOf(before)
    const provenanceBefore = JSON.parse(JSON.stringify(provenanceOf(before)))
    const draftTitle = draftOf(before).title ?? ''
    const EDITED_TITLE = draftTitle.endsWith(' EDITED') ? `${draftTitle} v2` : `${draftTitle} EDITED`

    await openReview(page)
    const editor = page.locator('.semantic-draft__taptab [contenteditable="true"]').first()
    await expect(editor, 'the MEANT editor must mount (TapTab projection)').toBeVisible({ timeout: 20000 })

    const titleRow = page
      .locator('.semantic-draft__taptab .taptab-field-row', { has: page.locator('.taptab-field-label', { hasText: 'Title' }) })
      .first()
    await expect(titleRow, 'the Title fieldRow must render').toBeVisible({ timeout: 15000 })
    await titleRow.locator('.taptab-widget-value').first().click()
    const input = titleRow.locator('input.taptab-inline-input').first()
    await expect(input, 'clicking the value must open the inline input').toBeVisible({ timeout: 5000 })
    await input.fill(EDITED_TITLE)
    await page.keyboard.press('Enter')

    const save = page.getByTestId('semantic-draft-save')
    await expect(save, 'an edit must dirty the Save button').toBeEnabled({ timeout: 10000 })
    await save.click()
    const note = page.getByTestId('semantic-draft-note')
    await expect(note, 'Save must report Saved').toContainText('Saved', { timeout: 15000 })

    // Hard reload (F5): the value persists.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('semantic-draft-panel')).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('semantic-draft-panel').getByText(EDITED_TITLE, { exact: false }).first()).toBeVisible()

    const revisions = await revisionCount(XDR_ID)
    expect(revisions.count, 'the save must land as a revision').toBeGreaterThan(1)
    const after = await getRecordEnvelope(XDR_ID)
    expect(shaOf(after)).not.toBe(shaBefore)
    expect(JSON.parse(JSON.stringify(provenanceOf(after))), 'intent.provenance must survive byte-equal').toEqual(provenanceBefore)
    await page.screenshot({ path: 'receipts/w211-d2-editable-meant.png', fullPage: true })
    console.log(`[D2 paste] XDR ${XDR_ID} revisions=${revisions.count} provenance byte-equal=true sha ${shaBefore.slice(0, 12)} -> ${shaOf(after).slice(0, 12)}`)
  })

  test('D3: mounted AI — proposal + accept revision, refusals visible, walls hold', async ({ page }) => {
    const vpdfBefore = await getRecordEnvelope(fixtures().vpdfId)
    const xdrBefore = await getRecordEnvelope(XDR_ID)
    const provBefore = JSON.parse(JSON.stringify(provenanceOf(xdrBefore)))
    const statusBefore = xdrBefore.payload.status

    await openReview(page)
    await expect(page.getByTestId('review-ai-panel')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('chat-input')).toBeVisible()

    // Proposal leg: reword a step label.
    console.log('[D3 turn] reword step 3 label for our bench')
    await sendChat(page, 'reword step 3 label for our bench')
    await page.waitForFunction(
      () => {
        const log = document.querySelector('[data-testid="message-log"]')
        return !!log && log.querySelectorAll('.message-log__bubble--assistant:not(.message-log__bubble--pending)').length > 0
      },
      undefined,
      { timeout: 90000 },
    )
    const revisionsBefore = (await revisionCount(XDR_ID)).count
    // The merged W2-9 proposal card's apply control is changes-apply
    // (w29-review-ai-panel.spec.mjs:227 precedent).
    const applyBtn = page.getByTestId('changes-apply')
    if (await applyBtn.isVisible({ timeout: 120000 }).catch(() => false)) {
      await applyBtn.click()
      await expect(page.getByTestId('review-ai-apply-note')).toBeVisible({ timeout: 20000 })
      const revisionsAfter = (await revisionCount(XDR_ID)).count
      expect(revisionsAfter, 'an accepted chat edit lands as an ordinary revision').toBeGreaterThan(revisionsBefore)
    } else {
      // Honest leg: the model produced no proposal card this run — record it.
      console.log('[D3 honest] no proposal card surfaced for the reword turn (model-dependent); refusal legs still gate')
    }
    await page.screenshot({ path: 'receipts/w211-d3-mounted-ai.png', fullPage: true })

    // Refusal legs (reviewWriteWall is MERGED — refusals are product truth).
    for (const turn of [
      'change the vendor text on page 1',
      'mark the inferred incubate step as vendor-stated',
      'promote the draft to a protocol now',
    ]) {
      console.log(`[D3 refusal turn] ${turn}`)
      await sendChat(page, turn)
      const refusal = page.getByTestId('review-ai-refusal')
      const appeared = await refusal.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)
      expect(appeared, `refusal must be visible for: ${turn}`).toBe(true)
      await page.screenshot({ path: `receipts/w211-d3-refusal-${turn.slice(0, 18).replace(/\W+/g, '-')}.png`, fullPage: true })
    }

    const vpdfAfter = await getRecordEnvelope(fixtures().vpdfId)
    expect(shaOf(vpdfAfter), 'VPDF sha unchanged through the AI legs').toBe(shaOf(vpdfBefore))
    const xdrAfter = await getRecordEnvelope(XDR_ID)
    expect(JSON.parse(JSON.stringify(provenanceOf(xdrAfter))), 'XDR provenance byte-equal through the AI legs').toEqual(provBefore)
    expect(xdrAfter.payload.status, 'XDR status unchanged (no promotion through the chat wall)').toBe(statusBefore)
  })

  test('D4: downstream questions — run workspace localization answers + accept -> LPR', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)
    await page.evaluate((u) => window.localStorage.setItem('cl.currentUserId', u), USER_ID)
    await page.goto(`${BASE_URL}/runs/${RUN_ID}`)
    await page.waitForLoadState('networkidle')

    // Protocol tab: the localization disclosure opens by default for a run
    // attached directly to a universal protocol (ProtocolTabPanel.tsx:1782-1795).
    const details = page.getByTestId('protocol-localization-details')
    await expect(details, 'the run workspace protocol tab must surface the localization thread').toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('protocol-localization-thread')).toBeVisible()

    // Family branch_axes questions appear (auto-asked from the family record).
    const clarify = page.getByTestId('pl-clarify')
    const axesVisible = await clarify.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)
    expect(axesVisible, 'the family branch_axes questions must appear (downstream questions persist)').toBe(true)

    // Answer the family axis with the rack branch (branch-1 — the same branch
    // the golden's robot answers keep). NOTE (honest naming): the merged UI
    // renders the FAMILY's declared condition choices (rack vs tubes); the
    // "neither spin column nor plate — the robot" selection is the ROBOT
    // REALIZATION answer, proven on the D5 leg's LPR payload (spec §4 D5
    // OPERATIVE branch, C27) — the UI axis itself asks rack-vs-tubes.
    const rackChoice = clarify.locator('.pl-axis__choice', { hasText: /BashingBead Lysis Rack/i }).first().locator('input[type="radio"]')
    await expect(rackChoice, 'the rack condition must be offered on the axis').toBeVisible({ timeout: 10000 })
    await rackChoice.check()
    // Fill any remaining axes with their first choice so Apply & compile enables.
    const axes = clarify.locator('.pl-axis')
    const axisCount = await axes.count()
    for (let a = 0; a < axisCount; a += 1) {
      const axis = axes.nth(a)
      const checked = await axis.locator('input[type="radio"]:checked').count()
      if (checked === 0) await axis.locator('input[type="radio"]').first().check()
    }
    await page.getByTestId('pl-submit-answers').click()

    // Deck review gate: pick at least one labware, then accept.
    const deckReview = page.getByTestId('pl-deck-review')
    const deckAppeared = await deckReview.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)
    expect(deckAppeared, 'the compiled draft must route through the deck review gate').toBe(true)
    const labwareBoxes = deckReview.locator('input[type="checkbox"]')
    const boxCount = await labwareBoxes.count()
    expect(boxCount, 'the deck review must offer labware placements').toBeGreaterThan(0)
    await labwareBoxes.first().check()
    await page.getByTestId('pl-load-deck').click()

    const accept = page.getByTestId('pl-accept')
    await expect(accept, 'accept enables after the deck gate').toBeEnabled({ timeout: 20000 })
    await accept.click()
    await expect(page.getByTestId('pl-msg')).toContainText('Accepted', { timeout: 30000 })
    await page.screenshot({ path: 'receipts/w211-d4-downstream-questions.png', fullPage: true })

    // GET the LPR record the accept minted (POST /intent/accept,
    // IntentAcceptHandlers.ts:121 route; recordId LPR-*).
    const list = await apiGet(`/records?kind=local-protocol&limit=50`)
    const records = list.body?.records ?? []
    const lpr = records.find((r) => String(r.recordId).startsWith('LPR-') && r.payload?.inherits_from?.id === familyId)
    expect(lpr, 'the accept must mint an LPR inheriting from the promoted family').toBeTruthy()
    const resolution = lpr.payload.branch_resolution ?? []
    expect(resolution.length, 'the accept must record the answered axis as branch_resolution').toBeGreaterThan(0)
    const answered = resolution[0]
    const fam = await getRecordEnvelope(familyId)
    const axisIds = (fam.payload.branch_axes ?? []).map((a) => a.axisId)
    expect(axisIds, 'the answered axis is a FAMILY axis id').toContain(answered.axisId)
    const axis = (fam.payload.branch_axes ?? []).find((a) => a.axisId === answered.axisId)
    expect(Object.values(answered.choices ?? {})[0], 'the recorded choice matches the answer given in the UI').toBe('zymobiomics-bashingbead-lysis-rack')
    for (const branchId of answered.branchIds ?? []) {
      expect((axis?.conditions ?? []).map((c) => c.id), 'branchIds are FAMILY condition ids').toContain(branchId)
    }
    console.log(`[D4 paste] LPR ${lpr.recordId} branch_resolution=${JSON.stringify(resolution)}`)
  })

  test('D5: robot realization — merged lowerRealization/realizeAndCompile headless leg (honestly named)', async () => {
    // SPEC §4 D5 OPERATIVE BRANCH (C27): no server route exposes
    // realizeAndCompile; the leg runs the MERGED functions in the server
    // workspace via the generated tsx leg (golden-suite canon: recordingStore
    // + createResolveSpineFromContext) over the seeded family + committed
    // fixtures. Receipt: the LPR payload + the emitted scientist-intent
    // document. No invented surface, no faked gate.
    const famPayload = await seededFamilyPayload()
    const answers = parseBlockYaml(fixtures().answersText)
    const result = runServerLeg('compile', famPayload, fixtures().answersText, SEED_ROWS)
    if (!result.ok) {
      throw new Error(`D5 honest failure (${result.stage}): ${JSON.stringify(result.failures ?? {}).slice(0, 500)}`)
    }
    expect(result.outcome, 'robot realization must complete').toBe('complete')
    expect(result.events, 'robot realization must emit a non-empty run graph').toBeGreaterThan(0)
    expect(result.closure.sample_plate, 'robot profile closure: sample_plate role bound').toBe(true)
    expect(result.closure.reagent_reservoir, 'robot profile closure: reagent_reservoir role bound').toBe(true)
    const robot = result.lprPayload.branch_resolution[0]
    expect(robot.choices[robot.axisId], 'the robot answer rides the LOCAL_REALIZATION carrier').toBe('robot')
    console.log(`[D5 paste] LPR payload ${JSON.stringify(result.lprPayload).slice(0, 700)}`)
    console.log(`[D5 paste] emitted scientist-intent YAML sha ${result.yamlSha} events=${result.events} outcome=${result.outcome}`)
    console.log(`[D5 paste] emitted YAML head:\n${result.yaml.split('\n').slice(0, 12).join('\n')}`)
  })

  test('D6: run graph shown — POST /intent/compile artifacts viewable', async ({ page }) => {
    // Drive the ONE merged UI entry (AiTabPanel shorthand recompile,
    // AiTabPanel.tsx:602 -> client.ts '/intent/compile' :4003) if the seeded
    // run surfaces it; the API-paste leg (spec §4 D6 fallback) always runs.
    const famPayload = await seededFamilyPayload()
    const lowered = runServerLeg('lower', famPayload, fixtures().answersText, SEED_ROWS)
    if (!lowered.ok) {
      throw new Error(`D6 honest failure (lower): ${JSON.stringify(lowered.failures ?? {}).slice(0, 500)}`)
    }
    const compiled = await apiPost('/intent/compile', { intent: lowered.yaml })
    expect(compiled.status, 'POST /api/intent/compile must serve the emitted document').toBe(200)
    const artifacts = compiled.body?.terminalArtifacts ?? {}
    const events = artifacts.events ?? []
    expect(events.length, 'the compiled run graph must be non-empty').toBeGreaterThan(0)
    console.log(`[D6 paste] POST /intent/compile -> outcome=${compiled.body?.outcome} events=${events.length}`)

    // UI leg: the run workspace renders the graph surface when available.
    await page.goto(`${BASE_URL}/runs/${RUN_ID}`)
    await page.waitForLoadState('networkidle')
    const aiTab = page.getByTestId('ai-tab')
    const uiShown = await aiTab.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
    if (uiShown) {
      await page.screenshot({ path: 'receipts/w211-d6-run-graph-ui.png', fullPage: true })
      console.log('[D6] AiTabPanel surfaced on the seeded run (UI leg)')
    } else {
      await page.screenshot({ path: 'receipts/w211-d6-run-graph-api-paste.png', fullPage: true })
      console.log('[D6 honest] AiTabPanel not surfaced on the seeded run; API-paste leg stands (spec §4 D6 fallback)')
    }
    console.log(`[D6 paste] artifacts keys=${Object.keys(artifacts).sort().join(',')} events[0]=${JSON.stringify(events[0]).slice(0, 300)}`)
  })
})
