# PB-CH-3 ADVERSARIAL RE-REVIEW — CYCLE 2 — lane 2 — reviewer l2t0140

Item: PB-CH-3 "One shared client executor — wake openSurface + accept-guarded useApplySessionDocument"
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357
Branch: PB-CH-3-lane2-l2t2357 @ HEAD 7aa1f794 (fix) on 6100d66c (code) + e6e87cd1 (report)
Base trunk 85a16976. Prior review: PB-CH-3-review-l2t0115.md (VERDICT: fix — D1 MEDIUM, D2 LOW, D3 LOW).
All diffs read with `git -c core.fileMode=false`. Reviewer ran every command below personally; no coder claim taken as evidence. No product file edited; nothing committed or merged.

VERDICT: accept

Defect count: 0 (D1, D2, D3 all CLOSED; the fix introduced no new defect).

---

## D1 (MEDIUM) — CLOSED

Rule: the dedup key must be consumed only by a delivery that actually validated + applied, so a
malformed first delivery of an identity cannot permanently suppress a corrected re-delivery.

(a) Malformed delivery does NOT consume the key.
- `app/src/shared/session/useWorkstateExecutor.ts:94` now calls `peekAcceptGuard(identity, seenKeys)`
  (check-only); `:97` `validateAcceptedWorkstate(body)`; malformed returns at `:101` with
  `MALFORMED_ACCEPTED_DOCUMENT` and NO record; `:104` `applyDocument(doc)`; `:105`
  `recordAcceptedApply(identity, seenKeys)` — record happens ONLY after validate+apply.
- `app/src/shared/session/workstateExecutor.ts:241-243` `peekAcceptGuard` = `seenKeys.has(key) ? 'duplicate' : 'fresh'`
  (never adds); `:247-249` `recordAcceptedApply` = the only `seenKeys.add`.
- Hook test `useWorkstateExecutor.test.tsx:406-431` is real and mutation-sensitive: delivery 1 malformed
  (SAME `IDENTITY_1`) asserts `ok:false` + `MALFORMED_ACCEPTED_DOCUMENT` + 0 putSession (`:410-414`);
  delivery 2 corrected SAME identity asserts `ok:true`, `kind:'replaced'`, exactly 1 putSession, tabs
  `['project:STU-1','run:RUN-7']` (`:418-423`); delivery 3 genuine repeat asserts `kind:'duplicate-ignored'`,
  still 1 putSession (`:426-430`). On the OLD impl delivery 2 would return `duplicate-ignored`/`ok:true` and
  line 420 (`expect(corrected.kind).toBe('replaced')`) would fail — assertion meaningful.
- Pure tests `workstateExecutor.test.ts:398-405` (repeated peek stays `fresh`, `seen.size===0` until record)
  and `:407-419` (failed path records nothing → same identity stays fresh → after success repeat is duplicate).

(b) Genuine repeat of a SUCCESSFULLY applied identity still duplicate-ignored with exactly ONE putSession.
- `useWorkstateExecutor.test.tsx:355-367` (`second apply of the same accept identity is duplicate-ignored:
  putSession STILL exactly once`) and the D1 test `:426-430`. Both green (see run 1).

(c) No new path lets an unattested/malformed doc into the store.
- Attestation check remains FIRST: `useWorkstateExecutor.ts:85-93` (before peek at `:94`), returns
  `ACCEPT_ATTESTATION_MISSING` with no record. Entry-point signature unchanged
  `applyAcceptedWorkstate(body, attestation, identity)` (`:48-52`). No raw `replaceState` re-exported; the
  source-text test (`workstateExecutor.test.ts:551-555`) still asserts no `putSession` / no `../api/client` /
  no `replaceState(`. Two-client harness still green (`useWorkstateExecutor.test.tsx:434-483`).
- Residual edge probed and dismissed: `recordAcceptedApply` runs after `applyDocument(doc)`; `applyDocument`
  is `useApplySessionDocument()` which calls `useOpenTabs()` (non-optional) — a missing provider throws at
  hook render, it cannot silently no-op-then-record. No new silent-consume path exists.

(d) Key format unchanged.
- `workstateExecutor.ts:251-253` `acceptGuardKey` = `` `${draftId}:${revision}:${reviewHash}` `` (unchanged).
- Pinned by `workstateExecutor.test.ts:435-439` `expect([...seen]).toEqual(['D-1:1:hash-aaa'])`.

## D2 (LOW) — CLOSED

Rule: direct pure-layer coverage of `validateAcceptedWorkstate`, and report claims corrected in place.

- Pure `describe('validateAcceptedWorkstate — pure-layer coverage ... (D2)')` at
  `workstateExecutor.test.ts:442-544`, 8 tests, all green:
  - version !== 1 → `:488-496` (code + path `body.sessionDocument` + message contains 'version')
  - missing tabs → `:498-505`
  - tab without a string kind (names tab index) → `:507-514`
  - non-object body (null/undefined/array/string/number) → `:468-477`
  - activeTabId null-vs-absent → `:516-533` (absent normalizes to explicit null, explicit null stays null, string preserved)
  - plus FLAT-body accept (`:449-466`), body-without-sessionDocument (`:479-486`), validate≠rebuild / no aliasing (`:535-543`).
- Report corrected in place (not deleted-evasive): fix diff on the report changes the §4 matrix row
  `malformed accept body diagnostic-only` from "(pure + hook)" to "(hook)" plus an explicit
  "CORRECTED: ... NO pure test existed (reviewer D2). Pure ... tests added in FIX RUN l2t0120" note, and the
  §4/OQ1 sentence now states the null-vs-absent pure test "did NOT exist at this writing". §10.2 documents the
  same. No claim was silently removed.

## D3 (LOW) — CLOSED

Rule: comment must match the type; focus must never deep-link; no `surface` field added; spec §1 type pinned.

- `workstateExecutor.ts:117-121` comment now reads: "the `focus` variant of Tier1ActionLike carries NO surface
  field (spec §1's verbatim type), so a focus action can NEVER deep-link — it is activate-existing-or-diagnostic
  only. A bare focus with no existing slot ends in the UNROUTABLE_SURFACE diagnostic".
- Type unchanged and surface-free: `workstateExecutor.ts:66-71` focus variant has only `target` (union of
  protocol-step / bare-ref), no `surface`. Matches spec §1 pinned type (spec lines 127).
- No behavior change: `planTier1Action` focus branch (`:124-139`) is byte-identical to the pre-fix commit (the
  fix commit's diff to `workstateExecutor.ts` is comment-only in this region plus the D1 guard split).

---

## Regression pass on the original 6 reviewer-bait traps (checked against the NEW diff)

1. Single writer — PASS. `grep -rn "replaceState(" app/src` (non-test) = exactly 2 sites, both in
   `useSessionSync.ts:58` and `:80`. Source-text test `workstateExecutor.test.ts:551-555` forbids
   `replaceState(`. Fix commit did NOT touch `useSessionSync.ts`.
2. No hunk at useSessionSync.ts:59-150 beyond §3 — PASS. `git diff 85a16976..HEAD -- useSessionSync.ts | grep "^@@"`
   = exactly 2 hunks (`@@ -18,7` import, `@@ -41,13` the §3 overload); none in :59-150. Fix commit file list
   does not include `useSessionSync.ts` (empty name-only for it).
3. Tier-1 non-destructive — PASS. Tier-1 reducer spy + ref-identity tests unchanged and green
   (`workstateExecutor.test.ts` activate-or-navigate-only describe; hook test `:281-320`). `applyTier1Action`
   (`workstateExecutor.ts:195-226`) still calls only activateTab/openContent/focusProtocolStep.
4. No unaccepted-doc entry — PASS. Attestation is the first check (`useWorkstateExecutor.ts:85-93`); no raw
   `replaceState` export; harness `:434-483` green (unaccepted doc → zero pushes, store bytes unchanged).
5. Idempotence placement — PASS. Guard is a hook `useRef<Set>` (`useWorkstateExecutor.ts:65`), not an effect
   (StrictMode-safe); it intercepts only `applyAcceptedWorkstate` (user `openTab` edits untouched). Record is
   now post-success.
6. Zero surface-name literals — PASS. `grep -nE "'(run-design|run-plan|run-execute|protocol-review|ingestion|analysis)'"`
   over both new modules = none; membership is `registry.find((s) => s.id === action.surface)` (`workstateExecutor.ts:148`).

Extra: fix commit touched exactly 5 files (report + 2 source + 2 test). `sessionYaml.ts` and
`useSessionSync.ts` are UNTOUCHED in the fix commit (name-only diff empty for both).

---

## Test-file integrity (fix commit did not weaken/remove assertions)

- `useWorkstateExecutor.test.tsx`: numstat `27 0` — additions ONLY, zero deletion lines.
- `workstateExecutor.test.ts`: numstat `139 10`; the 10 deleted lines are the OLD `acceptGuard(...)`-based
  assertions (6 `expect(` lines: fresh/duplicate/fresh, rev2-fresh, fresh, duplicate) plus the import line and
  describe/comment text. These were replaced by equivalent-or-stronger `peekAcceptGuard`/`recordAcceptedApply`
  tests that additionally pin "peek does not consume" (net new coverage). No assertion was dropped without a
  stronger replacement.

---

## Verbatim command output I ran

1) Targeted new tests (expect 51):
```
$ cd /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357/app && npx vitest run src/shared/session/workstateExecutor.test.ts src/shared/session/useWorkstateExecutor.test.tsx
 ✓ src/shared/session/workstateExecutor.test.ts  (35 tests) 16ms
 ✓ src/shared/session/useWorkstateExecutor.test.tsx  (16 tests) 65ms
 Test Files  2 passed (2)
      Tests  51 passed (51)
```

2) Adjacent targeted set (expect 23 files / 157+):
```
$ cd app && npx vitest run src/shared/session src/shared/surfaces src/shared/lib src/shared/shell
 Test Files  23 passed (23)
      Tests  157 passed (157)
```

3) App typecheck (34-line pin + file-set identity vs trunk):
```
$ cd /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357/app && npx tsc --noEmit
34 error TS lines; 24 unique error files
$ cd /mnt/vast/home/brad/git/cl-integration-2/app && npx tsc --noEmit
34 error TS lines; 24 unique error files
$ comm -3 /tmp/pbch3_trunk.files /tmp/pbch3_br.files
[END comm]        <-- EMPTY, error-file set IDENTICAL
```

4) Scope proof:
```
$ git -c core.fileMode=false diff --stat 85a16976..HEAD -- server schema config
[EMPTY]
$ git -c core.fileMode=false diff --name-only e6e87cd1..7aa1f794
.hermes/plans/PB-CH-3-report.wip-l2t2357.md
app/src/shared/session/useWorkstateExecutor.test.tsx
app/src/shared/session/useWorkstateExecutor.ts
app/src/shared/session/workstateExecutor.test.ts
app/src/shared/session/workstateExecutor.ts
$ git -c core.fileMode=false diff --name-only e6e87cd1..7aa1f794 -- app/src/shared/session/sessionYaml.ts app/src/shared/session/useSessionSync.ts
[EMPTY]
```

5) Regression greps:
```
$ grep -rn "replaceState(" app/src --include=*.ts --include=*.tsx | grep -v test
app/src/shared/session/useSessionSync.ts:58:  replaceState(sessionDocumentToState(parsed, stableTabId))
app/src/shared/session/useSessionSync.ts:80:  replaceState(next)
$ git diff 85a16976..HEAD -- app/src/shared/session/useSessionSync.ts | grep "^@@"
@@ -18,7 +18,7 @@
@@ -41,13 +41,21 @@
$ grep -rn "agent_action" app/src --include=*.ts --include=*.tsx | wc -l
0
```

---

## Acceptance criteria (spec §"Acceptance criteria", verbatim) — each, and how checked

1. "registry-backed navigation" — pure + hook registry tests green (run 1/2); `planTier1Action` registry.find. PASS.
2. "focus applied" — activate-existing + protocol-step focus tests green (run 1/2). PASS.
3. "unknown/stale surface => no-op + diagnostic" — diagnostic tests green (run 1/2). PASS.
4. "unsaved editor state preserved through tier-1 apply" — ref-identity tests green (run 1/2). PASS.
5. "reject touches nothing" — `useWorkstateExecutor.test.tsx:324-333` green; attestation-first re-verified. PASS.
6. "accepted replaceState pushes EXACTLY ONCE" — `:335-367` green; D1 test pins exactly-one across malformed→corrected→repeat. PASS.
7. "two-client harness proves only applied state reaches the sync path" — `:434-483` green, real store bytes printed. PASS.
8. "No production UI mount claimed in this task" — `grep agent_action app/src` = 0; spec-out-of-scope files untouched. PASS.

Every criterion above is exercised by a test I ran green; no criterion was left unchecked.

---

## Residual / informational (no action, not a defect)

- The spec §1 design doc named the pure export `acceptGuard`; the implementation now exports
  `peekAcceptGuard` + `recordAcceptedApply`. This is the sanctioned D1 fix direction and is not referenced by
  any acceptance criterion or by a pinned type — naming drift only.
- `acceptGuardKey` is a module-private helper; no production caller other than the two exported guard fns.

End of re-review. No product file was edited; nothing was committed or merged.
