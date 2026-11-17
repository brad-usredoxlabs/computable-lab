# A biology context may declare no instrument and no readout (BRAD RULING 2026-11-16)

Status: BINDING for lane 2. Resolves `D-BIOLOGY-CONTEXT-REFS`, the blocker on
`L2-BIOLOGY-NO-AUTOMINT-1`.

## The question put to Brad

Opening Biology mode on a plate silently created a `measurement-context` record with a
hardcoded plate reader and a hardcoded Far-Red fluorescence readout
(`app/src/graph/hooks/useBiologyMode.ts:98-126`), because well-role assignments are keyed by a
measurement-context id and `measurement-context.schema.yaml` requires `equipment_ref` and
`readout_def_refs`. So a view open authored a scientific claim nobody made, and Results mode
then filtered that same context out of its Readout list (`useResultsMode.ts:365`) — the minted
record existed only to satisfy a foreign-key-shaped requirement.

Two shapes were offered:

- **A** — a biology context is created on the FIRST EXPLICIT role assignment (a human action),
  and `equipment_ref` / `readout_def_refs` become OPTIONAL so the context can honestly say
  "nothing declared yet" instead of inventing a plate reader.
- **B** — well-role assignments stop hanging on a measurement context and scope to the run's
  labware instead, so biological meaning is not a sub-record of how something will be measured.

## Brad's answer (verbatim)

> A

## The rule

1. **A measurement context may exist with `equipment_ref` and `readout_def_refs` absent.** Absence
   means *not yet declared* — never "use a default". A context that names neither is a legal
   record and must render as a declared absence.
2. **A biology-layer context is created only by an explicit human action** (the first role
   assignment on that plate), never by a read, a mount, a refresh, a tab switch or a `useEffect`.
   Creating the context and writing the first assignment are one operation from the person's
   point of view.
3. **No creation path may name an equipment record or a readout definition that the person did
   not choose or that the plate does not already declare.** The current hardcoded
   `EQP-PLATE-READER` / `RDEF-PLATE-FAR_RED-ROS` pair is deleted, not parameterised.
4. **Every consumer must tolerate absence.** Absence renders as "not declared" (or omits the
   line); it may never crash, and it may never substitute a default instrument or channel. The
   measured deref sites that must be fixed in the same unit:
   - `app/src/graph/readouts/ReadoutContextPanel.tsx:106,108`
   - `app/src/graph/semantic/RoleAssignmentPanel.tsx:117,214,215`
   - `app/src/graph/semantic/MeasurementContextList.tsx:12,48`
   - `app/src/graph/semantic/MeasurementSetupPanel.tsx:120,130,132,225`
   - `app/src/graph/hooks/useResultsMode.ts:861`
   - `app/src/graph/LabwareEventEditor.tsx:3578,3634,3812,4140,4411`
   - type declarations that still say required: `app/src/shared/api/client.ts:540,559,561`
   (`useResultsMode.ts:484,663` already read through optional chaining and need no change.)
5. **Publishing still requires an instrument.** The ingest refusal that names a missing
   instrument (`useResultsMode.ts:664-671`) stays exactly as it is: absence at declaration time
   is honest, and absence at publication time is a named refusal. The two are not the same thing.
6. **No backfill and no silent cleanup.** Existing auto-minted contexts are legacy: name them in
   the handoff, leave them, let a person retire them. (There are none in the lane-2 store today.)

## What this ruling does NOT settle

- **Option B remains the eventual shape.** Biological meaning is still stored as a sub-record of
  measurement setup; A removes the fabrication without removing the conflation. B is the change
  to make when the three "results" homes are consolidated (editor Results drawer, run-workspace
  Results tab, analysis surface). Migration cost is currently zero in this store — there are no
  well-role assignments and no measurement contexts — but lane 1 / main stores must be measured
  before B is authored.
- **The declared unit of `RDEF-GCFID-PEAK_AREA`** (name says "Peak Area", units say `pA`) is a
  separate domain question and is untouched by this ruling.
- **The policy for acquisitions declared after the fact** (a file arriving for a read that was
  never planned) is still undeclared. Until it is, an unplanned acquisition stays attached and
  unpublished with a named reason; no retrospective "planned" event may be fabricated.

## Evidence

The survey that produced the question:
`~/.hermes/cl/lanes/2/reports/event-editor-results-survey-20261116/SUMMARY.md` (§10, F-finding on
the auto-mint) and `astra-grounding.md`. The record the survey drive created
(`MCTX-MWJZJRJT-S6WW3I`) was deleted with Brad's authorization (store commit `8ac04ff3`).
