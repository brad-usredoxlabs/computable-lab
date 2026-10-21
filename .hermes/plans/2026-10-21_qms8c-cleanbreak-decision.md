# QMS8-C spec decision framing — PROVISIONAL (orch-written; composer 3x exceeded)

Status: PROVISIONAL per rule 7b. The cl-spec-composer run (pid 3097377, dispatched
21:57 2026-10-20 for QMS8-C) exceeded 3x its expected duration with a 0-byte log and
no draft on disk. The composer is NOT killed; if a draft lands it is reconciled
against this framing. The orch writes the decision shape below from first-hand recon.

## The open human decision (Brad owns — silence is never approval)

QMS8-C retires the domain `status` field on lifecycle-governed registry kinds
(instrument, equipment; per schema/registry/registry-kinds.registry.yaml).
The task text pre-frames two remedies; the orchestrator's live recon (first-hand,
2026-10-21 ~01:00, via :3092 + trunk source):

  FACTS (orch-verified):
  - instruments in the lane corpus: 0. equipment: 38.
  - ALL 38 equipment records carry status. Distribution (status, state):
    (active, active) x22, (active, draft) x10, (active, archived) x6.
    The 10 draft+status:active rows are exactly the false-claim class Brad's
    ruling targets (an approved draft reading "active").
  - The silent fallback lifecycleMiddleware.ts:38-39
    (`nextPayload.state ?? nextPayload.status`) is live on trunk.
  - equipment.schema.yaml LISTS status as REQUIRED (:16) — every equipment form
    demands it today. instrument.schema.yaml:75 declares it optional.
  - All 38 records already carry a lifecycle state stamped by the QMS7-4
    migration (stateByDomainStatus ran active->active), so a migration's
    forward leg only has to STRIP the field, never synthesize a state.

  OPTION A — CLEAN BREAK (the ruling's stated spirit, per the task text):
    schema rejects `status` outright on covered kinds + migration strips it from
    all 38 records (+ any live-dir equipment records, which is fine — all
    records are test data per A4). Order per task notes: fallback removal first.
    Cost: the 38-record migration must land before schema enforcement or writes
    of existing files fail validation; every fixture seeding status (registryOps
    Lifecycle, archivedAssignment, W25RegulatedLifecycle) is updated in-diff.
  OPTION B — TOLERATED LEGACY (explicitly NOT pre-approved):
    lint forbids status only when lifecycleId present; schema keeps the field.
    Cheaper migration, but keeps two vocabularies alive for covered-but-unlined
    records and needs a permanent lint rule to police a field the ruling says
    should not exist.

  RECOMMENDATION (orch, non-binding): OPTION A. The migration is a strip-only
  pass over records that all already have a stamped state; the false-claim class
  is already visible on the registry (10 rows); the fallback deletion is
  demanded by the task regardless; and Brad's standing one-entity-one-vocabulary
  hard rule is the campaign's own justification. B leaves exactly the ambiguity
  that produced EQP-NEW-7LS1.

  Also rides the spec (no new decision): the honest-create sub-item. Live fact:
  the lane corpus has 0 instrument records and 38 equipment — consistent with
  the "create instrument" entry writing an EQUIPMENT record (EQP-NEW-7LS1). The
  spec will pin which UI entry creates which kind and fix per one-entity-one-term.

## What the eventual spec must contain once the ruling lands
1. Ordered steps exactly as the task block states (fallback removal -> schema +
   migration (A) or lint (B) -> registry-kinds forward-use retirement -> UI
   surfaces -> honest-create entry).
2. Migration on the QMS7-4 runner pattern (migrateRecordLifecycles.ts), dry-run
   report first (expect N=38 on the lane), re-derivable, zero validation
   failures post-migration.
3. RED-first tests per verified-by(1)-(4); browser gate per verified-by(5).
4. Fleet-coder note: run server vitest from server/, app from app/.

Watch path for Brad's answer (write it here or in the task block):
/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md

## ADDENDUM 2026-10-21 ~02:30 — composer draft landed; the question is now SHARPER (supersedes the A-vs-B above; still unanswered — not a re-ask)

The cl-spec-composer draft landed after this framing posted:
`.hermes/plans/DRAFT-2026-10-20_2210-QMS8-C-retire-domain-status-spec.md` (STATUS:
draft-complete, reviewed by the orch). It found a real hazard the orch's original
A-vs-B framing missed, since confirmed first-hand by the orchestrator:

  material + material-spec + term records carry lifecycleId='lab-vocabulary-control'
  AND `status` but have NO `state` property (material.schema.yaml:30-37: status enum
  + lifecycleId const, zero state property — orch-verified), and they share the SAME
  lifecycle middleware (LifecycleHandlers.ts:53 `state ?? status`, orch-verified).
  Outright fallback deletion (old OPTION A, now BRAD-A1) therefore DISARMS the
  vocab-control role gate fail-OPEN unless a sibling state-stamp migration ships in
  the same commit.

The decision is now three-way (details + blast radius in the draft header):
  BRAD-A1 full clean break (needs the vocab-control sibling migration same-commit)
  BRAD-A2 clean break for COVERED kinds only, fallback retired coverage-scoped
         (RECOMMENDED by both composer and orch now — zero fail-open windows;
          vocab-control corpus defers to its own honest follow-up item)
  BRAD-B  tolerated-legacy (not recommended)
Plus the honest-create sub-ruling: (i) rename label now (recommended) / (ii) retire
entry / (iii) reroute to instrument kind.

Post your answer (A1 | A2 | B; i|ii|iii) below this line or in the task block:
