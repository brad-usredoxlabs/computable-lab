import { API_BASE, getCurrentUserId, getSessionToken } from '../shared/api/base'
async function workspaceApi<T = any>(path: string, body?: unknown): Promise<T> {
 const headers: Record<string,string>={}
 const actor=getCurrentUserId();const token=getSessionToken()
 if(actor)headers['x-user-id']=actor
 if(token)headers['x-cl-session']=token
 const form=body instanceof FormData
 if(body!==undefined&&!form)headers['Content-Type']='application/json'
 const response=await fetch(`${API_BASE}${path}`,{method:body===undefined?'GET':'POST',headers,...(body!==undefined?{body:form?body:JSON.stringify(body)}:{})})
 const result=await response.json()
 if(!response.ok)throw Object.assign(new Error(result.message??result.error??`HTTP ${response.status}`),{status:response.status})
 return result as T
}
export function requestId() {
 const bytes=new Uint8Array(12);crypto.getRandomValues(bytes)
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')
}
export function recordRef(id:string,type='sequence') {return {kind:'record',id,type}}

export const sequenceApi = <T = any>(path:string,body?:unknown) => workspaceApi<T>(`/sequences${path}`,body)
export const draftApi = <T = any>(path:string,body:unknown) => workspaceApi<T>(`/drafts${path}`,body)
