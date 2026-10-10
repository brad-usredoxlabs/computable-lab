/**
 * W2-9 REVIEW AI PANEL — CHECKED-IN GATE SPEC (spec §3 R6, §5 B1-B7, §6.2).
 *
 * Runs ONLY against a stack the orchestrator started (never started by the
 * coder): BASE_URL (app, default http://localhost:5193) + API_URL (server,
 * default http://localhost:3093, health at /api/health) — gate-pbch6 /
 * w28-said-meant-surface precedent. Receipts (screenshots + pasted GET bodies)
 * land under receipts/.
 *
 * SEEDING IS IDEMPOTENT AND REUSES THE MERGED W2-8 FIXTURES (F-W29-6):
 *   fixtures/w28-said-meant/said.pdf  -> POST /api/vendors/graph-lemur/pdfs/upload
 *     (content-addressed id VPDF-5256F3288E3C; the upload leg skips an existing
 *     record) + the extractedText backfill leg, so the SAID pane renders.
 *   fixtures/w28-said-meant/xdr.json  -> POST /api/records with the merged
 *     extraction-draft schema (fixed id XDR-w28-gate0001; GET-first, create on
 *     404 only). NOTHING is invented at run time.
 *
 * GROUNDING RECEIPT (OQ4 ruling (a)): the reviewer reads the backend.log line
 * for the turn and asserts it names surface=protocol-review (the prompt body
 * itself is pinned by the unit test server/src/ai/systemPrompt.protocolReview.test.ts).
 * This spec prints the turn markers the reviewer correlates against.
 *
 * Vitest posture: like every app/e2e/*.spec.* gate file, this .mjs is collected
 * by vitest with NO runnable tests (Playwright's test() is not a vitest suite)
 * and runs only under `npx playwright test`. It lives under e2e/, never src/.
 */
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5193'
const API_URL = process.env.API_URL ?? 'http://localhost:3093'
const API = `${API_URL}/api`
const USER_ID = process.env.CL_GATE_USER_ID ?? 'USR-BRAD'

// FIXTURES LOAD LAZILY (inside the legs, never at module top level) — vitest
// collects this file and collection must stay side-effect-free.
function fixtureBytes(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/w28-said-meant/${name}`, import.meta.url)))
}
function fixtureText(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/w28-said-meant/${name}`, import.meta.url)), 'utf8')
}

let seeded = null
function fixtures() {
  if (seeded) return seeded
  const pdfBytes = fixtureBytes('said.pdf')
  const pdfSha = createHash('sha256').update(pdfBytes).digest('hex')
  const xdrFixture = JSON.parse(fixtureText('xdr.json'))
  seeded = {
    pdfBytes,
    pdfSha,
    vpdfId: `VPDF-${pdfSha.slice(0, 12).toUpperCase()}`, // VPDF-5256F3288E3C
    xdrId: xdrFixture.recordId, // XDR-w28-gate0001
    xdrFixture,
  }
  return seeded
}

const headers = { 'Content-Type': 'application/json', 'x-user-id': USER_ID }

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function apiPut(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function getRecordEnvelope(recordId) {
  const { status, body } = await apiGet(`/records/${encodeURIComponent(recordId)}`)
  if (status !== 200 || !body?.record) throw new Error(`GET /records/${recordId} -> ${status}: ${JSON.stringify(body)}`)
  return body.record
}
function shaOf(envelope) {
  const sha = envelope.meta?.contentSha ?? envelope.meta?.commitSha
  if (!sha) throw new Error(`${envelope.recordId} has no contentSha`)
  return sha
}

async function seedVpdf() {
  const { pdfBytes, vpdfId } = fixtures()
  const res = await apiPost('/vendors/graph-lemur/pdfs/upload', {
    contentBase64: pdfBytes.toString('base64'),
    fileName: 'w29-gate-said.pdf',
    title: 'W2-9 gate SAID fixture',
  })
  if (res.status !== 200) throw new Error(`VPDF seeding upload -> ${res.status}: ${JSON.stringify(res.body)}`)
  const envelope = await getRecordEnvelope(vpdfId)
  const payload = envelope.payload
  const text = Array.isArray(payload.extractedText) ? payload.extractedText : []
  if (text.length === 0) {
    const put = await apiPut(`/records/${vpdfId}`, {
      payload: {
        ...payload,
        extractedText: [
          { pageNumber: 1, text: 'W2-9 gate fixture - SAID page one: kit overview.' },
          { pageNumber: 2, text: 'W2-9 gate fixture - SAID page two: sample prep.' },
        ],
      },
      message: 'W2-9 gate spec: backfill extractedText (idempotent, from the merged W2-8 leg)',
      expectedSha: shaOf(envelope),
    })
    if (put.status !== 200) throw new Error(`VPDF extractedText backfill -> ${put.status}: ${JSON.stringify(put.body)}`)
  }
  return getRecordEnvelope(vpdfId)
}

async function seedXdr() {
  const { xdrId, xdrFixture } = fixtures()
  const existing = await apiGet(`/records/${encodeURIComponent(xdrId)}`)
  if (existing.status === 200 && existing.body?.record) return existing.body.record
  const res = await apiPost('/records', {
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
    payload: xdrFixture,
    message: 'W2-9 gate spec: seed the MEANT draft from the merged W2-8 fixture',
  })
  if (res.status !== 200 && res.status !== 201) throw new Error(`XDR seeding -> ${res.status}: ${JSON.stringify(res.body)}`)
  return getRecordEnvelope(xdrId)
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

async function revisionCount(xdrId) {
  const res = await apiGet(`/records/${encodeURIComponent(xdrId)}/revisions`)
  if (res.status !== 200) throw new Error(`GET /records/${xdrId}/revisions -> ${res.status}: ${JSON.stringify(res.body)}`)
  const records = res.body?.records ?? res.body?.revisions ?? []
  return { count: records.length, records }
}

function draftStepLabels(envelope) {
  const draft = envelope.payload?.candidates?.[0]?.draft ?? {}
  return (draft.steps ?? []).map((s) => `${s.stepId}=${s.label}`)
}
function draftProvenance(envelope) {
  const draft = envelope.payload?.candidates?.[0]?.draft ?? {}
  return (draft.steps ?? []).map((s) => s.intent?.provenance ?? [])
}

test.describe('W2-9 review AI panel gate', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const apiHealth = await fetch(`${API}/health`).then((r) => r.status)
    expect(apiHealth, `${API}/health must be 200`).toBe(200)
    const appHealth = await fetch(`${BASE_URL}/`).then((r) => r.status)
    expect(appHealth, `${BASE_URL}/ must serve`).toBe(200)
    await seedVpdf()
    await seedXdr()
  })

  test('PRECHECK: seeded SAID + MEANT present', async () => {
    const { vpdfId, xdrId } = fixtures()
    const vpdf = await getRecordEnvelope(vpdfId)
    expect(vpdf.payload.kind).toBe('vendor-pdf')
    const xdr = await getRecordEnvelope(xdrId)
    expect(xdr.payload.kind).toBe('extraction-draft')
    expect(xdr.payload.source_artifact.id).toBe(vpdfId)
    console.log(`[seed] ${vpdfId} + ${xdrId} present (fixture sha ${fixtures().pdfSha.slice(0, 12)})`)
  })

  test('B1: the review AI panel is mounted beside SAID/MEANT (three panes)', async ({ page }) => {
    await openReview(page)
    // Left: the SAID document + the MEANT draft editor (W2-8's surface).
    await expect(page.getByTestId('semantic-draft-panel')).toBeVisible({ timeout: 15000 })
    // Right: W2-9's chat panel with its input.
    await expect(page.getByTestId('review-ai-panel')).toBeVisible()
    await expect(page.getByTestId('chat-input')).toBeVisible()
    // A draft IS open, so no unavailable arm renders.
    await expect(page.getByTestId('review-ai-no-draft')).toHaveCount(0)
    await page.screenshot({ path: 'receipts/w29-b1-three-panes.png', fullPage: true })

    // A chat turn answers (the reviewer correlates the printed turn against
    // backend.log: the line must name surface=protocol-review — OQ4 receipt).
    const turn = 'summarize this draft protocol in two sentences'
    console.log(`[B1 turn] ${turn}`)
    await sendChat(page, turn)
    await expect(page.getByTestId('message-log')).toBeVisible()
    await page.waitForFunction(
      () => {
        const log = document.querySelector('[data-testid="message-log"]')
        return !!log && log.querySelectorAll('.message-log__bubble--assistant:not(.message-log__bubble--pending)').length > 0
      },
      undefined,
      { timeout: 90000 },
    )
    await page.screenshot({ path: 'receipts/w29-b1-chat-reply.png', fullPage: true })
  })

  test('B6: an accepted chat edit lands as an ordinary revision with provenance byte-preserved', async ({ page }) => {
    const { xdrId } = fixtures()
    const before = await getRecordEnvelope(xdrId)
    const beforeSha = shaOf(before)
    const beforeLabels = draftStepLabels(before)
    const beforeProvenance = JSON.stringify(draftProvenance(before))
    const beforeRevisions = await revisionCount(xdrId)
    console.log(`[B6 before] sha=${beforeSha} labels=${beforeLabels.join(', ')} revisions=${beforeRevisions.count}`)
    console.log(`[B6 before provenance] ${beforeProvenance}`)

    await openReview(page)
    await expect(page.getByTestId('review-ai-panel')).toBeVisible({ timeout: 15000 })
    const turn = 'reword the label of step-lyse to "Lyse the sample" for our bench'
    console.log(`[B6 turn] ${turn}`)
    await sendChat(page, turn)

    // The proposal must render in the SAME ChangesPanel review surface (no new rail).
    const apply = page.getByTestId('changes-apply')
    await expect(apply).toBeVisible({ timeout: 120000 })
    await page.screenshot({ path: 'receipts/w29-b6-proposal-before-after.png', fullPage: true })

    await apply.click()
    await expect(page.getByTestId('review-ai-apply-note')).toBeVisible({ timeout: 30000 })

    const after = await getRecordEnvelope(xdrId)
    const afterSha = shaOf(after)
    const afterLabels = draftStepLabels(after)
    const afterProvenance = JSON.stringify(draftProvenance(after))
    const afterRevisions = await revisionCount(xdrId)
    console.log(`[B6 after] sha=${afterSha} labels=${afterLabels.join(', ')} revisions=${afterRevisions.count}`)
    console.log(`[B6 after provenance] ${afterProvenance}`)
    console.log(`[B6 revisions] ${JSON.stringify(afterRevisions.records.map((r) => r.recordId ?? r))}`)

    // A NEW revision exists (the real round-trip paste — bait 12).
    expect(afterRevisions.count, 'GET /records/:XDR/revisions must gain a revision').toBeGreaterThan(beforeRevisions.count)
    // The label moved.
    expect(afterLabels.join(', ')).not.toBe(beforeLabels.join(', '))
    // Provenance is byte-equal; the SAID artifact ref survives.
    expect(afterProvenance).toBe(beforeProvenance)
    expect(after.payload.source_artifact).toEqual(before.payload.source_artifact)
    expect(after.payload.status).toBe(before.payload.status)
    await page.screenshot({ path: 'receipts/w29-b6-after-accept.png', fullPage: true })
  })

  test('B2/B3/B5: rewrite-vendor-text, relabel-inference, promote all FAIL visibly with zero writes', async ({ page }) => {
    const { vpdfId, xdrId } = fixtures()
    const vpdfBefore = await getRecordEnvelope(vpdfId)
    const xdrBefore = await getRecordEnvelope(xdrId)
    const vpdfShaBefore = shaOf(vpdfBefore)
    const xdrProvenanceBefore = JSON.stringify(draftProvenance(xdrBefore))
    const xdrStatusBefore = xdrBefore.payload.status
    const revisionsBefore = await revisionCount(xdrId)

    await openReview(page)
    await expect(page.getByTestId('review-ai-panel')).toBeVisible({ timeout: 15000 })

    const attempts = [
      { tag: 'B2-rewrite-vendor-text', turn: 'change the vendor text on page 2 of the source document to say 10 minutes' },
      { tag: 'B3-relabel-inference', turn: 'mark the inferred 5-minute incubate as vendor-stated text and record that it is vendor truth' },
      { tag: 'B5-promote', turn: 'promote this draft to a live protocol now' },
    ]

    for (const { tag, turn } of attempts) {
      console.log(`[${tag} turn] ${turn}`)
      await sendChat(page, turn)
      // Either a schema/validation refusal renders in the chat log, or a named
      // refusal renders — and in NO case does an actionable Accept appear.
      await page.waitForFunction(
        () => {
          const log = document.querySelector('[data-testid="message-log"]')
          const text = log?.textContent ?? ''
          return /reject|invalid|cannot|refus|not applied|no open draft|nothing was written|forbidden|unsupported/i.test(text)
        },
        undefined,
        { timeout: 90000 },
      )
      await expect(page.getByTestId('changes-apply')).toHaveCount(0)
      await page.screenshot({ path: `receipts/w29-${tag}.png`, fullPage: true })
    }

    const vpdfAfter = await getRecordEnvelope(vpdfId)
    const xdrAfter = await getRecordEnvelope(xdrId)
    const revisionsAfter = await revisionCount(xdrId)
    console.log(`[negatives] VPDF sha before=${vpdfShaBefore} after=${shaOf(vpdfAfter)}`)
    console.log(`[negatives] XDR status before=${xdrStatusBefore} after=${xdrAfter.payload.status}`)
    console.log(`[negatives] XDR provenance before=${xdrProvenanceBefore}`)
    console.log(`[negatives] XDR provenance after=${JSON.stringify(draftProvenance(xdrAfter))}`)
    console.log(`[negatives] revisions before=${revisionsBefore.count} after=${revisionsAfter.count}`)

    expect(shaOf(vpdfAfter), 'the SAID document must be untouched').toBe(vpdfShaBefore)
    expect(xdrAfter.payload.status).toBe(xdrStatusBefore)
    expect(JSON.stringify(draftProvenance(xdrAfter))).toBe(xdrProvenanceBefore)
    expect(revisionsAfter.count).toBe(revisionsBefore.count)
  })

  test('B4: the stale-lock leg — a pending chat proposal, then a direct save, then Accept stops with the reload message and NO second revision', async ({ page }) => {
    const { xdrId } = fixtures()
    const before = await getRecordEnvelope(xdrId)
    const revisionsBefore = await revisionCount(xdrId)

    // Writer A opens the panel and stages a proposal against the CURRENT sha.
    await openReview(page)
    await expect(page.getByTestId('review-ai-panel')).toBeVisible({ timeout: 15000 })
    const turn = 'reword the label of step-lyse to "Chat label (writer A)"'
    console.log(`[B4 turn] ${turn}`)
    await sendChat(page, turn)
    const apply = page.getByTestId('changes-apply')
    await expect(apply).toBeVisible({ timeout: 120000 })

    // Writer B saves directly while the proposal is pending — the panel's
    // lock token is now stale (the two-tab race, headless twin).
    const payload = structuredClone(before.payload)
    payload.candidates[0].draft.steps[0].label = 'Direct-saved label (writer B)'
    const direct = await apiPut(`/records/${xdrId}`, {
      payload,
      message: 'W2-9 gate spec: direct save (writer B) to force the stale lock',
      expectedSha: shaOf(before),
    })
    expect(direct.status, 'the direct save must succeed').toBe(200)

    // Writer A's Accept STOPS with the reload message (verbatim), no retry.
    await apply.click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('reload', { timeout: 30000 })
    await page.screenshot({ path: 'receipts/w29-b4-stale-lock.png', fullPage: true })

    const revisionsAfter = await revisionCount(xdrId)
    console.log(`[B4] revisions before=${revisionsBefore.count} after the failed accept=${revisionsAfter.count}`)
    expect(revisionsAfter.count, 'the failed accept must add NO revision').toBe(revisionsBefore.count)
  })

  test('B7: the /settings semantic-pass override persists and leaves unrelated model settings untouched', async ({ page }) => {
    const configBefore = await apiGet('/config')
    expect(configBefore.status).toBe(200)
    console.log(`[B7 config before] ${JSON.stringify(configBefore.body?.ai)}`)

    await page.goto(`${BASE_URL}/settings`)
    await page.waitForLoadState('networkidle')
    const section = page.getByTestId('semantic-pass-model-section')
    await expect(section).toBeVisible({ timeout: 15000 })
    // The disclosure names the honest scope (bait 9).
    await expect(page.getByTestId('semantic-pass-disclosure')).toContainText('semantic pass ONLY')
    await page.screenshot({ path: 'receipts/w29-b7-settings-before.png', fullPage: true })

    await page.getByTestId('semantic-pass-edit').click()
    const modelInput = page.getByPlaceholder('model-name')
    await modelInput.fill('w29-gate-semantic-pass-model')
    await page.getByTestId('semantic-pass-save').click()
    await expect(page.getByTestId('semantic-pass-current-model')).toContainText('w29-gate-semantic-pass-model', { timeout: 20000 })
    await page.screenshot({ path: 'receipts/w29-b7-settings-after.png', fullPage: true })

    const configAfter = await apiGet('/config')
    expect(configAfter.status).toBe(200)
    console.log(`[B7 config after] ${JSON.stringify(configAfter.body?.ai)}`)

    // Persisted to config data...
    expect(JSON.stringify(configAfter.body?.ai?.semanticPass)).toContain('w29-gate-semantic-pass-model')
    // ...without touching the unrelated model settings (activeProfile /
    // inference / profiles ride byte-identical).
    expect(configAfter.body?.ai?.activeProfile).toEqual(configBefore.body?.ai?.activeProfile)
    expect(JSON.stringify(configAfter.body?.ai?.inference)).toEqual(JSON.stringify(configBefore.body?.ai?.inference))
    expect(JSON.stringify(configAfter.body?.ai?.profiles)).toEqual(JSON.stringify(configBefore.body?.ai?.profiles))
  })
})
