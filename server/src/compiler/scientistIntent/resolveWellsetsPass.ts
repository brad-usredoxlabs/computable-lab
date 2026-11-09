/**
 * WELLSET-RESOLVER-1 — the `resolve_wellsets` pipeline pass (the thin adapter
 * over the pure wellsetResolver core).
 *
 * Declared in schema/registry/compile-pipelines/scientist-intent-compile.yaml
 * (family expand, depends_on resolve_roles + the noun slots it reads) and
 * registered in compileScientistIntent.buildRegistry — NO verb-name branch:
 * the pass reads the token + wellset-arg + material-bearing-event membership
 * FROM the vocabulary (DATA).
 *
 * Wiring (the minimal-change design):
 * - Reads the committed contents layer (state.input.labState = priorLabState),
 *   the post-expansion events (the resolve_roles slot), the wellset-token
 *   carriers (the ai_precompile slot's candidateEvents), and — FIX RUN 1
 *   (advc D1/D2) — the resolve_nouns + resolve_labware slots (the shared
 *   identity space the pending layer folds onto) and the §14.2
 *   `scientistAnswers` answer map (the answered-card re-pin).
 * - Resolves each declared kind:wellset token to {wells, labwareId binding}
 *   (or the never-guess ambiguous arm).
 * - Writes the concrete wells + binding onto the matching post-expansion event
 *   and republishes the list to the `resolve_roles` slot via secondaryOutputs —
 *   so lab_state (which folds resolve_roles), compute_volumes /
 *   emit_instrument_run_files (which read it) and the compileScientistIntent
 *   assembly (which reads resolve_roles) ALL see the concrete wells with NO
 *   assembly change and NO verb branch.
 * - AMBIGUOUS contents (two or more labware carry materials, nothing pins one)
 *   => the pass bars with a structured clarification on the EXISTING
 *   ScientistIntentUnresolvedFact envelope + the NEW reason-code constant
 *   (OQ-3; UNREALIZED_WELL_LABEL_REASON precedent). FIX RUN 1 (advc D11): the
 *   fact's candidates are the resolved labware RECORDS only (never a symbolic
 *   hint) and ride the EXISTING readings mechanism (the READING-CARD-ANSWER-1
 *   structural arm in clarificationsFromUnresolvedFacts) so the card's OPTIONS
 *   are those records; the scientist's answer returns as the §14.2
 *   scientistAnswers map (key = the fact's own label = the token, value = the
 *   chosen record id) and re-pins the resolution in the core (the D2 answer
 *   leg: the recompile converges, never re-fires). The compileScientistIntent
 *   needs-clarification arm (UNRESOLVED_ARGUMENTS_CODE) surfaces it — no new
 *   card channel.
 */
import type { Pass } from '../pipeline/types.js';
import { UNRESOLVED_ARGUMENTS_CODE } from '../resolution/resolveNounsPass.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { LabStateSnapshot } from '../state/LabState.js';
import type {
  ScientistIntentVocabulary,
} from './vocabulary.js';
import type { ScientistIntentNormalized } from './normalizeScientistIntent.js';
import type { ScientistIntentUnresolvedFact, ScientistIntentActionKind } from './types.js';
import {
  resolveWellsets,
  UNATTRIBUTED_WELLSET_TOKEN_REASON,
} from './wellsetResolver.js';

export const RESOLVE_WELLSETS_PASS_ID = 'resolve_wellsets' as const;

export interface CreateResolveWellsetsPassOptions {
  /** The vocabulary (token + wellset-arg + material-bearing-event membership
   *  are DATA). */
  vocabulary: ScientistIntentVocabulary;
}

export function createResolveWellsetsPass(opts: CreateResolveWellsetsPassOptions): Pass {
  return {
    id: RESOLVE_WELLSETS_PASS_ID,
    family: 'expand' as const,
    run({ pass_id, state }): { ok: boolean; output?: unknown; diagnostics?: import('../pipeline/types.js').PassDiagnostic[]; secondaryOutputs?: Record<string, unknown> } {
      // The post-expansion events (the resolve_roles output slot).
      const rolesOutput = state.outputs.get('resolve_roles') as { events?: PlateEventPrimitive[] } | undefined;
      const events = rolesOutput?.events ?? [];

      // The wellset-token carriers (the ai_precompile slot's candidateEvents).
      const ai = state.outputs.get('ai_precompile') as ScientistIntentNormalized | undefined;
      const candidateEvents = (ai?.candidateEvents ?? []) as Record<string, unknown>[];

      // The committed contents layer (priorLabState threaded into the pipeline
      // input). Absent => the pure core treats it as an empty snapshot.
      const priorLabState = (state.input as { labState?: LabStateSnapshot }).labState;

      // FIX RUN 1 (advc D1/D2): the identity slots the pending layer folds
      // onto, and the §14.2 answer map (threaded onto the pipeline input by
      // compileScientistIntent — absent on every other caller).
      const nounsSlot = state.outputs.get('resolve_nouns') as
        ResolveWellsetsInputSlots['nounsSlot'] | undefined;
      const labwareSlot = state.outputs.get('resolve_labware') as
        ResolveWellsetsInputSlots['labwareSlot'] | undefined;
      const scientistAnswers = (state.input as { scientistAnswers?: Readonly<Record<string, string>> })
        .scientistAnswers;

      const result = resolveWellsets({
        events,
        candidateEvents,
        priorLabState,
        vocabulary: opts.vocabulary,
        ...(nounsSlot ? { nounsSlot } : {}),
        ...(labwareSlot ? { labwareSlot } : {}),
        ...(scientistAnswers ? { scientistAnswers } : {}),
      });

      // FIX RUN 2 (advc D12): STRIP the join identity. The expand pass stamps
      // details.sourceActionIndex for this module's provenance join ONLY — it
      // is internal join data, not shipped event content (the well-address/
      // hardcode boundary and every downstream consumer expect the event
      // shape the expander emitted). Every returned event loses the key; if
      // any event carried one, the cleaned list is republished to the
      // resolve_roles slot so lab_state / the assembly never see the stamp.
      const anyStamped = result.events.some(
        (e) => typeof ((e.details ?? {}) as Record<string, unknown>).sourceActionIndex === 'number',
      );
      const cleanEvents = anyStamped
        ? result.events.map((e) => {
            const d = (e.details ?? {}) as Record<string, unknown>;
            if (typeof d.sourceActionIndex !== 'number') return e;
            const { sourceActionIndex: _drop, ...rest } = d;
            return { ...e, details: rest };
          })
        : result.events;

      // No wellset token anywhere (the overwhelmingly common case): passthrough,
      // no diagnostics — the pipeline is byte-identical UNLESS a provenance
      // stamp needs stripping (then republish the clean list).
      if (result.applied.length === 0 && result.ambiguous.length === 0) {
        return {
          ok: true,
          output: { events: cleanEvents },
          ...(anyStamped ? { secondaryOutputs: { resolve_roles: { events: cleanEvents } } } : {}),
        };
      }

      // NEVER-SILENT (never-guess + FIX RUN 2 / advc D12): bar with ONE
      // clarification PER honest fact on the EXISTING unresolved-fact envelope
      // + the reason-code constants (OQ-3; UNREALIZED_WELL_LABEL_REASON
      // precedent). Two honest arms ride the same envelope:
      //  - AMBIGUOUS_CONTENTS_WELLSET_REASON: contents span >1 labware / an
      //    unmappable bucket (never-guess).
      //  - UNATTRIBUTED_WELLSET_TOKEN_REASON (D12): the set COMPUTED but the
      //    token could not be attributed to one emitted event — previously a
      //    SILENT empty applied list (the vacuous-green acceptance failure);
      //    now an honest card. The compileScientistIntent needs-clarification
      //    arm (UNRESOLVED_ARGUMENTS_CODE) surfaces it. FIX RUN 1 (advc D2 +
      //    D11): TWO answer channels, both the
      //    EXISTING mechanisms —
      //  (a) resolved records exist: the records ride the readings arm (the
      //      READING-CARD-ANSWER-1 structural arm renders them as the card's
      //      OPTIONS; D11: never a symbolic hint) and the answer returns as the
      //      §14.2 scientistAnswers map (key = the fact's label = the token,
      //      value = the chosen record id) which the core re-pins (converges).
      //  (b) no resolved record yet (the ledger holds only an unmappable
      //      pending bucket): the fact's actionLocation names the action's
      //      LABWARE slot (the vocabulary contract's `labware` arg — a
      //      labware-domain /l card), so the answer fold splices the chosen
      //      label onto the labware BINDING (never into the wellset slot —
      //      the D2 bar-loop), the spine re-binds it in the recompile, and
      //      the ledger folds the bucket onto the now-resolved record.
      if (result.ambiguous.length > 0) {
        const clarifications: ScientistIntentUnresolvedFact[] = result.ambiguous.map((a) => {
          const readings = a.records.map((r) => ({
            id: r.instanceId,
            label: r.title,
            finalFractions: [],
            note: `${r.wellCount ?? 0} well(s) carry materials on this labware`,
          }));
          const labwareSlotArm = readings.length === 0 && a.labwareHint !== undefined;
          const fact: ScientistIntentUnresolvedFact & {
            readings?: typeof readings;
            message?: string;
          } = {
            label: a.token,
            reason: a.reason,
            candidates: a.records.map((r) => ({ label: r.title, ref: r.instanceId })),
            actionLocation: {
              actionIndex: a.actionIndex,
              action: a.verb as ScientistIntentActionKind,
              argument: labwareSlotArm ? 'labware' : a.argName,
            },
          };
          if (readings.length > 0) {
            fact.readings = readings;
            fact.message = a.reason === UNATTRIBUTED_WELLSET_TOKEN_REASON
              ? `The draft asks to mix every well containing materials, but the computed well set could not be attributed to the draft's own action (the verb expanded to more than one event / none). The compile is barred rather than shipping an op over zero wells. Confirm which labware was intended.`
                + (a.unresolved.length > 0 ? ` (The draft also names '${a.unresolved.join("', '")}' — its plate could not be identified.)` : '')
              : `The draft mixes every well containing materials but the contents live on more than one labware. Which labware?${a.unresolved.length > 0 ? ` (The draft also names '${a.unresolved.join("', '")}' — its plate could not be identified.)` : ''}`;
          }
          return fact;
        });
        return {
          ok: false,
          output: { events: cleanEvents },
          diagnostics: [{
            severity: 'error' as const,
            code: UNRESOLVED_ARGUMENTS_CODE,
            message: `resolve_wellsets: ${result.ambiguous.length} ambiguous contents wellset(s) — compilation barred`,
            pass_id,
            details: { clarifications },
          }],
        };
      }

      // Resolved: republish the concrete-well events to the resolve_roles slot
      // (secondaryOutputs overwrite) so lab_state + the assembly see them.
      return {
        ok: true,
        output: { events: cleanEvents },
        secondaryOutputs: {
          resolve_roles: { events: cleanEvents },
        },
      };
    },
  };
}

type ResolveWellsetsInputSlots = Parameters<typeof resolveWellsets>[0];
