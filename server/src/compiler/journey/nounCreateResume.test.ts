/**
 * nounCreateResume.test.ts — L2-NOUN-CREATION-JOURNEY-1 (unit u1journey).
 *
 * Pins the RETURN leg: the parked checkpoint is built FROM
 * config/journey/declarations/noun-create.yaml (rename the declared
 * checkpoint_ref and the id moves), the return binds the committed record BY
 * IDENTITY and hands back the origin prompt verbatim for recompilation, and no
 * second return/commit is possible once resumed.
 */
import { describe, expect, it } from 'vitest';
import {
  buildNounCreateCheckpoint,
  resumeAfterMaterialCreation,
  type NounCreateOrigin,
} from './nounCreateResume.js';
import {
  journeyRefFromDocument,
  loadJourneyDeclaration,
  loadJourneyDocument,
  NOUN_CREATION_JOURNEY_ID,
} from './journeyDeclarationDoors.js';
import type { PendingIntentCheckpoint } from './checkpointContract.js';

const ORIGIN: NounCreateOrigin = {
  threadRef: 'thread-run-1',
  messageId: 'msg-1',
  verbatimText: 'Add 100uL of DMEM to each well.',
  intentId: 'intent-1',
  intentRevision: '3',
  originSurface: 'run-page',
  originRoute: '/runs/run-1',
  activeTab: 'chat',
  originRecordRevisions: [{ record_id: 'run:run-1', revision: '7' }],
  slotName: 'material',
};

function parked(): { checkpoint: PendingIntentCheckpoint; journey: ReturnType<typeof journeyRefFromDocument> } {
  const built = buildNounCreateCheckpoint(ORIGIN);
  if (!built.valid) throw new Error(`checkpoint refused: ${JSON.stringify(built.diagnostics)}`);
  return { checkpoint: built.checkpoint, journey: built.journey };
}

const CREATION = {
  committedRecordId: 'material:DMEM',
  committedRevision: '1',
  resultType: 'completed',
  acceptedBy: { actor: 'brad', at: '2026-11-16T22:00:00Z' },
};

describe('noun-create return leg — declared checkpoint, identity-bound return', () => {
  it('parks the origin turn at the DECLARED checkpoint with a declared MaterialReference slot', () => {
    const { checkpoint, journey } = parked();
    const declared = loadJourneyDeclaration(NOUN_CREATION_JOURNEY_ID);
    expect(declared).toBeDefined();
    expect(checkpoint.journey_ref).toBe(NOUN_CREATION_JOURNEY_ID);
    expect(checkpoint.journey_ref).toBe(declared!.journeyId);
    expect(checkpoint.revision).toBe(String(declared!.revision));
    expect(checkpoint.checkpoint_id).toBe(`${declared!.checkpointRef}:msg-1`);
    expect(checkpoint.expected_return_type).toBe('MaterialReference');
    expect(checkpoint.unresolved_slots).toEqual([
      expect.objectContaining({ name: 'material', semantic_type: 'MaterialReference' }),
    ]);
    expect(checkpoint.request_anchor.verbatim_text).toBe('Add 100uL of DMEM to each well.');
    expect(checkpoint.status).toBe('pending');
    expect(checkpoint.concurrency_version).toBe(1);
    // declaration-driven: the checkpoint follows the document, not this module
    expect(journey.checkpointRef).toBe(declared!.checkpointRef);
    expect(journey.permittedResultTypes).toEqual(['completed', 'abandoned']);
    expect(journey.requireExplicitResume).toBe(true);
  });

  it('re-emitting the same turn yields the SAME checkpoint id (a reload cannot park it twice)', () => {
    expect(parked().checkpoint.checkpoint_id).toBe(parked().checkpoint.checkpoint_id);
  });

  it('renaming the DECLARED checkpoint_ref moves the parked id (no second authority)', () => {
    const document = loadJourneyDocument(NOUN_CREATION_JOURNEY_ID);
    expect(document).toBeDefined();
    const copy = JSON.parse(JSON.stringify(document)) as {
      return_contract: { checkpoint_ref: string; permitted_result_types: string[] };
    };
    copy.return_contract.checkpoint_ref = 'cp-renamed';
    copy.return_contract.permitted_result_types = ['completed'];
    const built = buildNounCreateCheckpoint(ORIGIN, copy);
    expect(built.valid).toBe(true);
    if (!built.valid) return;
    expect(built.checkpoint.checkpoint_id).toBe('cp-renamed:msg-1');
    expect(built.journey.permittedResultTypes).toEqual(['completed']);
  });

  it('a completed creation resumes the ORIGIN prompt verbatim and injects the committed record by identity', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({ checkpoint, journey, creation: CREATION });
    expect(result.kind).toBe('resume');
    if (result.kind !== 'resume') return;
    expect(result.originPromptText).toBe(ORIGIN.verbatimText);
    expect(result.checkpointRef).toBe(journey.checkpointRef);
    expect(result.requireExplicitResume).toBe(true);
    expect(result.delta.entries).toHaveLength(1);
    expect(result.delta.entries[0]).toMatchObject({
      kind: 'unresolved-slot',
      semantic_type: 'MaterialReference',
      canonical_value: 'record:material:DMEM',
      source_records: [{ record_id: 'material:DMEM', revision: '1' }],
      evidence: ['chat-message:msg-1'],
      epistemic_status: 'observed',
    });
    expect(result.delta.request_revision).toBeUndefined();
  });

  it('one committed effect: a resumed checkpoint cannot return again', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({
      checkpoint: { ...checkpoint, status: 'resumed' },
      journey,
      creation: CREATION,
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'already-resumed' });
  });

  it('cancel keeps the journey active and injects nothing', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({
      checkpoint: { ...checkpoint, status: 'cancelled' },
      journey,
      creation: CREATION,
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'journey-cancelled' });
  });

  it('a result the DECLARATION does not permit is refused, not coerced', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({
      checkpoint,
      journey,
      creation: { ...CREATION, resultType: 'partial' },
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'return-result-not-permitted' });
  });

  it('abandoned is permitted but carries no record, so nothing is injected', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({
      checkpoint,
      journey,
      creation: { ...CREATION, resultType: 'abandoned' },
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'creation-not-completed' });
  });

  it('a checkpoint of another port type is refused rather than injected', () => {
    const { checkpoint, journey } = parked();
    const result = resumeAfterMaterialCreation({
      checkpoint: { ...checkpoint, expected_return_type: 'SequenceSetReference' },
      journey,
      creation: CREATION,
    });
    expect(result).toMatchObject({ kind: 'refused', code: 'return-type-mismatch' });
  });
});
