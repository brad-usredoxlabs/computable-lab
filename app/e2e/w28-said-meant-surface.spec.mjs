/**
 * W2-8 SAID/MEANT SURFACE — CHECKED-IN GATE SPEC (spec §3 W5, §6.2, F-W28-5).
 *
 * Runs ONLY against a stack the orchestrator started (never started by the
 * coder): BASE_URL (app, default http://localhost:5193) + API_URL (server,
 * default http://localhost:3093, health at /api/health) — gate-pbch6.spec.mjs
 * precedent. Receipts (screenshots + pasted GET bodies) land under receipts/.
 *
 * SELF-CONTAINMENT (F-W28-5): this spec seeds its OWN data from checked-in
 * fixtures beside it — NO reliance on any pre-existing VPDF/VPC/XDR seed:
 *   fixtures/w28-said-meant/said.pdf  — a 2-page PDF (sha256 5256f3288e3c...)
 *     -> seeded via POST /api/vendors/graph-lemur/pdfs/upload (the lane's
 *        vendor-pdf upload path), content-addressed id VPDF-5256F3288E3C.
 *   fixtures/w28-said-meant/xdr.json  — the semantic draft (MEANT),
 *     -> seeded via POST /api/records with the merged extraction-draft schema;
 *        fixed recordId XDR-w28-gate0001.
 * Both seeding legs are IDEMPOTENT: the upload handler skips an existing
 * content-addressed record; the XDR leg GETs first and creates only on 404.
 * The VPDF leg backfills extractedText (pages 1-2) via PUT+expectedSha only
 * when absent, so the anchor-jump target [data-vpdf-page="2"] exists even if
 * pdfjs cannot render in the reviewer's browser.
 *
 * NOTE on the SAID candidate (VPC) record: the wave-2 composition is driven by
 * the XDR join (source_artifact.id === the route's VPDF id), so the gate seeds
 * VPDF + XDR only. The SAID candidate pane (SaidFactsPane over a CAN-*) is
 * exercised in the unit layer (VendorPdfReviewPage.wave2.test.tsx); the gate's
 * A1 leg probes the route's left-pane controls and the VPDF sha directly.
 * A5's realization-entry flow (run workspace -> localization -> accept -> LPR
 * branch_resolution) is the reviewer's manual leg (spec §6.2 step 6); this
 * spec carries its DATA precondition (branch_axes verbatim on the XDR).
 *
 * Vitest posture: like every app/e2e/*.spec.* gate file in this repo, this
 * .mjs is collected by vitest with NO runnable tests (Playwright's test() is
 * not a vitest suite) and is executed only by the Playwright gate runner
 * (`npx playwright test`). It lives under e2e/, never under src/.
 */
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5193'
const API_URL = process.env.API_URL ?? 'http://localhost:3093'
const API = `${API_URL}/api`
const USER_ID = process.env.CL_GATE_USER_ID ?? 'USR-BRAD'

// FIXTURES ARE LOADED LAZILY (inside the legs, never at module top level):
// vitest collects every app/e2e/*.spec.* file and Playwright's test() is not a
// vitest suite, so collection must stay side-effect-free — the fixture reads
// only ever run under the Playwright gate runner, where import.meta.url is a
// real file URL.
function fixtureText(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/w28-said-meant/${name}`, import.meta.url)), 'utf8')
}
function fixtureBytes(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/w28-said-meant/${name}`, import.meta.url)))
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
    // Content-addressed: the sha256 of the checked-in said.pdf pins the id.
    vpdfId: `VPDF-${pdfSha.slice(0, 12).toUpperCase()}`, // VPDF-5256F3288E3C
    xdrId: xdrFixture.recordId, // XDR-w28-gate0001
    xdrFixture,
  }
  return seeded
}

const headers = {
  'Content-Type': 'application/json',
  'x-user-id': USER_ID,
}

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

async function seedVpdf() {
  const { pdfBytes, vpdfId: VPDF_ID } = fixtures()
  // Idempotent upload leg: content-addressed — re-running never duplicates.
  const res = await apiPost('/vendors/graph-lemur/pdfs/upload', {
    contentBase64: pdfBytes.toString('base64'),
    fileName: 'w28-gate-said.pdf',
    title: 'W2-8 gate SAID fixture',
  })
  if (res.status !== 200) {
    throw new Error(`VPDF seeding upload -> ${res.status}: ${JSON.stringify(res.body)}`)
  }
  // W2-8-FIX2 D2 response honesty: a 200 whose record create failed must not
  // be treated as a durable seed.
  if (res.body?.recordWriteError) {
    throw new Error(`VPDF seeding upload wrote bytes but the record create failed: ${res.body.recordWriteError}`)
  }
  const envelope = await getRecordEnvelope(VPDF_ID)
  const payload = envelope.payload
  const text = Array.isArray(payload.extractedText) ? payload.extractedText : []
  if (text.length === 0) {
    // Backfill per-page text so the plain-text fallback carries
    // [data-vpdf-page="2"] — the anchor-jump target — even without pdfjs.
    const sha = envelope.meta?.contentSha ?? envelope.meta?.commitSha
    if (!sha) throw new Error(`VPDF ${VPDF_ID} has no contentSha to update against`)
    const put = await apiPut(`/records/${VPDF_ID}`, {
      payload: {
        ...payload,
        extractedText: [
          { pageNumber: 1, text: 'W2-8 gate fixture - SAID page one: kit overview.' },
          { pageNumber: 2, text: 'W2-8 gate fixture - SAID page two: sample prep.' },
        ],
      },
      message: 'W2-8 gate spec: backfill extractedText for the anchor-jump leg',
      expectedSha: sha,
    })
    if (put.status !== 200) {
      throw new Error(`VPDF extractedText backfill -> ${put.status}: ${JSON.stringify(put.body)}`)
    }
  }
  return envelope
}

async function seedXdr() {
  const { xdrId: XDR_ID, xdrFixture } = fixtures()
  const existing = await apiGet(`/records/${encodeURIComponent(XDR_ID)}`)
  if (existing.status === 200 && existing.body?.record) return existing.body.record
  const res = await apiPost('/records', {
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
    payload: xdrFixture,
    message: 'W2-8 gate spec: seed the MEANT semantic draft from the checked-in fixture',
  })
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`XDR seeding -> ${res.status}: ${JSON.stringify(res.body)}`)
  }
  return getRecordEnvelope(XDR_ID)
}

async function openReview(page, path = '') {
  const { vpdfId: VPDF_ID } = fixtures()
  await page.goto(`${BASE_URL}/`)
  await page.evaluate(() => window.localStorage.setItem('cl.currentUserId', 'USR-BRAD'))
  await page.goto(`${BASE_URL}/ingestion/vendor-pdf/${VPDF_ID}${path}`)
  await page.waitForLoadState('networkidle')
}

test.describe('W2-8 SAID/MEANT surface gate', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    // Health prechecks first: the spec runs only against a live stack.
    const apiHealth = await fetch(`${API}/health`).then((r) => r.status)
    expect(apiHealth, `${API}/health must be 200`).toBe(200)
    const appHealth = await fetch(`${BASE_URL}/`).then((r) => r.status)
    expect(appHealth, `${BASE_URL}/ must serve`).toBe(200)
    await seedVpdf()
    await seedXdr()
  })

  test('PRECHECK: stack health + seeded records', async () => {
    const { vpdfId: VPDF_ID, xdrId: XDR_ID, pdfSha } = fixtures()
    const vpdf = await getRecordEnvelope(VPDF_ID)
    expect(vpdf.payload.kind).toBe('vendor-pdf')
    const xdr = await getRecordEnvelope(XDR_ID)
    expect(xdr.payload.kind).toBe('extraction-draft')
    expect(xdr.payload.source_artifact.id).toBe(VPDF_ID)
    console.log(`[seed] ${VPDF_ID} + ${XDR_ID} present (fixture sha ${pdfSha.slice(0, 12)})`)
  })

  test('A4+A6: wave-2 render — all branches visible, no literal completion, no extraction-time questions', async ({ page }) => {
    await openReview(page)
    const panel = page.getByTestId('semantic-draft-panel')
    await expect(panel).toBeVisible({ timeout: 15000 })

    // A4: every branch/variant step of the family is listed unfiltered.
    await expect(page.getByTestId('semantic-draft-evidence')).toBeVisible()
    for (const label of ['Lyse samples', 'Lyse (variant a)', 'Lyse (variant b)']) {
      await expect(panel.getByText(label, { exact: false }).first()).toBeVisible()
    }
    // The family's questions render as DATA (asking lives at the realization entry).
    const axes = page.getByTestId('semantic-draft-branch-axes')
    await expect(axes).toBeVisible()
    await expect(axes.getByText('Which lysis method?')).toBeVisible()
    await expect(axes.getByText('Bead beater')).toBeVisible()
    await expect(axes.getByText('Freeze-thaw')).toBeVisible()

    // A6: no literal-step completion affordance anywhere on the route.
    for (const testid of ['vpdf-save', 'vpdf-save-as', 'vpdf-save-actions', 'vpdf-use-extracted', 'vpdf-saveas-modal']) {
      await expect(page.getByTestId(testid)).toHaveCount(0)
    }
    // A4: no extraction-time question machinery on the route.
    for (const testid of ['branch-questions', 'branch-questions-unbuilt', 'vpdf-tree-select']) {
      await expect(page.getByTestId(testid)).toHaveCount(0)
    }
    await page.screenshot({ path: 'receipts/w28-a4-a6-wave2-route.png', fullPage: true })
  })

  test('A2: semantic-evidence chip jumps the SAID pane to [data-vpdf-page=2]', async ({ page }) => {
    await openReview(page)
    const chip = page.getByTestId('semantic-evidence-step-lyse')
    await expect(chip).toBeVisible({ timeout: 15000 })
    const target = page.locator('[data-vpdf-page="2"]')
    await expect(target.first()).toBeAttached({ timeout: 15000 })
    await chip.click()
    // The jump machinery scrolls the page-2 block into the viewport.
    await expect
      .poll(async () =>
        target
          .first()
          .evaluate((el) => {
            const r = el.getBoundingClientRect()
            return r.top < window.innerHeight && r.bottom > 0
          })
          .catch(() => false),
        { timeout: 10000 },
      )
      .toBe(true)
    await page.screenshot({ path: 'receipts/w28-a2-anchor-jump.png', fullPage: true })
  })

  test('A1: the SAID is immutable — probing every left-pane control leaves the VPDF sha unchanged', async ({ page }) => {
    const { vpdfId: VPDF_ID } = fixtures()
    const before = await getRecordEnvelope(VPDF_ID)
    const shaBefore = before.meta?.contentSha ?? before.meta?.commitSha
    expect(shaBefore, 'seeded VPDF must carry a contentSha').toBeTruthy()

    await openReview(page)
    await expect(page.getByTestId('semantic-draft-panel')).toBeVisible({ timeout: 15000 })

    // No editable controls over the SAID pane.
    const editable = await page.locator('.vpdf-review__left input, .vpdf-review__left textarea, .vpdf-review__left [contenteditable]').count()
    expect(editable, 'left pane must expose zero editable controls').toBe(0)

    // Poke every control the left pane offers (zoom, view toggles, anchors).
    const buttons = page.locator('.vpdf-review__left button')
    const count = await buttons.count()
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click({ force: true }).catch(() => undefined)
    }

    const after = await getRecordEnvelope(VPDF_ID)
    const shaAfter = after.meta?.contentSha ?? after.meta?.commitSha
    console.log(`[A1] VPDF sha before=${shaBefore} after=${shaAfter}`)
    expect(shaAfter, 'no left-pane control may mutate the SAID record').toBe(shaBefore)
    await page.screenshot({ path: 'receipts/w28-a1-said-immutable.png', fullPage: true })
  })

  test('A3: a MEANT edit saves atomically, survives reload, and provenance survives byte-equal', async ({ page }) => {
    const { xdrId: XDR_ID } = fixtures()

    const before = await getRecordEnvelope(XDR_ID)
    const shaBefore = before.meta?.contentSha ?? before.meta?.commitSha
    expect(shaBefore, 'seeded XDR must carry a contentSha (the human lock)').toBeTruthy()
    const draftBefore = before.payload.candidates[0].draft
    const provenanceBefore = JSON.parse(JSON.stringify(draftBefore.steps.map((s) => s.intent?.provenance ?? null)))
    // Idempotent-safe: a re-run over an already-edited record must still pick
    // a value DIFFERENT from the current one, or the edit would be a no-op
    // and the save would never dirty. Appending guarantees difference.
    const EDITED_TITLE = `${draftBefore.title} EDITED`

    await openReview(page)
    const editor = page.locator('.semantic-draft__taptab [contenteditable="true"]').first()
    await expect(editor, 'the MEANT editor must mount (TapTab projection)').toBeVisible({ timeout: 20000 })

    // Edit ONLY the title via the product's FieldRow edit path: click the
    // value -> inline input -> commit. (Typing into the outer ProseMirror
    // doc can never mutate it by design: fieldRow is an atom NodeView and
    // the section content model is `sectionHeading fieldRow+` — no text
    // positions. The interactive widget path is click-to-edit, the same one
    // BudgetDocumentSurface and the registry surfaces use.)
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
    await expect(note, 'Save must report Saved (a no-op here means the edit never serialized)')
      .toContainText('Saved', { timeout: 15000 })

    // Hard reload: the value must come back from the server.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('semantic-draft-panel')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('semantic-draft-panel').getByText(EDITED_TITLE, { exact: false }).first()).toBeVisible()

    // GET the XDR: the edit landed, provenance is byte-equal, a revision exists.
    const after = await getRecordEnvelope(XDR_ID)
    const draftAfter = after.payload.candidates[0].draft
    // W2-8-FIX2 D1: the save must not mint junk keys. Wildcard projection
    // hints ($.steps[*]...) are display-only; serializing them back used to
    // add literal `steps[*]`/`version: null` keys to the draft (the trunk
    // save polluted candidates[0].draft). The key set may only ever shrink
    // or stay identical — a save must never invent addressable fields.
    const junkBefore = Object.keys(draftBefore).filter((k) => k.includes('[*]')).sort()
    const junkAfter = Object.keys(draftAfter).filter((k) => k.includes('[*]')).sort()
    expect(junkAfter, 'the save must not mint wildcard-hint keys into the draft').toEqual(junkBefore)
    const newKeys = Object.keys(draftAfter).filter((k) => !(k in draftBefore))
    expect(newKeys, 'the save must not add keys the draft did not already have').toEqual([])
    const provenanceAfter = draftAfter.steps.map((s) => s.intent?.provenance ?? null)
    console.log('[A3] GET /records/XDR-w28-gate0001 title before/after:', draftBefore.title, '->', draftAfter.title)
    expect(draftAfter.title, 'the edited title must persist server-side').toBe(EDITED_TITLE)
    expect(JSON.stringify(provenanceAfter), 'intent.provenance must survive the edit byte-equal').toBe(
      JSON.stringify(provenanceBefore),
    )
    expect(after.payload.source_artifact).toEqual(before.payload.source_artifact)
    expect(after.payload.candidates[0].target_kind).toBe(before.payload.candidates[0].target_kind)
    expect(after.meta?.contentSha ?? after.meta?.commitSha, 'the save must move the contentSha').not.toBe(shaBefore)

    const revisions = await apiGet(`/records/${encodeURIComponent(XDR_ID)}/revisions`)
    expect(revisions.status, 'GET /records/:XDR/revisions').toBe(200)
    const revisionRecords = revisions.body?.records ?? []
    console.log('[A3] GET /records/XDR-w28-gate0001/revisions ->', JSON.stringify(revisionRecords.map((r) => r.recordId ?? r)))
    expect(revisionRecords.length, 'the edit must capture at least one revision (revisionOnEditKinds)').toBeGreaterThanOrEqual(1)

    await page.screenshot({ path: 'receipts/w28-a3-edit-survives-reload.png', fullPage: true })
  })

  test('A5 (data precondition): the family questions ride the XDR verbatim for the realization entry', async () => {
    const { xdrId: XDR_ID } = fixtures()
    const xdr = await getRecordEnvelope(XDR_ID)
    const axes = xdr.payload.candidates[0].draft.branch_axes ?? []
    console.log('[A5] branch_axes on', XDR_ID, JSON.stringify(axes))
    expect(axes.length).toBeGreaterThanOrEqual(1)
    expect(axes[0].axisId).toBe('lysis-method')
    expect(axes[0].conditions.map((c) => c.id)).toEqual(['bead-beater', 'freeze-thaw'])
    // The full realization-entry receipt (run workspace -> localization ->
    // answer -> accept -> GET the LPR shows branch_resolution) is the
    // reviewer's manual leg per spec §6.2 step 6.
  })
})
