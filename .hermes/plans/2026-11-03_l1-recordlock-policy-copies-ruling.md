# L1 RECORD-LOCK-GUARD-1 — POLICY-COPY SCOPE + GATE RULING

Item: L1-RECORD-LOCK-GUARD-1 · Trunk `cl/integration-1` · 2026-11-03 · Lane-1 architect.
Trigger: orchestrator consult "two UNNAMED hardcoded copies of the content-lock policy" + non-satisfiable S2.
Evidence: verified FIRST-HAND on trunk @ `6cce4309` (one bookkeeping commit ahead of the consult's `cfdc904f` —
cfdc904f..6cce4309 is `docs(lane1 307TH): dispatch-window prober + leg-1 kit audit; no dispatch`, no product
change). file+line reads, `git grep -nE`, and a literal co-occurrence detector I ran over all 2,776 tracked
`app/src server/src` TS files. AM-1..AM-10, acceptance 1-5 and the split ruling S1/S3/S4 are binding and
unchanged unless amended BY NAME below (quoted). AM-5's orchestrator pre-gate and the AM-9 pin set stand.

## VERDICT

**SCOPE: BOTH COPIES ARE IN.** `server/src/api/routes/protocol-steps.ts:216-219` → owned by **LEG 1**.
`app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45 / :102` → owned by **LEG 2**. The
`split-parallel` sequencing (S1/S3/S4) is UNCHANGED; the only amendments are the leg-1 file boundary, the
leg-2 file boundary, AM-1 #7's consumer list, and S2's gate DEFINITION (shape + closed exclusion table, §2).

**RULING: extend-scope**

---

## 1. WHY IN — and why filing them OUT would be debt-by-name

AM-8 closes AS-L1T1905-2 verbatim: *"debt false once the lock is declared in lifecycle DATA and every
consumer reads it. Any trace of the old hardcoded predicate in the diff is a defect, not a fallback."* Both
copies are literal, character-identical copies of the predicate this item centralizes, confirmed by my reads:

- `protocol-steps.ts:216-219` — `const CONTENT_LOCKED_STATES = ['approved', 'effective', 'superseded',
  'archived'];` + `contentLocked(payload) := Boolean(payload.lifecycleId) && CONTENT_LOCKED_STATES.includes(String(payload.state))` +
  a route-level `409 CONTROLLED_RECORD_LOCKED` on the protocol-step write path. Its own docstring (207-215)
  says it mirrors *"`RecordHandlers.ts:798` ... and `RecordStoreImpl.ts:661` — the SAME semantics and code at
  every layer."* **Those references are already stale**: `RecordHandlers.ts:798` is a filing-rule line and
  `RecordStoreImpl.ts:661` is the upsert hook — the real predicates now live at `:1139` / `:286`. The mirror
  is demonstrably drifting; that is the argument for centralizing, not for tolerating it.
- `protocolStepEditing.ts:45 and :102` — two inline `if (payload.lifecycleId && ['approved','effective',
  'superseded','archived'].includes(String(payload.state)))` throw-gates (`editableProtocolSteps`,
  `assertRolesEditable`). Same policy, client side.

An OUT ruling would have to claim these are not "the old hardcoded predicate" — the source contradicts that.
Leaving them means the S2 master gate either (i) returns live hits leg 2 is told to ignore (S2 watered down,
AM-4/AM-8's two-policy reject nullified) or (ii) the whole-repo claim becomes permanently qualified "except
two files". Both are the exact hazard AM-7 bait 15 calls an automatic reject. Marginal cost of IN is two
mechanical predicate-source swaps with zero behavior/message change. Claiming them now is smallest-diff.

Consistency note (no behavior surprise): after migration the protocol locks follow the record's OWN lifecycle
declaration, exactly as the four named consumers do. A protocol under `document-control` / `document-
controlled-signing` (the declared four) locks identically to today; AM-1 #5 already declares `approved/
effective/superseded/archived` locked for those two lifecycles, so every existing 409 pin (incl.
`archivedAssignment.test.ts:453-457`, a bar-2 file that expects 409 on a locked approved→effective content
smuggle) stays green without amendment. **EXCEPTION — see §2.E (orchestrator erratum, measured 2026-11-04):
two `*.test.*` fixtures build their locked protocol on the UNDECLARED id `protocol-control` and DO need a
fixture repair; the sentence above is correct for every production-shaped pin, not for those two.** No record
uses `service-request`/`tyf-order`/`lab-vocabulary-control`
for a controlled protocol, and even if one did, "locked per the record's lifecycle" is the item's whole thesis.

## 2. AMENDMENTS (quoted)

### A. AM-1 #7 — consumer list (addition to the quoted sentence)

Original (unchanged prefix): *"7. Consumers, ALL reading the declared set: `RecordHandlers.ts:1139`,
`RecordStoreImpl.ts:285-290`, `RecordRegistryPage.tsx:554-560`, `RecordEditPanel.tsx`."*

Amended by this ruling to add two consumers to the "ALL" list:
> `server/src/api/routes/protocol-steps.ts:216-227` (server/policy — route-level `CONTENT_LOCKED_STATES` +
> `contentLocked()` — leg 1) and `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45/:102`
> (client/policy — `editableProtocolSteps` + `assertRolesEditable` — leg 2).

The trailing sentence "grep for the four state strings must return only lifecycle YAML DATA and
proof/evidence files" is kept, but is **defined by the reconciled S2 gate in §3** (a bare-string grep is not
the executable form).

### B. Split ruling §1 — LEG 1 boundary (addition)

Insert after the `RecordHandlers.ts` block:
> - `server/src/api/routes/protocol-steps.ts:216-227` — the route-level `CONTENT_LOCKED_STATES` +
>   `contentLocked()` gate consumes the SAME declared-set channel leg 1 builds for `RecordHandlers.ts:1139`
>   (the AM-2 store-config resolver / declared-set accessor). No second literal. The `409
>   CONTROLLED_RECORD_LOCKED` pre-check stays behaviorally identical and the protocol-step write path must
>   never false-200 a locked write (G5 parity — the store's declared-set 409 backs it). Add/adjust a RED
>   behavior pin for a locked protocol-step write if the existing route tests do not cover it.

### C. Split ruling §1 — LEG 2 boundary (addition)

Insert after the `RecordEditPanel.tsx` block:
> - `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45 / :102` — the `editableProtocolSteps`
>   and `assertRolesEditable` gates consume `getLifecycleContentLockedStates` (AM-1 #6) via the AM-4
>   `lifecycleLock.ts` predicate home. Both throw-sites keep their exact messages and throw-timing; only the
>   predicate source changes. `ProtocolSelector.test.tsx` and the step-editor suites stay unchanged-shape.

### D. Split ruling §2 S2 — gate DEFINITION (timing clause kept verbatim, definition replaced)

Original S2: *"The master four-state grep gate is run AFTER leg 2 only. Running it between legs produces a
false BLOCK (the app legitimately still holds the old pair during leg-2 work)."*

Timing clause KEPT VERBATIM. The phrase "holds the old pair" now names TWO app carriers
(`RecordRegistryPage.tsx` AND `protocolStepEditing.ts`), which strengthens the between-legs false-BLOCK
warning (still do not run the gate between legs). The gate's DEFINITION is replaced by §3 below; the bare
four-state-string grep is not satisfiable as worded, so §3 is the executable, satisfiable form both the
leg-2 coder and the adversarial reviewer run verbatim.

### E. ORCHESTRATOR ERRATUM (2026-11-04) — §1's "every existing 409 pin stays green without amendment" is FALSE for two test fixtures

This is an orchestrator correction of a MEASURED fact in §1, not a change of ruling, boundary or acceptance
criterion. Ruling §1 above is amended by the bracketed exception sentence; nothing else in §1 changes.

Measured by me at trunk `03c420e1` (fresh process, this tick), not inherited from any handoff:

1. `grep -rn "protocol-control" schema/ config/ server/src app/src` outside `*.test.*` = **0 hits**. The only
   two hits in the whole tree are the fixtures themselves:
   `server/src/api/handlers/RecordHandlers.writeGates.test.ts:250` and
   `server/src/api/routes/protocol-steps.test.ts:312`.
2. Declared lifecycles are exactly the seven files in `schema/core/lifecycles/`: `document-control`,
   `document-controlled-signing`, `lab-sample`, `lab-vocabulary-control`, `registry-ops`, `service-request`,
   `tyf-order`. **`protocol-control` is not one of them** — it is a fixture-only id.
3. Both fixtures set `lifecycleId: 'protocol-control', state: 'approved'` and assert
   `409 CONTROLLED_RECORD_LOCKED` + zero writes (`writeGates.test.ts:248-267`;
   `protocol-steps.test.ts:312-329` PATCH and the POST sibling). Today a hardcoded state list makes that
   lock fire. After the migration the declared-set resolver answers `undefined` for an undeclared lifecycle and
   the gate **fail-opens by design (AM-14)** — so these two pins would expect 409 and receive 200. They go RED
   for the wrong reason, which reads as "the migration broke the lock".
4. LAWFUL repair (already written into the LEG-1 brief, `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt`
   §"FIXTURE TRAP"): set those fixtures' `lifecycleId` to the DECLARED locked lifecycle
   `document-controlled-signing`, keep `state: 'approved'`, leave every assertion byte-identical. Forbidden:
   adding a `protocol-control` lifecycle YAML, special-casing an undeclared id in product code, or restoring a
   state literal to make the pin pass.

Consequence for the gates: **no pin is deleted, weakened or re-scoped** — two fixtures are re-pointed at a
declared lifecycle, which is exactly what a real controlled protocol uses. The adversarial reviewer should
require the fixture diff to be limited to those two `lifecycleId` strings.

## 3. THE SATISFIABLE S2 — SHAPE-BASED PREDICATE SCAN + CLOSED EXCLUSION TABLE

### 3.1 Why a shape, not the bare strings

A literal whole-repo grep for the four words returns hundreds of legitimate single-state uses — signature
contracts (`signatureAction`/`targetState`), ingestion/run-draft/release `status` fields, protocol
effectiveness guards (`state === 'effective'`), engine-archived guards (`['archived','superseded',
'deprecated']` at `ProtocolContextService.ts:181-187` / `state === 'archived'` at `analysisService.ts:183`),
type unions, and test fixtures. A bare-string gate cannot separate these from a policy copy and is therefore
either unsatisfiable or quietly watered down. The discriminator that DOES separate them: **a policy copy
holds multiple/lock-set states in one construct; legitimate uses hold one state at a time or a strictly
different enum superset.** Co-occurrence within a line window is the predicate SHAPE.

### 3.2 Measured hit classes (my detector over all 2,776 app/src+server/src tracked TS files, W=8)

FOUR-STATE co-occurrence (any window of ≤8 lines holding all four quoted states) — **6 files total**:
- the two found copies: `protocolStepEditing.ts:45`, `protocol-steps.ts:216`;
- the two named server consumers (pre-migration): `RecordHandlers.ts:1139`, `RecordStoreImpl.ts:286`;
- 2 LEGITIMATE: `DocumentControlBar.tsx:58-61` (the `pillStates` union — six states incl. `draft`/`in_review`,
  a CSS display set per REG-1 D1, not a lock) and `ControlledDocumentSchemas.test.ts:115` (test fixture).

APPROVED+EFFECTIVE PAIR co-occurrence (the OLD registry-pair shape, W=8) — **13 files**: production = the
4 policy files above + `RecordRegistryPage.tsx:560-561` (the leg-2 rewrite target) + `DocumentControlBar.tsx:
58-59` (display); the other 7 are `*.test.*` fixtures that legitimately construct records in both states
(e.g. `archivedAssignment.test.ts:453-457`, a bar-2 409 pin; `RevisionRoutes.test.ts:32-40`).

### 3.3 The gate (run verbatim, at the END of leg 2, per unchanged S2 timing)

A four-state literal that survives IS the policy; the gate's job is to prove the ONLY four-state/pair hits in
production code are the enumerated display set. Script — run from the worktree root, **after** both legs merge
+ stack restart + AM-5 pre-gate passes:

```python
#!/usr/bin/env python3
# L1-RECORD-LOCK-GUARD-1 S2 master gate (reconciled). Verbatim; do not edit.
# Run AFTER leg 2 merges + restart + AM-5 pre-gate. Exits 0 only if every
# policy-shape hit in PRODUCTION code is in the closed allowlist below.
import re, subprocess, sys
W = 8                       # line window for co-occurrence
STATES = ["approved", "effective", "superseded", "archived"]
QUOTED = re.compile(r"['\"](approved|effective|superseded|archived)['\"]")
# CLOSED allowlist: exact file:start-end of the ONLY permitted production hits (display hull).
ALLOW_FOUR = {("app/src/components/registry/DocumentControlBar.tsx", 58, 61)}
ALLOW_PAIR  = {("app/src/components/registry/DocumentControlBar.tsx", 58, 59)}
def is_test(f): return re.search(r"(^|/)([^/]*\.(test|spec)\.(ts|tsx|js|jsx)|[^/]*test-utils\.(ts|tsx))$", f)
def scan(mode):
    out = []
    for f in subprocess.run(["git","ls-files","app/src","server/src"],capture_output=True,text=True).stdout.split():
        if not re.search(r"\.(ts|tsx|js|jsx)$", f) or is_test(f): continue   # test = fixture home, not runtime policy
        try: lines = open(f, encoding="utf-8").read().splitlines()
        except OSError: continue
        want = STATES if mode=="four" else ["approved","effective"]
        marks = []
        for i, ln in enumerate(lines, 1):
            for m in QUOTED.finditer(ln):
                if m.group(1) in want: marks.append((i, m.group(1)))
        if not marks: continue
        marks.sort(); j = 0; hit=None
        for i in range(len(marks)):
            while j < len(marks) and marks[j][0]-marks[i][0] <= W: j += 1
            if len({s for _,s in marks[i:j]}) == len(want): hit=(marks[i][0],marks[j-1][0]); break
        if hit: out.append((f,*hit))
    return out
for mode, allow in (("four", ALLOW_FOUR), ("pair", ALLOW_PAIR)):
    hits = scan(mode)
    unexpected = [h for h in hits if (h[0],h[1],h[2]) not in allow]
    if unexpected:
        print(f"FOUR-STATE{'/PAIR' if mode=='pair' else ''} UNEXPECTED HITS (must be migrated or are NEW policy copies):")
        for f,a,b in unexpected: print(f"  {f}:{a}-{b}")
        sys.exit(1)
print("S2 PASS: every production policy-shape hit is the documented display hull. YAML home + served shape "
      "are proven separately by the AM-5 pre-gate.")
```

Adjudication rule (binds both the coder and the adversarial reviewer):
- Any PRODUCTION hit not in the allowlist = FAIL. The four pre-migration policy files (`protocol-steps.ts`,
  `RecordHandlers.ts`, `RecordStoreImpl.ts`, `protocolStepEditing.ts`) and the registry pair
  (`RecordRegistryPage.tsx:560-561`) must therefore be GONE — clearing them is only possible by actually
  migrating to the declared set (they will not leave a hit by deleting an assertion, and behavioral pins in
  §3.4 make a delete-and-don't-migrate regression fail independently).
- The scan scopes `app/src` + `server/src` (the policy-hazard surface the consult measured). The lifecycle
  YAMLs under `schema/core/lifecycles/` are the intended home and sit outside this scan; whether they
  actually declare the right `contentLocked` set is proven by the AM-5 served-endpoint pre-gate, which is
  unchanged and stays the rideout for "unknown/edited YAML did not reload".
- New appearances not in the allowlist: if a future PR adds a four-state/pair co-occurrence, the architectural
  reviewer triages it — a policy-shaped predicate = automatic reject (AM-8/AM-7 bait 15); a genuinely new
  display/fixture class is a file-specific allowlist ADDITION signed by the architect, never by the coder.
- Test files are excluded by class: they construct fixture records across states and cannot create a runtime
  two-policy branch (AM-7 bait 15 is about live policy). A policy literal smuggled into a test file is not a
  runtime hazard; it is still flagged to the architect if a reviewer spots intent.

### 3.4 Coupling (why this cannot be gamed by deletion)

S2 is the structural half of a pair. The behavioral half is the already-binding pins that break if a lock
predicate is merely deleted rather than migrated: `archivedAssignment.test.ts:453-457` (409 on a locked
approved→effective content smuggle, through the real handler + real engine + declared YAML), AM-6 (a)/(b)/(c)
(no-op 200, transition still WRITES, content-change 409 at handler AND store), the protocol-step write test
(§2B), the app bars incl. `RecordEditPanel`/`RecordRegistryPage`/`ProtocolSelector` shape suites. A coder can
pass S2 structurally only by removing the literal (the migration); removing the gate behavior is caught by
these bars, which survive on the declared set unchanged. The pair cannot both be gamed by one edit.

### 3.5 Tier-2 reference — the legitimate single-state landscape (not part of pass/fail)

Documented so the reviewer never re-opens "but this is a hit": signature contract fields
(`signatureAction`/`targetState` single-states, `DocumentControlBar.test.tsx` fixtures), ingestion statuses
(`IngestionWorker.ts:548,585`, `ingestion/types.ts:94,110`, `PublishApprovalPanel.tsx:10`), run-draft/release
statuses (`RunDraftHandlers.ts:599,615`, `release.ts:69`, `RunCollectionView.tsx:39` run-status enum),
protocol effectiveness guards (`ProtocolUseService.ts:69`, `RecordRevisionService.ts:137`), engine-archived
rule (`analysisService.ts:183`, `ProtocolContextService.ts:181-187` — a THREE+deprecated set, distinct from
the four-state policy), collection display (`LabCollectionView.tsx:52` case labels), and type unions
(`knowledge.ts:245`, `LocalProtocolBuilder.ts:30`, `EditorSuggestionService.ts:226` five-state list). All are
single-state or a different enum, so none co-occur; none appears on the gate's allowlist requirement.

Signed: lane-1 architect, 2026-11-03.

RULING: extend-scope