# SHORTHAND-CORPUS — coder FIX report (lane 2, cycle 2, l2t0930)

Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-CORPUS-lane2-l2t0715
Branch: cl/SHORTHAND-CORPUS-lane2-l2t0715
Cycle-2 commit: 3e24cd91 (base 93131a54, c1 tip; c1 base e354abd6)
Cycle-2 range: git -c core.fileMode=false diff 93131a54..HEAD — 4 files, +313/-67:
  app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx
  app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx
  server/scripts/corpus-replay.ts
  NEW server/src/corpus/corpusReplayLive.test.ts
Review addressed: /home/brad/.hermes/cl/lanes/2/reviews/advc-SHORTHANDCORPUS-c1-l2t0900.md (read in full).
No merges; trunk untouched; no lane-stack/:3001/:5174/:3093/:5193 touch; server/schema symlink kept.

## 0. Pins recaptured at 93131a54 BEFORE any change (raws /tmp/l2t0930-base-*)

```
cd server && npx tsc --noEmit | grep -c "error TS"        -> 19   (pin 19, MATCH)
cd app    && npx tsc --noEmit | grep -c "error TS"        -> 34   (pin 34, MATCH)
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts src/api/handlers/CorpusHandlers.test.ts
  -> Test Files 7 passed (7); Tests 51 passed (51)        (pin 7/51, MATCH)
cd app && npx vitest run AiTabPanel.chatCorpus.test.tsx ProtocolLocalizationThread.test.tsx ProtocolLocalizationThread.familyAxes.test.tsx
  -> Test Files 3 passed (3); Tests 16 passed (16)        (pin 3/16, MATCH)
git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
  -> 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35             (exact)
```

## 1. DEFECT-1 (major) — live replay path stripped the discriminator

### Mechanism confirmed first-hand at 93131a54 (throwaway probe /tmp/l2t0930/probeDefect1.ts, run via `cd server && npx tsx`):

```
KERNEL body keys      : source,sourceType,prompt,acceptedGraph,confirmedBy,confirmedAt,corrections,modelMetadata,intentShapeVersion,shorthand,shorthandVersion
c1 LIVE wire body keys: source,sourceType,prompt,acceptedGraph,confirmedBy,confirmedAt,corrections,modelMetadata
wire has shorthand        : false
wire has intentShapeVersion: false
wire has shorthandVersion : false
```
Reproduces the reviewer's probe exactly: the c1 CLI poster `postCorpusEntry(body as CorpusEntryInput, config)` re-derives the wire body through buildCorpusEntry's fixed field list (CorpusClient.ts:138-159), dropping shorthand + intentShapeVersion + shorthandVersion.

### RED evidence (fails at 93131a54, passes after)

New acceptance test `server/src/corpus/corpusReplayLive.test.ts` (4 tests) imports the CLI's live poster. At 93131a54 the CLI had no exported poster AND its script body ran on import:

```
cd server && git stash push -- scripts/corpus-replay.ts   # restore c1 CLI
cd server && npx vitest run src/corpus/corpusReplayLive.test.ts
 FAIL  src/corpus/corpusReplayLive.test.ts [ src/corpus/corpusReplayLive.test.ts ]
Error: process.exit unexpectedly called with "2"
 ❯ scripts/corpus-replay.ts:42:11
 Test Files  1 failed (1)
      Tests  no tests
```
(The import-time process.exit is itself proof the c1 CLI was untestable at the live seam — the coverage gap the reviewer flagged. With the module present but the c1 wiring, the probe above shows the wire body loses the discriminator.)

### Fix (server/scripts/corpus-replay.ts only — CorpusClient.ts stays FROZEN)

- New exported `postReplayBodyVerbatim(body, config, fetchFn = fetch)`: POSTs the kernel-produced body VERBATIM to `${config.serviceBaseUrl}/corpus/entries` (same URL/headers/5s timeout as CorpusClient), gated by `resolveCorpusConfig` exactly as before. Response contract mirrors postCorpusEntry exactly: `{ok, entryId?, deduped?, error?}`, `corpus.disabled` when disabled, `http_NNN` on bad status, never throws.
- Script body guarded by an `invokedAsScript` check (`process.argv[1]` matches corpus-replay.*), so the test can import the poster without argv parsing / process.exit. CLI behaviour, output lines, and exit codes (0/1/2) unchanged.
- Kernel (src/corpus/corpusReplay.ts) untouched: still pure, poster still injected.

### Reasoning for verbatim (why NOT keeping discriminator-free lines flowing through postCorpusEntry)

Anonymization is NOT a reason to re-derive: every entry the lane writes to the local JSONL (captureShorthandPairToLocal / captureSurfaceContextPairToLocal / captureAnalysisCorpusPair) is ALREADY buildCorpusEntry output — anonymized at capture time by design (shorthandCorpus.ts:63 calls buildCorpusEntry; surfaceContextCorpus.ts:57 likewise). Re-anonymizing at replay is a no-op for them, and the re-derivation is precisely what strips the new fields. So BOTH branches (discriminator-carrying and discriminator-free) flow verbatim through the single poster — no branch fork in the CLI. The byte-identity of the discriminator-free branch vs postCorpusEntry is pinned by test (below), so "no behavior change for old lines" is proven, not assumed.

### GREEN + wire-level proof

```
cd server && npx vitest run src/corpus/corpusReplayLive.test.ts
 ✓ src/corpus/corpusReplayLive.test.ts  (4 tests) 125ms
 Test Files 1 passed (1); Tests 4 passed (4)
```
Tests pin: (1) shorthand entry's wire body BYTE-IDENTICAL to the captured entry (`seen[0].body === JSON.stringify(entry)`) with shorthand/intentShapeVersion/shorthandVersion on the wire; (2) discriminator-free entry's wire body BYTE-IDENTICAL to what postCorpusEntry would have sent (same bytes, same URL, side-by-side fake fetches); (3) response contract: corpus.disabled / http_500 / thrown fetch never throws / deduped passthrough; (4) replayCorpusJsonl driven by the CLI poster: mixed file posts lines 1+3 verbatim, reports line 2 with its line number.

End-to-end CLI live probe against a throwaway local sink (node http server on 127.0.0.1:18791, /tmp/l2t0930/fake-corpus-sink.mjs — NOT any lane port, NOT the corpus service):
```
CLA_CORPUS_ENABLED=true CLA_CORPUS_URL=http://127.0.0.1:18791 npx tsx scripts/corpus-replay.ts /tmp/l2t0930/mixed.jsonl
replay: 2 posted, 1 failure(s) -> http://127.0.0.1:18791
FAILED line 2: JSON parse failed (...)
live-mixed exit=1
sink-captured wire bodies:
 POST /corpus/entries | keys: source,sourceType,prompt,acceptedGraph,confirmedBy,confirmedAt,corrections,modelMetadata,intentShapeVersion,shorthand,shorthandVersion | has shorthand: true | intentShapeVersion: 1 | shorthandVersion: 0.1.0
 POST /corpus/entries | keys: source,sourceType,prompt,acceptedGraph,confirmedBy,corrections,modelMetadata   (historical line, byte-identical to its captured line)
```
CLI contract re-verified unchanged: dry-run byte-identical across runs (cmp), dry-run mixed prints historical line unchanged + reports line 2 + exit 1; live with corpus disabled -> `corpus.disabled` + exit 1; usage -> exit 2; unreadable file -> exit 2.

## 2. DEFECT-2 (minor) — corpus.disabled wording claimed a local capture

Fix (ProtocolLocalizationThread.tsx:477 region): the disabled branch now reads
`'Accepted — protocol saved; remote corpus disabled — pair forwarded to the server (local capture only if enabled).'`
— states the CONDITION (the server-side append fires only when CLA_CORPUS_LOCAL_PATH is set; the client cannot see that toggle per OQ2) instead of implying a completed capture. The ok branch and the failure branch keep their existing wording.

Test pinned the THREE-WAY wording exactly (toBe, not toContain):
- ok -> 'Accepted — protocol saved and added to training corpus.'
- corpus.disabled -> the new forwarded/conditional sentence; asserts NOT 'added to training corpus', NOT 'pair sent for local capture', NOT 'captured locally'.
- http_500 -> 'Accepted — protocol saved; training pair not posted (http_500).'

RED evidence: with the test updated first, the c1 component failed the exact-string pin:
```
+ Accepted — protocol saved; remote corpus disabled — pair sent for local capture.
 Test Files 1 failed (1); Tests 1 failed | 5 passed (6)
```
GREEN after the component fix: app owned suites 3 files / 16 tests green (familyAxes file untouched — its stubbed intentTrainingPair resolves ok:true -> the ok branch, byte-stable).

## 3. GREEN counts (head 3e24cd91)

```
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts src/api/handlers/CorpusHandlers.test.ts
 Test Files  8 passed (8)   Tests  55 passed (55)     (base 7/51 + 1 new file + 4 new tests)
cd app && npx vitest run AiTabPanel.chatCorpus.test.tsx ProtocolLocalizationThread.test.tsx ProtocolLocalizationThread.familyAxes.test.tsx
 Test Files  3 passed (3)   Tests  16 passed (16)
```

## 4. Non-regression pins base vs head(3e24cd91)

tsc + corpus/app-owned pins were recaptured at 93131a54 first-hand (§0). The FULL-suite base raws are the c1 coder's raws captured at e354abd6 (c1 base); the SET gate is evaluated base(e354abd6) -> head(3e24cd91), which spans both cycles and is the stronger check:

```
server tsc: 19 (at 93131a54) -> 19 (head); sorted SET diff vs base raw EMPTY (SERVER TSC SET IDENTICAL)
app tsc:    34 (at 93131a54) -> 34 (head); sorted SET diff EMPTY (APP TSC SET IDENTICAL)
app FULL vitest: e354abd6 raw: 52 failed | 267 passed (319), 74 failed tests, Errors 6
                 head:         52 failed | 268 passed (320), 74 failed tests, Errors 6
                 FAIL-file SET diff EMPTY (52 files = 21 e2e + 31 src) at both c1-head (93131a54, 268/320 per c1 raw) and cycle-2 head
                 — raws /tmp/l2t0715-base-app-vitest.raw, /tmp/l2t0930-head-app-vitest.raw
server scoped (src/ai src/compiler/scientistIntent): e354abd6 raw: 10 failed | 89 passed (99), 19 failed tests, Errors 2
                 head: 10 failed | 89 passed (99), 19 failed tests, Errors 2
                 FAIL-file SET diff EMPTY (10 files)
MANIFEST blob: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (unchanged at head)
```
Zero NEW failures, zero NEW tsc errors. (The c1 app-full raws were captured at 93131a54 by the c1 coder; head re-run matches the SET exactly.)

## 5. Frozen-path diff proof (git -c core.fileMode=false diff 93131a54..HEAD)

```
-- server/src/corpus/shorthandCorpus.ts server/src/compiler schema/ eventGraphPersistence.ts
   PreviewActionBar.tsx server/src/corpus/CorpusClient.ts surfaceContextCorpus.ts
   analysisCorpus.ts CorpusHandlers.ts server/src/ai server/src/corpus/corpusReplay.ts corpusReplay.test.ts
-> 0 files (EMPTY)
git diff --name-only 93131a54..HEAD | grep -E '\.(yaml|yml)$' -> NONE
```
Cycle-2 touches ONLY: scripts/corpus-replay.ts, NEW corpusReplayLive.test.ts, ProtocolLocalizationThread.tsx + its test file. exactOptionalPropertyTypes: poster returns conditional-spread results (`...(data.entryId !== undefined ? {entryId} : {})`), never undefined in an optional slot; standalone tsc of scripts/corpus-replay.ts with the project flags (strict, exactOptionalPropertyTypes, noUnchecked*, noUnused*) -> 0 errors (scripts/ is outside tsconfig include, same as golden-replay.ts precedent).

## 6. Assumptions / notes

- AS-L2T0930-1: verbatim POST for BOTH branches (no postCorpusEntry retained in the CLI) — justified in §1: capture-time anonymization already happened; byte-identity vs postCorpusEntry for old lines is test-pinned. CorpusClient.ts/postCorpusEntry behaviour for existing callers unchanged (frozen diff EMPTY).
- AS-L2T0930-2: the new test lives under src/corpus/ (vitest-collected) but imports the CLI from scripts/ — the only way to exercise the CLI's live wiring at test level; the script guard makes the import safe. tsconfig excludes **/*.test.ts, so the test file is not typechecked by the server pin (same as all test files); the CLI itself typechecks standalone (§5).
- WS5 (lane-stack CLA_CORPUS_LOCAL_PATH export) remains orchestrator-owned; the c1 patch block in SHORTHAND-CORPUS-report.wip-l2t0715.md §6 is unchanged and still applies. Browser gate 0->1 (WS6) unaffected by this fix — the DEFECT-1 fix matters when a live replay is run against the corpus service, not for the JSONL capture receipt.
- Throwaway artifacts under /tmp/l2t0930 only (probe, sink, raws); nothing outside the worktree was modified.

SHORTHAND-CORPUS-FIX DONE 3e24cd91
