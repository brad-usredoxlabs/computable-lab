# L1-RECORD-LOCK-GUARD-1 — post-merge browser re-gate brief (pre-staged l1t1944)

Status: PRE-STAGED, not run. Run only after L1-RECORD-LOCK-GUARD-1 merges to
`cl/integration-1` and the lane-1 stack has been restarted by the orchestrator.
Item stays `in-progress` until this brief returns `VERDICT: accept` on the exact
served revision.

This re-runs the gate that produced the defect (gate `L1-EDITOR-QMS-REGATE-1`,
runstamp `l1t1845`, VERDICT: fix, Defect 1) against the repaired build. It is a
RE-GATE of the same criteria plus the two legs the defect proved were missing.

## 0. Orchestrator pre-gate (must be GREEN before any browser step)

```
python3 ~/.hermes/cl/lanes/1/scripts/pregate-recordlock-1.py        # expect rc=0 + expect-green: PASS
python3 ~/.hermes/cl/lanes/1/scripts/probe-recordlock-2.py --live   # criterion 2, ordered legs
```

`pregate-recordlock-1.py` fails loudly if the served revision is not trunk HEAD, and
distinguishes "lifecycle id 404" from "field absent" from "wrong set". Its RED baseline
was captured pre-merge at `84ebdf46` (contentLockedStates ABSENT on 7/7):
`~/.hermes/cl/receipts/L1-RECORD-LOCK-GUARD-1/pregate-l1t1944/expect-red.txt`.
If it fails, the lifecycle YAML did not reload — restart the stack; do NOT grade the UI.

`probe-recordlock-2.py --live` must not be run before the pre-gate passes: leg B writes.

## 1. Serving facts to pin in the receipts (never reuse l1t1845 values)

| fact | value | how to capture |
|---|---|---|
| served revision | trunk HEAD after merge | `pregate-recordlock-1.py` header (pid → /proc/<pid>/cwd → git HEAD) |
| `DOC-DEMO-SOP` contentSha baseline | `1cd983185da3ab92e345aba333d113f54810429e` at `84ebdf46` | re-read at gate start; record the fresh value, not this one, if it moved |
| `DOC-DEMO-SOP` state | `effective`, lifecycle `document-controlled-signing` | GET `/api/records/DOC-DEMO-SOP` |
| lane stack | `:5192` → `:3092` | `cl-lane-stack.sh 1 status` |

## 2. Corrected lifecycle ids (AM-9 — the 303RD found AM-5's ids were wrong)

`document-control`, `document-controlled-signing`, `lab-sample`, `registry-ops`
(plus untouched `lab-vocabulary-control`, `service-request`, `tyf-order`).
A 404 here means a wrong id, NOT missing data.

## 3. Legs — each needs a receipt (trail step + shot + API readback)

C1 (criterion 1) `/record/DOC-DEMO-SOP` (effective): header shows NO enabled Save;
   the lock affordance is `Create draft revision` (or an equivalent that mints via
   `POST /records/:id/draft-copy`). Assert `saveGone`-style via DOM, not eyeball only;
   screenshot with the header in frame.
C2 (criterion 2) no-edit submit does not drift `meta.contentSha` OR is refused with a
   typed code; content-changing submit is refused with a typed code, never 200.
   `probe-recordlock-2.py --live` is the machine receipt; the reviewer must also drive
   the UI no-edit submit once and pair the DOM with the API readback.
C3 (criterion 3) `/registry` S10 still passes unchanged: `saveGone true`,
   headerButtons `['Create draft revision','Cancel']`, draft-copy 200, original untouched.
C4 (criterion 4) a DRAFT record still saves on `/record` (S1(b) preserved: PUT 200,
   reload shows the edit). Use the gate-minted draft `DOC-AD5C255201C64531`.
C5 (criterion 5) RED-first pin at the fixed layer + zero new type errors — this is a
   code-track gate (orchestrator reads the diff and re-runs it), not a browser leg.

## 4. Known traps for the reviewer

- `controlledContent` strips `state` and `updatedAt`; a no-op short-circuit keyed on
  content alone would freeze the state machine. If an approved→effective transition
  is refused, that is a DEFECT (transition-swallow), not a pass.
- `DOC-20660FF4E9734191` / `DOC-A56FD77A9B124087` 404 for viewer `USR-BRAD` by ACL.
  That is a read filter, NOT fixture loss — do not delete or re-mint them.
- All lane records are TEST DATA (Brad 2026-10-04). No dataset-protection ceremony,
  but no fixture surgery either.
- Served CSS/JS must come from the restarted lane stack; a stale bundle invalidates
  the whole gate.

## 5. Receipts

`~/.hermes/cl/receipts/L1-RECORD-LOCK-GUARD-1/gate-<runstamp>/` — new runstamp, plus
the orchestrator `pregate-l1t1944/` outputs kept beside it (they are step 0 evidence).
Report must end with `VERDICT: accept` or `VERDICT: fix` and name the served revision.
