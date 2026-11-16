# Generic labware binding: implementation handoff

Implemented against lane 2 revision `b91ad16a9b3546885e74d5e563895ba6b186566c`, on 2026-11-16. Brad authorized direct implementation after the Hermes prompt-1 loop was stopped. This work does not resume Hermes or change its task states.

## The behavior

“Place a 96-well plate on the deck.” now resolves to the existing generic definition, produces a deck proposal without a clarification, and survives Apply and reload with that definition's geometry. Apply creates a labware-instance and saves its ID on the graph's labware entry.

The intended identity chain is:

`graph.labwares[].instanceRecordId → labware-instance.labwareId → labware-definition.recordId`

The editor's `labwareId` remains its existing internal key. `definitionId` names the geometry definition; `sourceRecordId` names the selected store record. These are distinct fields, not interchangeable IDs.

## Why the loop kept failing

There were several independently broken connections. Fixing one exposed the next.

1. **The clarification button lost record identity.** The compiler fact contained a record ID, but `factCandidateOptions` emitted only `id` and `label`. The browser sends `option.ref` as `answer.ref`; the answer fold expects `answer.ref.id`. The r14 saved thread actually contains only `optionId` and `label`. Tests that supplied a reference directly did not test the browser's contract.
2. **The action's declared domain excluded definitions.** On the current lane tip, `create_container.labware` declared only `labware`. The real record provider identifies definition records as `labware-definition`; the domain filter could reject them. A test with a permissive synthetic contract missed that boundary.
3. **An ordinary generic request had no explicit default.** Multiple records matching “96-well plate” became an ambiguity problem. Ranking a vendor record above another record is not the same policy as choosing an intentionally generic design.
4. **The `/runs` preview discarded the chosen definition's geometry.** Once compilation succeeded, the preview rebuilt the plate from a legacy rendering type. In the browser this saved a NEST 200 µL definition despite the selected generic record. The existing definition-preserving fix was wired into a different editor route.
5. **The saved graph lost its new instance link.** Apply already minted an instance, but returned its ID only to the caller. The graph did not retain that ID, so there was no durable graph-to-instance edge.

This was an integration failure across real contracts, not a shortage of reasoning prompts or new tools. A successful compile, a populated option list, and a passing factory test each proved only part of the operation.

## What changed

- `shorthandChat.ts` now gives record-backed clarification options an explicit `ref`. For old saved cards, the fold can recover `optionId` only when it matches a record reference in the held compiler fact. An arbitrary option ID or label cannot manufacture a binding; the existing store-presence check remains.
- The vocabulary declares `labware-definition` as an allowed domain for `create_container.labware`; the prompt-template mirror is updated too.
- `policies.ambiguity.defaultBindings` declares the default for `create_container.labware` with exact aliases `96-well plate` and `generic 96-well plate`. The generic strategy interpreter matches case/whitespace-normalized labels and selects only an existing eligible local candidate with that ID. The normal eligibility checks still run. No manufacturer or plate name is hardcoded in the interpreter.
- The shared chat hook loads selected record payloads before mounting the deck preview. `useDeckGhostMount` and `buildPreviewFromDraft` carry those payloads; the shared labware mapper uses the existing definition-preserving factory when topology and capacity are present. The selected store ID is retained even when it is absent from the payload itself.
- The instance mint returns a placement-key-to-instance-ID map. Adoption stamps `instanceRecordId` before saving and committing the preview. The graph schema declares this optional field; existing graphs remain readable.

The existing compiler, eligibility checks, preview review, Apply path, and persistence mechanism remain in charge. This does not add another direct-to-deck mutation tool.

## The policy this implements

**A generic design is sufficient to begin authoring. It is not evidence of a particular purchased product.**

The generic definition supplies a usable layout and declared generic geometry. It does not assert a manufacturer, catalog number, coating, optical performance, lot, or validated instrument compatibility. Those details remain unknown until supplied and supported.

The default applies only to the declared creation slot and aliases. A request such as “Thermo black 96-well plate cat# 12345” does not match it. An operation on an existing plate, such as shaking, does not acquire a creation default either. Specific product discovery/creation remains a separate existing journey and must preserve the requested identity.

This establishes the low-friction start while retaining the objects on which stricter execution requirements can operate. It does not implement a new regulated-lab policy engine or certify a run for execution. Broader generic defaults, including tubes and racks, should be added as reviewed data with their own placement tests.

## Verification

The final browser drive used the actual model configuration and real app/compiler against a disposable copy of lane 2's records, on private ports 3293/5393. No lab product records were changed. The Hermes lane stack was not restarted.

Final receipt:

- Prompt: `Place a 96-well plate on the deck.`
- Run: `RUN-2026-11-16-run-ejst`
- Saved graph: `EVG-mwiub3t1-88e1`
- Backing instance: `LAB-INST-FAA90585`
- Instance definition reference: `lbw-def-generic-96-well-plate`
- Saved geometry definition: `generic/96_well_plate@v1`, 8 rows × 12 columns, 350 µL maximum volume.
- One proposed plate; no clarification; Apply succeeded; the plate remained after reload.

See the [saved graph](evidence/generic-labware-20261116/saved-event-graph.yaml), [instance](evidence/generic-labware-20261116/saved-labware-instance.yaml), [reloaded deck](evidence/generic-labware-20261116/after-reload.png), and [browser transcript](evidence/generic-labware-20261116/browser.txt).

Tests:

- Final relevant frontend run: **71 passed across 11 files**, including preview hydration, Apply, instance minting, and persistence linkage. [Output](evidence/generic-labware-20261116/app-tests.txt).
- Broader compiler/resolution/chat run: **620 passed, 11 failed across 63 files**. All 11 failing tests also fail on the untouched base revision. They cover existing realization/mixture fixtures, a compiler-import whitelist, and stale golden manifest hashes. The vocabulary change intentionally changes its hash further; no golden was reblessed to hide a failure. [Final output](evidence/generic-labware-20261116/server-tests.txt), [baseline failures](evidence/generic-labware-20261116/baseline-server-failures.txt).
- Server and app typechecks report the same errors as the untouched base: six server multipart-handler errors and ten app errors in existing form/widget code and tests. No new typecheck diagnostics. [Server](evidence/generic-labware-20261116/server-typecheck.txt), [app](evidence/generic-labware-20261116/app-typecheck.txt).
- The new server regression fails on the base (three failing cases), and the final preview regression on the base specifically reproduces generic → NEST substitution. The instance-link assertion was also observed failing before the persistence change. These are behavioral regressions, not assertions that merely mirror the patch.

## Guidance for the next Hermes run

Keep the pipeline paused until this implementation is integrated and its served revision is known. Re-run prompt 1 as one vertical operation: fresh thread → exact prompt → proposal → Apply → saved graph → instance → definition → reload. Assert the IDs and geometry, not just event counts or visible plate pixels.

Then test a deliberately qualified product request through the definition-creation journey. Do not broaden generic matching to make that test pass. A real identity mismatch should remain visible.

Known limits: existing incorrect graphs are not migrated; failed Apply retries are not made transactional by this patch; unrelated thread-history and navigation issues are outside this change. Record-fetch failure still uses the application's existing fallback behavior, which deserves a separate failure-path review. The verified claim here is the successful existing-definition path and its durable identity chain.
