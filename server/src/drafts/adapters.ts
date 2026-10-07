import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { SequenceService } from '../sequences/SequenceService.js';
import { sequenceRequestDiagnostics } from '../sequences/sequenceRequestFidelity.js';
import { compileWorkstateIntent, workstateDepsFromContext } from './workstateCompile.js';

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
};
