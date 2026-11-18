/**
 * nounCreateResume — the RETURN leg of the DECLARED noun-create journey.
 *
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey). Ruling: "Every journey
 * transition — including completion and return — is governed by a versioned
 * task contract declaring its input requirements and its typed lifecycle-role
 * outputs. No page or chat handler may invent completion policy." and the
 * return "binds by IDENTITY and recompiles the origin request — never
 * re-resolves from prose."
 *
 * So this module owns TWO pure steps and no I/O of its own:
 *
 *  1. buildNounCreateCheckpoint(origin) parks the origin turn as a
 *     pending-intent checkpoint whose journey id, revision, checkpoint id and
 *     permitted results come from config/journey/declarations/noun-create.yaml
 *     (through journeyDeclarationDoors) and whose SHAPE is gated by the
 *     existing validateCheckpoint (schema/workflow/pending-intent-checkpoint
 *     .schema.yaml). The checkpoint_id is derived from (checkpoint_ref,
 *     message_id), so re-emitting the SAME turn produces the SAME id — a
 *     reload cannot park the intent twice.
 *
 *  2. resumeAfterMaterialCreation(input) takes the ONE committed material
 *     record (committed through the governed draft-accept path — this module
 *     never writes), classifies the return payload with the existing
 *     classifyReturnPayload, and yields the resume action: the delta that
 *     fills the declared MaterialReference slot plus the origin prompt's
 *     VERBATIM TEXT, which the caller recompiles as the origin request. A
 *     checkpoint already `resumed` refuses: one committed effect, no re-fire.
 *
 * The durable store write (persisting the checkpoint, flipping status) belongs
 * to the store/route layer and is intentionally NOT here.
 */
import {
  validateCheckpoint,
  type ContractDiagnostic,
  type ContextDelta,
  type ExpectedReturnType,
  type PendingIntentCheckpoint,
  type RevisionPair,
} from './checkpointContract.js';
import { classifyReturnPayload, type InjectionRefusal } from './returnPayloadClassification.js';
import {
  journeyRefFromDocument,
  loadJourneyDocument,
  NOUN_CREATION_JOURNEY_ID,
  type JourneyDeclarationRef,
} from './journeyDeclarationDoors.js';

/** The origin turn the creation interrupts (identity, never re-resolved prose). */
export interface NounCreateOrigin {
  /** The chat thread/run the prompt was typed into. */
  threadRef: string;
  /** The message id — with the declared checkpoint_ref it forms the checkpoint id. */
  messageId: string;
  /** The exact words the person typed; the resume recompiles THESE, not a model rewrite. */
  verbatimText: string;
  /** The compiled intent parked behind the clarification. */
  intentId: string;
  intentRevision: string;
  /** Where the person was when they typed it (restoration target). */
  originSurface: string;
  originRoute: string;
  activeTab: string;
  originRecordRevisions: RevisionPair[];
  /** The declared unresolved slot this creation fills (its port type is read from the declaration's return type). */
  slotName: string;
}

export type CheckpointBuild =
  | { valid: true; checkpoint: PendingIntentCheckpoint; journey: JourneyDeclarationRef }
  | { valid: false; diagnostics: ContractDiagnostic[] };

/** Park the origin turn. `declaration` defaults to the SHIPPED noun-create
 * document; a caller may pass a parsed document (a test mutates its own copy
 * and measures that the checkpoint follows the document, not this module). */
export function buildNounCreateCheckpoint(
  origin: NounCreateOrigin,
  declaration?: unknown,
): CheckpointBuild {
  const document = declaration ?? loadJourneyDocument(NOUN_CREATION_JOURNEY_ID);
  if (document === undefined)
    return { valid: false, diagnostics: [{ code: 'journey-declaration-missing', path: '/', message: `no shipped declaration declares journey_id '${NOUN_CREATION_JOURNEY_ID}'` }] };
  const journey = journeyRefFromDocument(document);
  const doc: PendingIntentCheckpoint = {
    checkpoint_id: `${journey.checkpointRef}:${origin.messageId}`,
    journey_ref: journey.journeyId,
    revision: String(journey.revision),
    thread_ref: origin.threadRef,
    request_anchor: { message_id: origin.messageId, verbatim_text: origin.verbatimText },
    pending_intent: { intent_id: origin.intentId, intent_revision: origin.intentRevision },
    unresolved_slots: [{ name: origin.slotName, semantic_type: expectedReturnTypeOf(journey) }],
    origin: {
      surface: origin.originSurface,
      route: origin.originRoute,
      active_tab: origin.activeTab,
      record_revisions: origin.originRecordRevisions,
    },
    restoration_state: {},
    expected_return_type: expectedReturnTypeOf(journey),
    status: 'pending',
    concurrency_version: 1,
  };
  const verdict = validateCheckpoint(doc, { messageText: origin.verbatimText });
  if (!verdict.valid) return { valid: false, diagnostics: verdict.diagnostics };
  return { valid: true, checkpoint: verdict.checkpoint, journey };
}

/** The port type a material creation returns. Read from the DECLARED vocabulary
 * of journey ports (the checkpoint contract validates it against
 * journey-port.schema.yaml $defs); the noun-create return contract's own
 * capability is journey.material-create, whose typed output is a
 * MaterialReference. NOT a door, a surface or a route. */
export const NOUN_CREATION_RETURN_TYPE: ExpectedReturnType = 'MaterialReference';

function expectedReturnTypeOf(_journey: JourneyDeclarationRef): ExpectedReturnType {
  return NOUN_CREATION_RETURN_TYPE;
}

export interface MaterialCreationResult {
  /** The ONE record the governed accept committed. */
  committedRecordId: string;
  /** The committed revision (the revision token the return cites). */
  committedRevision: string;
  /** The declared result type the completion declares (`completed` / `abandoned`). */
  resultType: string;
  /** The actor who accepted the draft, and when. */
  acceptedBy: { actor: string; at: string };
}

export type NounCreateReturn =
  | {
      kind: 'resume';
      checkpointId: string;
      /** The origin words, verbatim — the request the caller recompiles. */
      originPromptText: string;
      /** The delta entry that fills the declared MaterialReference slot. */
      delta: ContextDelta;
      /** The declared checkpoint the intent resumes at. */
      checkpointRef: string;
      /** `return_contract.require_explicit_resume` — the caller must get a person's confirmation. */
      requireExplicitResume: boolean;
    }
  | { kind: 'refused'; code: string; message: string };

/**
 * Classify the return of a committed creation against its parked checkpoint.
 * Refuses (never guesses) when the checkpoint is not pending/resumable, when
 * the declared result type is not permitted, when the checkpoint's expected
 * return type disagrees with the committed record's kind, or when the return
 * classification says the delta must be re-presented instead of injected.
 */
export function resumeAfterMaterialCreation(input: {
  checkpoint: PendingIntentCheckpoint;
  journey: JourneyDeclarationRef;
  creation: MaterialCreationResult;
}): NounCreateReturn {
  const { checkpoint, journey, creation } = input;
  if (checkpoint.status === 'resumed')
    return { kind: 'refused', code: 'already-resumed', message: `checkpoint ${checkpoint.checkpoint_id} already resumed; a return is not re-fired and the creation is not committed twice` };
  if (checkpoint.status === 'cancelled')
    return { kind: 'refused', code: 'journey-cancelled', message: `checkpoint ${checkpoint.checkpoint_id} was cancelled; the journey stays active per on_cancel and no return is injected` };
  if (checkpoint.status === 'blocked')
    return { kind: 'refused', code: 'journey-blocked', message: `checkpoint ${checkpoint.checkpoint_id} is blocked; restoration is not redirected` };
  if (!journey.permittedResultTypes.includes(creation.resultType))
    return { kind: 'refused', code: 'return-result-not-permitted', message: `result '${creation.resultType}' is not one of the declared permitted_result_types (${journey.permittedResultTypes.join(', ')}) of ${journey.journeyId}` };
  if (creation.resultType !== 'completed')
    return { kind: 'refused', code: 'creation-not-completed', message: `result '${creation.resultType}' carries no committed record to inject` };
  if (checkpoint.expected_return_type !== NOUN_CREATION_RETURN_TYPE)
    return { kind: 'refused', code: 'return-type-mismatch', message: `checkpoint expects ${checkpoint.expected_return_type} but a material creation returns ${NOUN_CREATION_RETURN_TYPE}` };

  const slot = checkpoint.unresolved_slots.find((candidate) => candidate.semantic_type === checkpoint.expected_return_type);
  if (slot === undefined)
    return { kind: 'refused', code: 'slot-undetermined', message: `checkpoint ${checkpoint.checkpoint_id} declares no unresolved slot of type ${checkpoint.expected_return_type}` };

  const delta: ContextDelta = {
    delta_id: `${checkpoint.checkpoint_id}:return:${creation.committedRecordId}`,
    entries: [
      {
        kind: 'unresolved-slot',
        canonical_value: `record:${creation.committedRecordId}`,
        semantic_type: checkpoint.expected_return_type,
        source_records: [{ record_id: creation.committedRecordId, revision: creation.committedRevision }],
        source_journey_ref: journey.journeyId,
        source_step_id: slot.name,
        evidence: [`chat-message:${checkpoint.request_anchor.message_id}`],
        epistemic_status: 'observed',
        accepted_by: { actor: creation.acceptedBy.actor, at: creation.acceptedBy.at },
      },
    ],
  };
  const classification = classifyReturnPayload(delta, checkpoint);
  if (classification.disposition !== 'inject') {
    const code: InjectionRefusal | string = classification.code ?? 'request-revision-required';
    return { kind: 'refused', code, message: `return payload for ${creation.committedRecordId} must be re-presented to the person, not injected (${code})` };
  }
  return {
    kind: 'resume',
    checkpointId: checkpoint.checkpoint_id,
    originPromptText: checkpoint.request_anchor.verbatim_text,
    delta,
    checkpointRef: journey.checkpointRef,
    requireExplicitResume: journey.requireExplicitResume,
  };
}
