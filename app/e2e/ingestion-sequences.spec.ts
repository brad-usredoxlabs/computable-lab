import { test, expect } from '@playwright/test'

/**
 * ISEQ-2 headline end-to-end (spec §4a): the biologist story against the REAL
 * lane stack — search "16S F Prausnitzi" (verbatim typo; the wildcard
 * correction IS the product claim, ISEQ-1 §3.2) in the Sequences ingestion
 * tab, import the canonical RefSeq hit through the EXISTING
 * POST /sequences/actions {operation:'save_sequence'} path, and review the
 * record in /lab/sequences.
 *
 * LIVE-NCBI POLICY: this is the ONE e2e allowed to hit NCBI live. NO
 * page.route stubbing of /api/biosource/** or /api/sequences/** — mocking the
 * backend here would make it a fake headline (sequence-chat-scroll.spec.ts's
 * route mocking is that spec's pattern, NOT this one's).
 *
 * Run ONLY as:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test ingestion-sequences --project=chromium
 * (from app/). The config default baseURL is :5174 — Brad's MAIN stack; a
 * write-doing e2e against it is sev-1.
 *
 * Identity: bare browser → the server's local-admin fallback
 * (LocalIdentityService.ensureLocalAdminUser); the §5 pre-flight catalog curl
 * on the lane stack returned 200 unauthenticated, so no addInitScript identity
 * is needed. If that ever 401s, the honest fix is addInitScript with the REAL
 * seeded lane user (cl.currentUserId), never product auth code.
 *
 * Record ids are requestId-seeded content hashes (SequenceService save_sequence)
 * — every run creates a NEW SEQ- id. The spec CAPTURES the id from the import
 * message and asserts exactly that id; no count-based assertions anywhere.
 */

test.use({
  viewport: { width: 1440, height: 900 },
  ...(process.env.CL_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CL_CHROMIUM_PATH } } : {}),
})

test('search 16S F Prausnitzi -> import canonical RefSeq -> record reviewable in /lab/sequences', async ({ page }) => {
  // Two-pass esearch + esummary + efetch over the wire plus the save round-trip;
  // the config's 30 s per-test default is too tight for the live leg.
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  // 1. The Sequences ingestion tab renders (merged IngestionPage routes
  //    /ingestion/:tab; SequenceSearch mounts under data-testid=sequence-search).
  await page.goto('/ingestion/sequences')
  await expect(page.getByTestId('sequence-search')).toBeVisible()

  // 2. The verbatim typo query — tolerance is the product claim.
  await page.getByTestId('sequence-query-input').fill('16S F Prausnitzi')
  const searchStart = Date.now()
  await page.getByTestId('sequence-search-button').click()

  // 3. Canonical RefSeq card pins NR_028961 (>=30 s: live two-pass esearch+esummary).
  const canonical = page.getByTestId('sequence-canonical')
  await expect(canonical).toContainText('NR_028961', { timeout: 30_000 })
  await expect(canonical).toContainText('16S ribosomal RNA')
  const searchMs = Date.now() - searchStart
  console.log(`[iseq2] live NCBI search round-trip: ${searchMs} ms`)

  // Rate pacing (NOT a stub): the merged search tool already spends 3 keyless
  // E-utilities calls (refseq-pass esearch + general esearch + esummary);
  // NCBI's keyless limit is 3 req/s, so the import's efetch must land in the
  // NEXT window or NCBI 429s it (observed twice: 502 UPSTREAM_ERROR HTTP 429).
  await page.waitForTimeout(1500)

  // 4. Import through the EXISTING save_sequence path; capture the NEW recordId.
  const importStart = Date.now()
  await canonical.getByTestId('sequence-import-button').click()
  const imported = page.getByTestId('sequence-imported')
  await expect(imported).toContainText('SEQ-', { timeout: 30_000 })
  const importMs = Date.now() - importStart
  const importedText = (await imported.textContent()) ?? ''
  const match = importedText.match(/SEQ-[0-9a-f]+/)
  expect(match, `import message must carry a SEQ- record id, got: ${importedText}`).not.toBeNull()
  const recordId = match![0]
  console.log(`[iseq2] import round-trip: ${importMs} ms, captured recordId: ${recordId}`)

  // 5. The new affordance: the imported id links into the deep link.
  const openLink = page.getByTestId('sequence-imported-link')
  await expect(openLink).toHaveAttribute('href', `/lab/sequences?record=${recordId}`)

  // 6. "Record appears" per the verbatim criterion: it is reviewable in the
  //    /lab/sequences Library. Selector authority is the MERGED code:
  //    SequenceSearch.tsx:85 labels the record with the canonical TITLE
  //    ("...16S ribosomal RNA, partial sequence"), and the Library filter
  //    (SequencesPage.tsx) matches `${label} ${recordId}` — the accession is
  //    NOT in the label, so the searchable handle is the CAPTURED recordId
  //    (stronger than the accession: it is this run's new record).
  await page.goto('/lab/sequences')
  await page.getByLabel('Search sequences').fill(recordId)
  const libraryButton = page.locator('.sequence-library button', { hasText: '16S ribosomal RNA' })
  await expect(libraryButton.first()).toBeVisible()
  await expect(libraryButton.first()).toContainText('residues')
  await page.screenshot({ path: 'tmp/ingestion-sequences-record.png', fullPage: true })

  // 7. Deep-link leg: arriving with ?record=<captured id> selects the record in
  //    the editor (merged SequenceEditor loads /authoring/<id> into the residues
  //    textarea) with no error banner.
  await page.goto(`/lab/sequences?record=${recordId}`)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const residuesField = page.getByLabel('Sequence, 5′ → 3′')
  await expect(residuesField).toBeVisible()
  await expect
    .poll(async () => ((await residuesField.inputValue()) ?? '').length, { timeout: 15_000 })
    .toBeGreaterThan(0)

  expect(errors).toEqual([])
})
