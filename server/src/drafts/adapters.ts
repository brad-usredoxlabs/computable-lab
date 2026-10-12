import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { SequenceService } from '../sequences/SequenceService.js';
import { sequenceRequestDiagnostics } from '../sequences/sequenceRequestFidelity.js';
import { compileWorkstateIntent, workstateDepsFromContext } from './workstateCompile.js';
import { compileAnalysisIntent, analysisDepsFromContext } from './analysisCompile.js';

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
};
