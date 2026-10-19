# W211-MACH-1 RED-FIRST — the "answered facts survive" half (advc-W211MACH1-c1 D2)

The AC's RED clause names TWO things: "fixture cards on '/m' / answered facts
survive". The committed RED receipt
`app/e2e/receipts/w211-mach1-l2t1330/RED-integrity-at-534f7e5f.raw`
demonstrates the FIRST half (the adapter unit pin, `'/m'` vs `'/l'` at the
pre-fix tip 534f7e5f). This note records the SECOND half — the pre-BIND-1
"answered facts survive" RED — by citation of BIND-1's own committed RED
evidence, plus the git-level proof that 534f7e5f is pre-BIND-1.

## Git-level proof that 534f7e5f is pre-BIND-1 (reproducible at this tip)

    $ git -c core.fileMode=false merge-base --is-ancestor b52f5dfc 534f7e5f; echo $?
    1        # false: the ANSWER-BIND-1 merge b52f5dfc is NOT an ancestor of 534f7e5f
    $ git -c core.fileMode=false merge-base --is-ancestor 534f7e5f 5cdfb8d0; echo $?
    0        # true: 534f7e5f IS an ancestor of this lane's base 5cdfb8d0

So at 534f7e5f the answered-slot binding (ANSWER-BIND-1) does not exist: an
answered `[[labware:<id>|label]]` fact would demonstrably SURVIVE the next
draw there. That is the pre-BIND-1 state the AC's second RED half names.

## Where the pre-BIND-1 "answered facts survive" RED is committed

BIND-1's own RED commit (an ancestor of this lane's base 5cdfb8d0 — verified
`git merge-base --is-ancestor b7347111 5cdfb8d0` -> exit 0) is tests-only
(product untouched) and its raws are recorded in the committed BIND-1 report
`.hermes/plans/ANSWER-BIND-1-report.wip-l2t0830.md` §"RED-first evidence":

- RED commit: `b7347111 test(l2t0830): ANSWER-BIND-1 RED — answered-slot binding
  pins (pass leg + handler leg), authored before implementation`
  (files: `server/src/compiler/resolution/resolveNounsPass.answeredNouns.test.ts`,
  `server/src/api/handlers/IntentCompileFromPromptHandlers.answeredBinding.test.ts`)
- Handler-leg RED raw (orchestrator-corrected excerpt, same report):
  `FAIL ... > answered with [[labware:<existing id>|label]]: the ambiguous-noun
  fact ... GONE → expected [ { label: 'microcentrifuge tube', reason:
  'ambiguous-noun', … } ] … (fact still bars)` — i.e. at the pre-BIND-1 base the
  ANSWERED fact still bars (survives).
- Pass-leg RED raw (same report): `FAIL ... > answered slot: the validated
  answer becomes an AUTHORITATIVE binding... → expected false to be true`.

## Which RED half is reproducible WHERE for W211-MACH-1

- '/m' card-routing half: reproducible directly — the committed
  `RED-integrity-at-534f7e5f.raw` (this fixture + integrity test run against
  the 534f7e5f adapter tree; fails 1/7 on `expected '/m' to be '/l'`).
- "answered facts survive" half: reproducible at 534f7e5f by the same
  merge-base proof above (BIND-1 absent there), and its raw RED failures are
  committed in BIND-1's own report + RED commit b7347111 (cited paths above).
  The step-0 probe bodies under `.hermes/plans/w211-step0/` (probeC-bind1.json,
  probeB2.py) show the GREEN (post-BIND-1) shrink — the fact GONE on the next
  draw — which is the behaviour the pre-BIND-1 RED contrasts against.

Honest label: this note is a citation-level closure of the second RED half
(read-only git-level proof + committed BIND-1 RED receipts); no new probe was
run against the shared lane stack for it.
