# MATRES-REPLAY — VERDICT LEG spec (orch-authored l2t1805, 2026-10-26)

DISPATCH GATE SATISFIED: Brad's answers exist at
`~/.hermes/cl/lanes/2/decisions/MATRESREPLAY-worksheet-answers-brad.md`
(STATUS: ANSWERED, includes H-A = YES authorizing SYNTH turns for exactly cases 2', 3, 6).
The worksheet sign-off condition in
`.hermes/plans/2026-10-26_MATRES-REPLAY-worksheet-leg.md` ("every W-* answered, H-A
answered") is met. That answers file is the BINDING TRUTH for intended bindings;
re-read it fresh at dispatch time — Brad may have amended lines since this spec was
written (mtime newer than 2026-10-26 17:45 = re-check before coding verdicts).

## Purity protocol (still binding, rule 2 of the worksheet leg)

- The intended bindings were written BEFORE any panel was opened. The verdict leg may
  now open `replay-harvest/panels/*.txt` — the contamination window is closed.
- Do NOT modify anything under `.hermes/plans/replay-harvest/` (byte-pinned harvest
  basis). Your new artifacts go under `.hermes/plans/replay-verdict/` (create).

## Inputs (read-only)

- Answers/binding truth: decisions/MATRESREPLAY-worksheet-answers-brad.md (W-T1..W-T12, H-A).
- Method + F1-F6 failure axes + coverage table:
  .hermes/plans/2026-10-26_MATRES-REPLAY-worksheet-leg.md
- Harvest basis: .hermes/plans/replay-harvest/ (transcripts/, fates/*.json,
  panels/*.txt, journal/, records/, scripts/{run-all.sh,replay_spine.mts,
  hooks-resolve.mjs,harvest_index.py}) — study scripts/run-all.sh + replay_spine.mts
  first: the offline spine replay is ONE-COMMAND reproducible and network-blind
  (fetch stubbed to throw, OAK deleted); reuse that harness, do not invent a new one.
- Live record store (real recordIds, verified present 2026-10-26 18:00):
  records/material/MAT-NCIT-C185409 (DMEM concept), MAT-MESH-D056945 (HepG2 concept),
  MAT-hep-g2-hepg2-hb-8065-atc-7hdl (vendor-branded material),
  records/vendor-product/VPR-hep-g2-hepg2-hb-8065-atc-29B6ACCB.
- Contracts memo Q1-Q8 (RATIFIED binding policy):
  ~/.hermes/specs/intake/2026-10-19_material-resolution-attestation/contracts-memo-r1.md

## Legs

V1 — SYNTH authoring (H-A authorized, EXACTLY three cases):
  case 2' known-vendor product missing locally; case 3 explicit physical bottle
  (W-T11 intended: concept + source ref + a real INSTANCE/ALIQUOT obligation, never a
  name-string in a material slot); case 6 "make 1 mL..." future instruction (W-T12
  intended: binds nothing as an existing instance; planned step/recipe; must not fail
  as unresolvable; must not invent a lot). Shape: REAL store records, SYNTHETIC
  utterances, label SYNTH in every artifact filename AND inside every artifact.
  Persist the SYNTH turn definitions under replay-verdict/synth/.

V2 — Instrumented offline replay, ALL cases (T1,T2,T4-T10 real/derived + 3 SYNTH):
  replay each material noun through the offline spine harness and capture per-noun
  fate JSON (candidates with tier+level+trace). Classify each divergent fate into the
  instrumented-cause table: LOCAL-SUPPRESSION vs LEVEL-FILTERING vs RANKING vs
  REMOTE-CLAMP (the known clamp is a recognized cause class, not a mystery). Reuse the
  hooks-resolve.mjs instrumentation seam; extend if needed, never mutate the pinned
  harvest artifacts — new fates go under replay-verdict/fates/.
  Re-run scripts/run-all.sh FIRST and prove byte-identical reproduction of the harvest
  fates before producing any new fate (harness-integrity guard; report the proof).

V3 — Verdict: for each turn, compare spine behavior against Brad's INTENDED bindings
  (answers file) and mark pass/fail per axis F1..F6 (verbatim definitions in the
  worksheet leg doc). A turn passes only if every intended binding is achievable by
  the spine's output AND none of the six failure conditions fires. Where an intended
  binding depends on a line the answers file marks [BRAD-CONFIRM] (W-T1/W-T2
  mint-vs-refuse disposition), record the verdict as PROVISIONAL and name the exact
  line — do not treat [BRAD-CONFIRM] lines as certain.

V4 — Report: .hermes/plans/replay-verdict/verdict-report.md — per-case sections with
  (a) intended vs observed, (b) F1-F6 pass/fail, (c) instrumented-cause entry,
  (d) SYNTH labeling visible. End with the "panel vs relocate" synthesis for F6 and an
  explicit ELIG/PANEL input list (what the panel/policy spec must encode, each item
  citing the failing case). This list is the leg's deliverable to the next campaign.

## Rules

- NO product code changes. Files you may create: only under
  .hermes/plans/replay-verdict/ (+ synth/). Scripts you write go in
  replay-verdict/scripts/. Everything else read-only.
- No network. The harness is remote-blind by construction; keep it that way
  (a fate obtained via network is invalid evidence).
- Report-first: create your report file with the plan BEFORE heavy work; append per
  leg; end `STATUS: complete` + line `MATRESREPLAY VERDICT DONE`.
- Commit legs to your branch (docs-only, .hermes/ only).

## Acceptance (orch verifies after advc)

1. run-all.sh byte-identical re-run proof recorded in report (hashes).
2. replay-verdict/fates/ contains a fate for every noun of every case incl. 3 SYNTH;
   every SYNTH artifact carries SYNTH label.
3. verdict-report.md has F1-F6 pass/fail per case + instrumented-cause table +
   PROVISIONAL flags on [BRAD-CONFIRM]-dependent verdicts.
4. ELIG/PANEL input list present, each input citing its failing case id.
5. git diff outside .hermes/ == 0 files.

## Environment

- Worktree (worker's own, off trunk cl/integration-2 tip): created by orch; branch per
  dispatch prompt. node_modules symlinked. cwd=worktree for any node run.
- git always with `-c core.fileMode=false` (NFS mode-bit noise).
- Report path is DISPATCH-PROMPT-SPECIFIED unique path; promote to canonical only by orch.
