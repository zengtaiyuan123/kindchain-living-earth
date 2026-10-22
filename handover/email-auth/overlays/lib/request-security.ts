import {GovernanceError} from './governance';
export async function digest(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
// These identity headers are trusted ONLY behind the Sites authentication proxy.
// An independent deployment must strip client headers and verify its own session.
export async function requestIdentity(request:Request,config:Record<string,string>){
 const admin=typeof config.KINDCHAIN_ADMIN_TOKEN==='string'&&config.KINDCHAIN_ADMIN_TOKEN.length>=16&&request.headers.get('x-kindchain-admin')===config.KINDCHAIN_ADMIN_TOKEN;
 const userId=request.headers.get('oai-authenticated-user-id');
 const signedIn=!!userId&&!!request.headers.get('oai-authenticated-user-email');
 const key=request.headers.get('x-kindchain-author')||'';
 const deviceOwner=/^[a-zA-Z0-9_-]{32,96}$/.test(key)?await digest(key):null;
 if(!admin&&!signedIn&&!deviceOwner)throw new GovernanceError(401,'identity','请登录或刷新页面以恢复设备凭证。');
 const owner=signedIn?'account:'+await digest(userId!):deviceOwner||'admin';
 const scope=await digest('kindchain-draft-scope:'+owner);
 // A stale tab must not read the newly selected account through any identity-aware route.
 if(request.headers.has('x-kindchain-context'))requireScope(request,scope);
 return {owner,deviceOwner,admin,signedIn,scope};
}
export function requireScope(request:Request,scope:string){if(request.headers.get('x-kindchain-context')!==scope)throw new GovernanceError(409,'account_changed','账户状态已改变。请先导出当前作品，再刷新页面；本次修改未保存。');}
export async function payload(request:Request,maxBytes=8192){
 if(new URL(request.url).origin!==request.headers.get('origin'))throw new GovernanceError(403,'origin','请求来源无效。');
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new GovernanceError(415,'json_required','请使用 JSON 请求。');
 const raw=await readLimitedBody(request,maxBytes);
 let p;try{p=JSON.parse(raw);}catch{throw new GovernanceError(400,'invalid','请求格式无效。');}
 if(!p||typeof p!=='object'||Array.isArray(p))throw new GovernanceError(400,'invalid','请求格式无效。');return p;
}

export async function readLimitedBody(request:Request,maxBytes:number){
 const reader=request.body?.getReader();if(!reader)throw new GovernanceError(400,'invalid','请求格式无效。');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new GovernanceError(413,'size','内容过长。');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder().decode(bytes);
}
