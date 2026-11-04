/**
 * CARD1-FIX4 D1 (advc c10) — the Q1 mint-seed pin must be bound to the REAL
 * server-emitted shape, not a hand-built fixture (which the brief disqualifies).
 *
 * The pre-fix mintseed pin hand-built `clofibrateRequest` (query: '1 mM
 * clofibrate in dmso' — even the case was wrong: the REAL builder folds to
 * '1 mm clofibrate in dmso'). This pin drives the REAL builder instead:
 *   server/src/ai/shorthandChat.ts `clarificationsFromUnresolvedFacts` is the
 *   shipped function that turns a ScientistIntentUnresolvedFact into the
 *   on-wire AiClarificationRequest (shorthandChat.ts:873). It is loaded via the
 *   sanctioned NON-LITERAL dynamic import (reloadBoundary:164 pattern) so the
 *   server type graph never enters the app tsc program (10-line baseline).
 *
 * THE PIN: on the REAL emitted payload, the exact string the picker posts to
 * apiClient.mintLocalTerm (handleMintRow posts mintLabel.trim(), and mintLabel =
 * mintLabelFor(request, seedNoun)) is the RAW model label
 * (unresolvedFact.label, human case), NOT the canonical folded query. This is
 * what ruling l2t1951 Q1 forbids inverting (feeding the D3 fold back as the
 * durable title).
 *
 * node env is REQUIRED: the builder's canonical-label policy loader uses
 * import.meta.url, which is not a real file path under the jsdom dev-server
 * (it breaks), and the vocabulary resolves off process.cwd(). So this test
 * runs under node with cwd=server/ (restored in finally), mirroring the D4
 * real-drop test.
 *
 * RED proof (pre-fix seed): the pre-fix mintLabelFor was
 *   `return mintNounFromQuery(request.query) || query.trim()`
 * — it seeded the mint input from request.query (the FOLDED form). Swapping
 * that body back in makes this pin's `toBe(<raw label>)` fail (it returns the
 * folded/derived form instead), proving the pin is bound to the raw-label seed,
 * not a vacuous assertion. The mutation is restored immediately.
 */
// @vitest-environment node
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintLabelFor } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'

const realCwd = process.cwd
const REPO_ROOT = resolve(realCwd(), '..') // vitest cwd = <repo>/app
const SERVER_DIR = resolve(REPO_ROOT, 'server')

describe('CARD1-FIX4 D1 — the Q1 mint-seed pin is bound to the REAL server-emitted shape', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('the REAL builder emits a raw-label / folded-query payload and the REAL mintLabelFor returns the raw label (not the fold)', async () => {
    // cwd must point at server/ for the WHOLE body (vocabulary resolves off
    // process.cwd() at the first builder call; server/schema -> repo schema/).
    // Restored in the finally (guaranteed even on a throwing import).
    process.cwd = () => SERVER_DIR
    try {
      const { clarificationsFromUnresolvedFacts } = await import(/* @vite-ignore */ '../../../../../server/src/ai/' + 'shorthandChat')
      // THE human-case fact: the raw model-extracted label in HUMAN case. (A
      // lowercase label would make raw == fold and the pin vacuous — the shipped
      // fixture 'mystery goop' is lowercase, so a HUMAN-case label is mandatory
      // for the raw-vs-fold distinction the pin exists to catch.)
      const fact = {
        label: '1 mM Clofibrate in DMSO',
        reason: 'the lab spine could not bind the noun (unbound)',
        actionLocation: { action: 'add_material', argument: 'material' },
      }
      const [req] = clarificationsFromUnresolvedFacts([fact]) as unknown as AiClarificationRequest[]

      // THE real emitted shape (byte-accurate): the query is the CANONICAL
      // FOLDED form (identity key, '1 mm ... in dmso' — the D3 fold), while
      // unresolvedFact.label is the VERBATIM raw model label (human case).
      // These MUST differ — that asymmetry is what the mint seed must break in
      // favour of the raw label.
      expect(req.unresolvedFact?.label).toBe('1 mM Clofibrate in DMSO') // raw
      expect(req.query).toBe('1 mm clofibrate in dmso') // folded (note: 1 mm, not 1 mM)
      expect(req.query).not.toBe(req.unresolvedFact?.label) // raw != fold
      expect(req.menuProvider).toBe('/m')
      expect(req.allowCreateLocal).toBe(true)
      expect(req.id).toMatch(/^unresolved-c-[0-9a-f]{10}$/) // content-keyed, canonical-stable

      // THE PIN: the exact string the picker posts to apiClient.mintLocalTerm
      // (handleMintRow -> mintLabel.trim(); mintLabel = mintLabelFor(request,
      // seedNoun)) is the RAW model label. Post-fix mintLabelFor reads
      // unresolvedFact.label FIRST (the client selects the raw field; it never
      // transforms case). Pre-fix it seeded from request.query (the fold).
      // The app mirror type declares query? optional (types.ts:263); the REAL
      // builder always stamps it (the folded identity key), so narrow it.
      const foldedQuery: string =
        typeof req.query === 'string' ? req.query : ('' as string)
      expect(foldedQuery).toBe('1 mm clofibrate in dmso')
      const posted = mintLabelFor(req, foldedQuery)
      expect(posted).toBe('1 mM Clofibrate in DMSO') // the raw model label
      expect(posted).not.toBe(foldedQuery) // NOT the folded query

      // Guard the payload is genuinely the wire shape the picker consumes
      // (kind/entityType ride the real builder too — a hand-built guess would
      // have had to invent these).
      expect(req.kind).toBe('material')
      expect(req.entityType).toBe('material')
      expect(Array.isArray(req.options)).toBe(true)
    } finally {
      process.cwd = realCwd
    }
  })
})
