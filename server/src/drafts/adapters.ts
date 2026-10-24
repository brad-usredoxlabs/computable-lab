import type { AppContext } from '../server.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { SequenceService } from '../sequences/SequenceService.js';
import { sequenceRequestDiagnostics } from '../sequences/sequenceRequestFidelity.js';
import { compileWorkstateIntent, workstateDepsFromContext } from './workstateCompile.js';
import { compileAnalysisIntent, analysisDepsFromContext } from './analysisCompile.js';
import { compileRecordDraftIntent, recordDraftDepsFromContext } from './recordDraftCompile.js';
import { compileReceivingIntent, receivingDepsFromContext } from '../receiving/MaterialReceivingDraft.js';
import { MATERIAL_RECEIVING_SCHEMA_ID, MATERIAL_INSTANCE_SCHEMA_ID } from '../receiving/receivingIdentity.js';
import { compileExecuteChainIntent, chainDepsFromContext } from '../chain/ExecuteChainDraft.js';
import { ATTESTATION_SCHEMA_ID as CHAIN_ATTESTATION_SCHEMA_ID, ALIQUOT_SCHEMA_ID as CHAIN_ALIQUOT_SCHEMA_ID, MATERIAL_DERIVATION_SCHEMA_ID as CHAIN_DERIVATION_SCHEMA_ID, MATERIAL_INSTANCE_SCHEMA_ID as CHAIN_INSTANCE_SCHEMA_ID } from '../chain/chainIdentity.js';

/** What an adapter's onAccept hook returns: the plan the generic accept loop
 *  writes, plus the per-record volatile-field exemptions (recordId -> payload
 *  field names exempt from the prior-content comparison). */
export interface AcceptOutcome {
  writes: RecordEnvelope[];
  volatileFields?: Record<string, string[]>;
}
export interface DraftAdapter {
  checkRequest?(intent: Record<string,unknown>, userRequest?: string): Array<{path:string; message:string}>;
  stage(context: AppContext, actor: string, intent: Record<string,unknown>, targetId: string|undefined, now: ()=>string): Promise<Record<string,unknown>>;
  project(projection: Record<string,unknown>, writes: RecordEnvelope[]): Record<string,unknown>;
  // Adapter-level accept-time composition (architect ruling MATRESRECV D1/D2
  // option (a)): an adapter MAY declare accept-time mechanics (stamping the
  // server's acceptance time into its staged writes) and FormDraftService's
  // generic accept loop invokes the hook iff the adapter declares it — the
  // same class of seam as stage/project/checkRequest. The loop NEVER
  // dispatches on an adapter name or a kind; an adapter without the hook is
  // byte-identical to before.
  onAccept?(writes: RecordEnvelope[], acceptNow: string, store: RecordStore): Promise<AcceptOutcome>;
}
/** Registration attaches mechanics to YAML contracts, without schema-name dispatch. */
export const draftAdapters: Readonly<Record<string,DraftAdapter>> = {
  'sequence-authoring': {
    checkRequest: sequenceRequestDiagnostics,
    async stage(context,actor,intent,targetId,now) {
      const service=new SequenceService(context,actor,now);
      service.validate(intent);
      if(targetId)intent.sequence={...object(intent.sequence),parentRevisionRef:await service.pin({id:targetId},['sequence'])};
      return service.apply(intent);
    },
    project(projection,writes) {
      const sequence=writes.find(w=>object(w.payload).kind==='sequence');
      return sequence?{...projection,sequence:{...object(projection.sequence),residues:object(sequence.payload).residues}}:projection;
    },
  },
  // PB-CH-2: tier-2 workstate proposals compile PROJECTION-ONLY — stage()
  // resolves the model's terms and projects a version:1 session document into
  // `result`, staging ZERO writes (so the accept write loop iterates an empty
  // set). Diagnostics become a stage failure, which the pipeline records as a
  // needs-missing-fact diagnostic with canAccept:false — the generic gate, not
  // an adapter-name branch.
  'workstate': {
    async stage(context,_actor,intent) {
      const compiled = await compileWorkstateIntent(intent, workstateDepsFromContext(context));
      if(!compiled.ok)throw new Error(compiled.diagnostics.map(d=>`${d.code} ${d.path}: ${d.message}`).join('; '));
      return {...compiled.result};
    },
    project(projection) {
      // Zero writes to fold in: the projection is the intent echo; the session
      // document rides in `result` (the accept response body).
      return projection;
    },
  },
  // PB-CH-5: analysis proposals compile onto the EXISTING analysis chain.
  // stage() resolves the model's terms through the same spine discipline,
  // stages AT MOST ONE analysis-run create (status `queued`, initiator = the
  // actor) through the context store — which during compile IS the staging
  // proxy (create-only; StagingStore.ts:22-30) — and projects the landing
  // tabs. The staged write folds through the existing accept loop
  // (FormDraftService.ts:170-184, ensureOwnerPolicy at :183); project()
  // returns the echo like the workstate adapter. Diagnostics become a stage
  // failure, which the pipeline records as needs-missing-fact with
  // canAccept:false — the generic gate, not an adapter-name branch. NOTHING
  // here imports or calls execute/promotion machinery (source-pin test).
  'analysis': {
    async stage(context,actor,intent) {
      const compiled = await compileAnalysisIntent(intent, analysisDepsFromContext(context), actor);
      if(!compiled.ok)throw new Error(compiled.diagnostics.map(d=>`${d.code} ${d.path}: ${d.message}`).join('; '));
      return {...compiled.result};
    },
    project(projection) {
      // The projection is the intent echo; the session document rides in
      // `result`, and the single staged analysis-run rides in `writes`.
      return projection;
    },
  },
  // QMS7-7 (OQ-1 ruling A): record-drafting proposals compile a model intent
  // into a full record envelope and stage AT MOST ONE create through the
  // staging store — the real schema validate + lint run at compile time
  // (StagingStore.ts:22-30), nothing durable before the reviewHash-verified
  // accept. stage() resolves kind→schema through the schema corpus
  // (properties.kind.const), derives the id from the schema's DECLARED
  // properties.id.pattern (no kind→schema map, no prefix table), embeds the
  // handler-identical provenance fields (OQ-2), and projects the card field
  // list from the schema's ui-v1 projection. The staged write folds through
  // the EXISTING accept loop (:176-184, ensureOwnerPolicy at :183).
  // Diagnostics become a stage failure, which the pipeline records as
  // needs-missing-fact with canAccept:false — the generic gate, not an
  // adapter-name branch. NO state/status field is ever written: the
  // draft-ness is the read-side lifecycle fallback (recordDraftCompile.ts).
  'record-drafting': {
    async stage(context,actor,intent,_targetId,now) {
      const compiled = await compileRecordDraftIntent(intent, recordDraftDepsFromContext(context), actor, now);
      if(!compiled.ok)throw new Error(compiled.diagnostics.map(d=>`${d.code} ${d.path}: ${d.message}`).join('; '));
      return {...compiled.result};
    },
    project(projection) {
      // The projection is the intent echo; the card document rides in `result`
      // and the single staged record create rides in `writes`.
      return projection;
    },
  },
  // MATRES-RECV (OQ-2 ratified): receiving proposals compile the elicited
  // intent into the attestation envelope + TWO staged creates (the immutable
  // material-receiving receipt + the material-instance it brings into
  // custody) through the staging store — the real schema validate + lint run
  // at compile time (StagingStore.ts:22-30), nothing durable before the
  // reviewHash-verified accept. A blocked business wall (the lot-requires-
  // product lint ERROR, the already-received gate) surfaces as a stage
  // failure, which the pipeline records as needs-missing-fact with
  // canAccept:false — the generic gate, not an adapter-name branch. The
  // scientist's reported lot inscription survives VERBATIM in the stored
  // draft input while blocked (r2 discard boundary). The accept write rides
  // the EXISTING accept loop; the append-only wall (appendOnlyKinds DATA)
  // keeps the stored receipt immutable.
  //
  // RATIFIED (architect ruling MATRESRECV D1/D2, option (a)): ABSENT-BEFORE-
  // ACCEPT. The draft envelope carries NO attestedAt (the compile output is
  // attestedAt-free); the receipt's attestedAt is the server's ACCEPTANCE
  // time, stamped by this adapter's onAccept hook from the rail's accept
  // clock — attestedAt is when the acceptance happened, occurredAt is when
  // the fact occurred (Q8). The volatileFields exemption the hook declares
  // is what makes a content-identical re-draft land the SAME record
  // idempotently (AC-2(ii)) instead of 409-ing on the accept-stamp delta.
  'receiving': {
    async stage(context,_actor,intent,_targetId,_now) {
      const compiled = await compileReceivingIntent(intent, receivingDepsFromContext(context));
      if(!compiled.ok)throw new Error(compiled.diagnostics.join('; '));
      const receipt = await context.store.create({ envelope:{ recordId:compiled.recordId!, schemaId:MATERIAL_RECEIVING_SCHEMA_ID, payload:compiled.envelope }, message:`Receiving draft staged create` });
      // Idempotence (ruling item B): if the compile's canonical lookup shows
      // the receipt already exists durably with content equal modulo
      // attestedAt, that IS the accepted form — a content-identical re-draft
      // derives the SAME deterministic id, and the already-accepted record is
      // the plan's outcome (no second gate, no second record — AC-2(ii)). A
      // DIFFERENT payload under the same id is a real collision and stays a
      // stage failure (blocked card).
      if(!receipt.success && compiled.alreadyAcceptedForm !== true)throw new Error(`staged receipt create blocked: ${receipt.error ?? 'validation/lint failure'}`);
      // A correction NEVER stages the instance write: supersession is not a
      // second arrival — the entity already exists (§7 bait 9; the §5.3 suite
      // asserts instance/aliquot id lists byte-equal across a correction).
      if(!compiled.isCorrection){
        const instance = await context.store.create({ envelope:{ recordId:compiled.instanceRecordId!, schemaId:MATERIAL_INSTANCE_SCHEMA_ID, payload:compiled.instancePayload }, message:`Receiving draft staged instance create` });
        // Create-if-absent identity: the entity the deterministic id names
        // already arrived durably => the same accepted form, never a re-mint.
        if(!instance.success && compiled.durableInstanceExists !== true)throw new Error(`staged instance create blocked: ${instance.error ?? 'validation/lint failure'}`);
      }
      return { recordId:compiled.recordId, instanceRecordId:compiled.instanceRecordId, envelope:compiled.envelope, instancePayload:compiled.instancePayload };
    },
    async onAccept(writes,acceptNow) {
      // Accept-time composition for THIS adapter's own plan: the receipt
      // envelope (identified by the schema id its staged create rode — never
      // a kind branch) gains the server's acceptance stamp. occurredAt is
      // byte-untouched (r2 §1: the server never writes a time the scientist
      // stated). The exemption map names exactly the stamped key.
      const stamped = writes.map(w => w.schemaId === MATERIAL_RECEIVING_SCHEMA_ID
        ? { ...w, payload: { ...object(w.payload), attestedAt: acceptNow } }
        : w);
      const receipt = stamped.find(w => w.schemaId === MATERIAL_RECEIVING_SCHEMA_ID);
      return { writes: stamped, ...(receipt ? { volatileFields: { [receipt.recordId]: ['attestedAt'] } } : {}) };
    },
    project(projection) {
      // The projection is the intent echo; the card document rides in `result`
      // and the two staged creates (receipt + instance) ride in `writes`.
      return projection;
    },
  },
  // MATRES-CHAIN (OQ-1(a)/OQ-2(b)/OQ-3(a) rulings): the execute-chain adapter.
  // ONE elicited intent (compose_execute_chain on the ONE forced agent_intent
  // tool) compiles the chain record-graph — material-derivation (preparation) +
  // the prepared material-instance + N aliquots + ONE attestation-chain
  // envelope (the FULFIL fulfillment claims ride INSIDE the same envelope, D2)
  // — through the staging store (the REAL schema validate + lint run at compile;
  // nothing durable before the reviewHash-verified accept). The business walls
  // (mixed-parentage orphan shape, the elicitation wall, the occurred pairings,
  // the OQ-1(a) cross-session refusal, the shipped chain-no-proposed wall) are
  // chain-draft.lint.yaml + attestation.lint.yaml DATA; the arithmetic ACs
  // (sum<=prepared, count reconcile) are execute-chain-arithmetic.yaml DATA via
  // the pure evaluator (chainArithmetic.ts). A blocked wall surfaces as a stage
  // failure -> needs-missing-fact with canAccept:false (the generic gate, not an
  // adapter-name branch). ALL ids are deterministic seed-hashes over (draft
  // content, plan coordinate) (D4) — a re-draft of identical content lands the
  // SAME ids; the idempotence lookup (canonical LIST view, the RECV ruling item
  // B shape) makes the already-accepted form the plan's outcome: no second gate,
  // no second chain (AC-2). Consumption is staged at CREATION for the
  // born-in-session aliquot (OQ-1(a)); the cross-session case is refused by the
  // lint rule, never silently converted (bait 12). The staged creates are
  // HUMAN-REVIEWED (adapters.yaml humanReviewedCreate: true).
  //
  // RATIFIED (rail ruling (a), the receiving precedent): ABSENT-BEFORE-ACCEPT.
  // The draft envelope carries NO attestedAt; the chain attestation's attestedAt
  // is the server's ACCEPTANCE time, stamped by this adapter's onAccept hook
  // from the rail's accept clock (identified by the schema id its staged create
  // rode — never a kind branch). The volatileFields exemption the hook declares
  // is what makes a content-identical re-draft land the SAME records
  // idempotently instead of 409-ing on the accept-stamp delta (bait 2).
  // occurredAt is byte-untouched end-to-end.
  'chain': {
    async stage(context,_actor,intent,_targetId,_now) {
      const compiled = await compileExecuteChainIntent(intent, chainDepsFromContext(context));
      if(!compiled.ok)throw new Error(compiled.diagnostics.join('; '));
      const durable = compiled.durableAcceptedIds ?? new Set<string>();
      // The instructed (plan-side) posture stages ONLY the plan-side envelope:
      // ZERO physical records (acceptance attests NOTHING physical, P2/§7.2).
      const plan = compiled.attestsNothingPhysical === true
        ? [{ recordId:compiled.recordId!, schemaId:CHAIN_ATTESTATION_SCHEMA_ID, payload:compiled.envelope! }]
        : [
            { recordId:compiled.derivationRecordId!, schemaId:CHAIN_DERIVATION_SCHEMA_ID, payload:compiled.derivationPayload! },
            { recordId:compiled.instanceRecordId!, schemaId:CHAIN_INSTANCE_SCHEMA_ID, payload:compiled.instancePayload! },
            ...(compiled.aliquotPayloads ?? []).map((payload,i) => ({ recordId:compiled.aliquotRecordIds![i]!, schemaId:CHAIN_ALIQUOT_SCHEMA_ID, payload })),
            { recordId:compiled.recordId!, schemaId:CHAIN_ATTESTATION_SCHEMA_ID, payload:compiled.envelope! },
          ];
      for(const write of plan){
        const created = await context.store.create({ envelope:write, message:'Execute-chain draft staged create' });
        // Create-if-absent identity (the RECV ruling item B): the deterministic
        // id names a record the durable store ALREADY holds with content equal
        // modulo the acceptance stamp => that IS the accepted form (no re-mint,
        // no second chain). A DIFFERENT payload under the same id is a real
        // collision and stays a stage failure (blocked card).
        if(!created.success && !durable.has(write.recordId))throw new Error(`staged chain write blocked (${write.recordId}): ${created.error ?? 'validation/lint failure'}`);
      }
      return {
        recordId:compiled.recordId,
        derivationRecordId:compiled.derivationRecordId,
        instanceRecordId:compiled.instanceRecordId,
        aliquotRecordIds:compiled.aliquotRecordIds,
        envelope:compiled.envelope,
        summary:compiled.summary,
        // §7.5: the SERVER-BUILT card document + the landing sessionDocument
        // ride in `result` (the record-drafting doctrine — the client renders
        // them verbatim; the executor applies the landing on Accept).
        card:compiled.card,
        ...(compiled.sessionDocument !== undefined ? { sessionDocument:compiled.sessionDocument } : {}),
        ...(compiled.fulfillmentNote !== undefined ? { fulfillmentNote:compiled.fulfillmentNote } : {}),
        ...(compiled.attestsNothingPhysical === true ? { attestsNothingPhysical:true } : {}),
      };
    },
    async onAccept(writes,acceptNow) {
      // Accept-time composition for THIS adapter's own plan: the attestation
      // envelope (identified by the schema id its staged create rode — never a
      // kind branch) gains the server's acceptance stamp. The physical records
      // (derivation/instance/aliquots) are NOT stamped; occurredAt is
      // byte-untouched (the server never writes a time the scientist stated).
      // The exemption map names exactly the stamped key.
      const stamped = writes.map(w => w.schemaId === CHAIN_ATTESTATION_SCHEMA_ID
        ? { ...w, payload: { ...object(w.payload), attestedAt: acceptNow } }
        : w);
      const attestation = stamped.find(w => w.schemaId === CHAIN_ATTESTATION_SCHEMA_ID);
      return { writes: stamped, ...(attestation ? { volatileFields: { [attestation.recordId]: ['attestedAt'] } } : {}) };
    },
    project(projection) {
      // The projection is the intent echo; the card document rides in `result`
      // and the chain's staged creates ride in `writes`.
      return projection;
    },
  },
};
