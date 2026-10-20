import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { SequenceService } from '../sequences/SequenceService.js';
import { sequenceRequestDiagnostics } from '../sequences/sequenceRequestFidelity.js';
import { compileWorkstateIntent, workstateDepsFromContext } from './workstateCompile.js';
import { compileAnalysisIntent, analysisDepsFromContext } from './analysisCompile.js';
import { compileRecordDraftIntent, recordDraftDepsFromContext } from './recordDraftCompile.js';
import { compileReceivingIntent, receivingDepsFromContext } from '../receiving/MaterialReceivingDraft.js';
import { MATERIAL_RECEIVING_SCHEMA_ID, MATERIAL_INSTANCE_SCHEMA_ID } from '../receiving/MaterialReceivingAcceptService.js';

export interface DraftAdapter {
  checkRequest?(intent: Record<string,unknown>, userRequest?: string): Array<{path:string; message:string}>;
  stage(context: AppContext, actor: string, intent: Record<string,unknown>, targetId: string|undefined, now: ()=>string): Promise<Record<string,unknown>>;
  project(projection: Record<string,unknown>, writes: RecordEnvelope[]): Record<string,unknown>;
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
  'receiving': {
    async stage(context,_actor,intent,_targetId,now) {
      const compiled = await compileReceivingIntent(intent, receivingDepsFromContext(context, now));
      if(!compiled.ok)throw new Error(compiled.diagnostics.join('; '));
      const receipt = await context.store.create({ envelope:{ recordId:compiled.recordId!, schemaId:MATERIAL_RECEIVING_SCHEMA_ID, payload:compiled.envelope }, message:`Receiving draft staged create` });
      if(!receipt.success)throw new Error(`staged receipt create blocked: ${receipt.error ?? 'validation/lint failure'}`);
      // A correction NEVER stages the instance write: supersession is not a
      // second arrival — the entity already exists (§7 bait 9; the §5.3 suite
      // asserts instance/aliquot id lists byte-equal across a correction).
      if(!compiled.isCorrection){
        const instance = await context.store.create({ envelope:{ recordId:compiled.instanceRecordId!, schemaId:MATERIAL_INSTANCE_SCHEMA_ID, payload:compiled.instancePayload }, message:`Receiving draft staged instance create` });
        if(!instance.success)throw new Error(`staged instance create blocked: ${instance.error ?? 'validation/lint failure'}`);
      }
      return { recordId:compiled.recordId, instanceRecordId:compiled.instanceRecordId, envelope:compiled.envelope, instancePayload:compiled.instancePayload };
    },
    project(projection) {
      // The projection is the intent echo; the card document rides in `result`
      // and the two staged creates (receipt + instance) ride in `writes`.
      return projection;
    },
  },
};
