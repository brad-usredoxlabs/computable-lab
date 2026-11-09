# GC-14 release-gate gaps — architect decision/amendment request (lane 1, 160th tick)

REQUESTED OUTPUT: a written decision artifact at
`/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-30_lane1-gc14-gaps-answer.md`
containing either (a) an in-intent ruling the lane can execute, or (b) a CONCRETE proposed
scope amendment for Brad (new task(s): title, why, acceptance criteria, file boundary,
dependency on GC-14 close-out). Brad is unattended; silence is not approval — the deliverable
is the amendment text, ready for his yes/no.

CONTEXT: GC-14 is the campaign release gate (lane-1 task list, `verified by: the dossier,
reviewed by Brad`). The WI-3 full-cycle browser gate ran 2026-10-29 14:15–14:38 EDT at trunk
a5aa77f6 (code 049e5b87) and returned VERDICT: fix — not on code defects, but on two named
platform gaps (recorded VERBATIM in the dossier GAPS appendix, dossier committed 6cd7c4e6).
The dossier at
`/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`
is the word of record; receipts
`/home/brad/.hermes/cl/receipts/GC-14/20261029T181557-gate/` (report.md + 11 trails + s3-hashes
+ 55 shots; orch audit passed).

EVIDENCE, first-hand:
- What PASSED the gate (do not re-propose): run->method->samples->attach->analyze chain end to
  end in the UI with the REAL NAS .D (RUN-gc-14-gate-sheet-res3507-2uz9vw, ACQP-000004/5,
  DREF-000073..116, ANR-000023/24), trust anchor ACQP-000004 21/21 + ACQP-000005 22/22
  independent-hash byte-match, provenance panel engine-truth render, hash-drift 422
  PACKAGE_HASH_DRIFT, zero-code substitution flip, /analysis + /sequences regression,
  hygiene close (0 code-diff in window, data max 3,609 B).
- GAP 1 (A7): no in-browser surface authors an assertion or a claim.
  `/record/new/:kind` knows only study|experiment|run (app/src/shared/shell/RecordHostPage.tsx:6);
  `/registry` has 9 tabs, no knowledge kinds; `+ Create` -> New Claim opens a tab that renders no
  form; the GC evidence form only CONSUMES an existing target (loud refusals evidenced:
  partE/44-a7-35, partE/49-a7-36). schema/knowledge/assertion.schema.yaml exists and serves
  (204 schemas loaded); the server-side lint `asn-scoped-assertion-needs-context` is unreachable
  from the browser. The task criterion "assertion stands on genuine evidence" is therefore NOT
  closable today. Shots: partF/21-a7-43 ("SCHEMA_NOT_FOUND ... Create undefined"),
  partE/10-a7-29 (registry tabs), partF/07-a7-40 (create menu).
- GAP 2 (A6): no shipped analysis revision binds an engine that reads a registered .D while
  accepting the Analyze door's pinned `signal` input. Every revision reachable from the Analyze
  door binds ENG-STUBLIVE01-L1T0130 / adapter `stub-echo`, which publishes a `metric`, never a
  `signal`; the only signal-producing engine (ENG-PYCAL01-L1T2305) is bound to ANREV-000008,
  whose five `table` inputs the door never pins (ANR-000019 precedent). Both gate runs render
  "no signal artifacts in this run" in Compare traces; the comparison surface itself works
  (control: partH/12-a6-46 over GC-10 synthetic seeds, which criteria forbid substituting).
  Fix shape is data-or-code: a new analysis-revision+engine pair whose adapter parses FID1A.CH
  bytes into a signal artifact, or an engine-record amendment — YOUR call which lane
  (declarative-data vs code) and the smallest compliant shape.
- GAP 3 (named, likely no action): pre-existing POST /api/vendor/exa/search 502 on every run-page
  mount (useMaterialSearch -> useVendorExaSearch) breaks A9's literal "zero console errors".
  Out of GC scope per campaign ruling; state keep/descope explicitly.

CONSTRAINTS: project principles (declarative = data; no hardcoded policy; knowledge-layer
canonical example is required reading for gap 1: computable-lab/docs/knowledge-layer-canonical-
example.md); GC-14's own file boundary is docs-only — no product code may be absorbed into it;
the standing stop-boundary rule (workers return requires-rescope, never absorb). Wave/scope
additions need Brad's approval; produce the amendment as task-ready blocks.

ATTEMPTS/ROUTES ALREADY TAKEN BY THE ORCH: dossier filled + hygiene closed at the final tip
(no fix cycle needed — code tip unchanged); gaps recorded verbatim in the dossier GAPS appendix;
GC-14 set in-progress with a human blocker on-change at the dossier path. Do NOT re-run the
browser gate; the gaps are proven absent-surfaces, not flaky renders.
