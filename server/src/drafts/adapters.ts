import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { SequenceService } from '../sequences/SequenceService.js';
import { sequenceRequestDiagnostics } from '../sequences/sequenceRequestFidelity.js';

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
};
