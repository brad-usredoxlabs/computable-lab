export interface NativeCompilation {
  draftId: string; revision: number; reviewHash: string; canAccept: boolean
  projection: Record<string,any>; diagnostics: Array<{message:string; severity:string}>
  writes: Array<{recordId:string; payload:Record<string,any>}>
  normalizedIntent?: {payload:Record<string,any>}
}
export interface NativeDraftState {
  active: boolean; pending: boolean; saving: boolean; incomplete: boolean; error: string
  compiled: NativeCompilation|null; intent: Record<string,any>
}
type Api = (body:any)=>Promise<any>
/** Serializes deterministic revisions and prevents late responses from replacing newer edits. */
export class NativeDraftController {
  state: NativeDraftState = {active:false,pending:false,saving:false,incomplete:false,error:'',compiled:null,intent:{}}
  private baseline: any
  private target: any
  private userRequest: string|undefined
  private generation=0
  private editVersion=0
  private current: NativeCompilation|null=null
  private work: Promise<void> = Promise.resolve()
  constructor(private compileApi: Api, private acceptApi: Api, private changed: (state:NativeDraftState)=>void=()=>{}) {}
  private emit(patch: Partial<NativeDraftState>) {this.state={...this.state,...patch};this.changed(this.state)}
  propose(baseline: any, intent: Record<string,any>, target?: {recordId:string;contentHash?:string}, userRequest?: string) {
    if(this.state.saving||this.state.incomplete)throw new Error('Save is in progress; retry acceptance before editing.')
    if(!this.state.active)this.baseline=structuredClone(baseline)
    if(!this.state.active||this.target?.recordId!==target?.recordId){
      this.generation++;this.current=null;this.target=target
      this.emit({pending:false})
    }
    this.edit(intent,userRequest)
  }
  edit(intent: Record<string,any>, userRequest?: string) {
    if(this.state.saving||this.state.incomplete) throw new Error('Save is in progress; retry acceptance before editing.')
    this.editVersion++
    // Direct form edits explicitly supersede the earlier AI request.
    this.userRequest=userRequest
    const running=this.state.pending
    this.emit({active:true,intent:structuredClone(intent),pending:true,error:'',compiled:null})
    if(!running){const generation=this.generation;this.work=this.run(generation)}
  }
  private async run(generation:number) {
    while(generation===this.generation && this.state.pending){
      const version=this.editVersion
      const intent=structuredClone(this.state.intent)
      try {
        const result=await this.compileApi({adapter:'sequence-authoring',intent,...(this.userRequest?{userRequest:this.userRequest}:{}),...(this.target?{target:this.target}:{}),...(this.current?{draftId:this.current.draftId,revision:this.current.revision}:{})}) as NativeCompilation
        if(generation!==this.generation)return
        this.current=result
        if(version===this.editVersion)this.emit({compiled:result,pending:false})
      } catch(error) {
        if(generation!==this.generation)return
        if(version!==this.editVersion)continue
        this.emit({pending:false,error:(error as Error).message})
      }
    }
  }
  idle(){return this.work}
  reject() {
    if(this.state.saving||this.state.incomplete)throw new Error('Save may be incomplete; retry acceptance before leaving.')
    const baseline=structuredClone(this.baseline)
    this.generation++;this.current=null
    this.emit({active:false,pending:false,compiled:null,intent:{},error:''})
    return baseline
  }
  async accept() {
    const draft=this.state.compiled
    if(!draft?.canAccept||this.state.pending||this.state.saving)throw new Error('The draft is not ready to accept.')
    this.emit({saving:true,error:''})
    try {
      const result=await this.acceptApi({draftId:draft.draftId,revision:draft.revision,reviewHash:draft.reviewHash})
      this.generation++;this.current=null
      this.emit({active:false,pending:false,saving:false,incomplete:false,compiled:null,intent:{}})
      return result
    }catch(error){
      const status=(error as {status?:number}).status
      this.emit({saving:false,incomplete:status===undefined||status>=500,error:(error as Error).message,...(status===409?{compiled:{...draft,canAccept:false}}:{})})
      throw error
    }
  }
}
