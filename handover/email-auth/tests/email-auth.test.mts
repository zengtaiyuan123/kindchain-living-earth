import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailAuth,safeReturn,isPublicAuthKey} from '../worker/email-auth';
import {requestIdentity,requireScope} from '../lib/request-security';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_ORIGIN:'https://kindchain.test'};
const token='a'.repeat(40), session=`__Host-kindchain_session=${token}`;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const user=(id=a)=>new Response(JSON.stringify({id,email:id+'@example.com',email_confirmed_at:'2026-01-01'}));
const next=async(r:Request)=>Response.json(Object.fromEntries(r.headers));
const req=(path='/',headers:Record<string,string>={})=>new Request('https://kindchain.test'+path,{headers});
const post=(path:string,data:Record<string,string>,origin='https://kindchain.test')=>new Request('https://kindchain.test'+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
const fake=(f:(input:any,init?:RequestInit)=>Promise<Response>)=>f as typeof fetch;
const never=fake(async()=>{throw Error('must not call')});
test('all provider-supplied identity headers are stripped on anonymous requests',async()=>{const r=await emailAuth(req('/',{'oai-authenticated-user-id':a,'oai-authenticated-user-email':'evil@example.com','oai-authenticated-user-full-name':'evil'}),env,next,never);const h=await r.json();assert.equal(h['oai-authenticated-user-id'],undefined);assert.equal(h['oai-authenticated-user-full-name'],undefined)});
test('missing configuration fails closed',async()=>{assert.equal((await emailAuth(req('/auth/login'),{},next,never)).status,503)});
test('login page is mobile-ready, accessible and does not claim magic delivery',async()=>{const r=await emailAuth(req('/auth/login'),env,next,never);const html=await r.text();assert.match(html,/viewport/);assert.match(html,/autocomplete="one-time-code"/);assert.match(html,/Gmail、Hotmail/);assert.equal(r.headers.get('cache-control'),'private, no-store')});
test('redirects reject foreign and authentication destinations',()=>{for(const p of ['https://evil.com','//evil.com','/\\evil.com','/auth/login','/a/../auth/login','/\n/evil.com'])assert.equal(safeReturn(p),'/');assert.equal(safeReturn('/studio?work=x#edit'),'/studio?work=x#edit')});
test('send requests create-user OTP for any email domain',async()=>{let calls=0;const r=await emailAuth(post('/auth/send',{email:'someone@hotmail.com'}),env,next,fake(async(url,init)=>{calls++;assert.match(String(url),/\/auth\/v1\/otp$/);assert.deepEqual(JSON.parse(String(init?.body)),{email:'someone@hotmail.com',create_user:true});return new Response('{}')}));assert.equal(r.status,200);assert.equal(calls,1)});
test('cross-origin send and verify fail before provider call',async()=>{for(const p of ['/auth/send','/auth/verify','/auth/logout'])assert.equal((await emailAuth(post(p,{email:'a@example.com',code:'123456'},'https://evil.com'),env,next,never)).status,403)});
test('oversized and invalid email forms rejected',async()=>{assert.equal((await emailAuth(post('/auth/send',{email:'bad'}),env,next,never)).status,400);assert.equal((await emailAuth(post('/auth/send',{email:'a'.repeat(5000)}),env,next,never)).status,400)});
test('provider errors never report email sent',async()=>{for(const status of [429,500]){const r=await emailAuth(post('/auth/send',{email:'a@example.com'}),env,next,fake(async()=>new Response('{}',{status})));assert.equal(r.status,status===429?429:503);assert.doesNotMatch(await r.text(),/验证码请求已提交/)}});
test('invalid and expired code does not establish session',async()=>{const r=await emailAuth(post('/auth/verify',{email:'a@example.com',code:'123456'}),env,next,fake(async()=>new Response('{}',{status:403})));assert.equal(r.status,400);assert.equal(r.headers.get('set-cookie'),null)});
test('successful verify uses protected access cookie, safe target, no refresh token',async()=>{const r=await emailAuth(post('/auth/verify',{email:'a@example.com',code:'123456',return_to:'//evil.com'}),env,next,fake(async(_url,init)=>{assert.equal(JSON.parse(String(init?.body)).type,'email');return Response.json({access_token:token,expires_in:7200,refresh_token:'do-not-store'})}));assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');const c=r.headers.get('set-cookie')!;for(const s of ['HttpOnly','Secure','SameSite=Lax','Max-Age=3600'])assert.ok(c.includes(s));assert.ok(!c.includes('do-not-store'))});
test('provider outage cannot downgrade an account request to guest',async()=>{let reached=false;const r=await emailAuth(req('/api/identity',{cookie:session}),env,async()=>{reached=true;return new Response('')},never);assert.equal(r.status,503);assert.equal(reached,false)});
test('expired credentials fail and clear cookie',async()=>{const r=await emailAuth(req('/api/identity',{cookie:session}),env,next,fake(async()=>new Response('{}',{status:401})));assert.equal(r.status,401);assert.match(r.headers.get('set-cookie')!,/Max-Age=0/)});
test('malformed and duplicate session cookies cannot fall back to guest',async()=>{for(const cookie of ['__Host-kindchain_session=bad',session+'; '+session])assert.equal((await emailAuth(req('/',{cookie}),env,next,never)).status,401)});
test('two verified users have separate owners/scopes; stale account scope rejected',async()=>{const identities: Array<{owner:string;scope:string}>=[];for(const id of [a,b]){const r=await emailAuth(req('/',{cookie:session,'oai-authenticated-user-id':'spoof'}),env,async clean=>Response.json(await requestIdentity(clean,{})),fake(async()=>user(id)));assert.equal(r.headers.get('cache-control'),'private, no-store');identities.push(await r.json())}assert.notEqual(identities[0].owner,identities[1].owner);assert.notEqual(identities[0].scope,identities[1].scope);assert.throws(()=>requireScope(req('/',{'x-kindchain-context':identities[0].scope}),identities[1].scope));});
test('business POST body is preserved through gateway',async()=>{const r=await emailAuth(post('/api/example',{value:'preserved'}),env,async clean=>new Response(await clean.text()),never);assert.equal(await r.text(),'value=preserved')});
test('unverified users are rejected',async()=>{assert.equal((await emailAuth(req('/',{cookie:session}),env,next,fake(async()=>Response.json({id:a,email:'a@example.com'})))).status,401)});
test('logout GET does not mutate session, POST clears even on provider outage',async()=>{const r=await emailAuth(req('/auth/logout',{cookie:session}),env,next,never);assert.equal(r.headers.get('set-cookie'),null);const out=await emailAuth(post('/auth/logout',{return_to:'/account'}),env,next,never);assert.equal(out.status,303);assert.match(out.headers.get('set-cookie')!,/Max-Age=0/);assert.equal(out.headers.get('location'),'/account')});
test('expired API credentials return JSON even if the browser advertises HTML',async()=>{const r=await emailAuth(req('/api/studio',{cookie:session,accept:'text/html'}),env,next,fake(async()=>new Response('{}',{status:401})));assert.equal(r.status,401);assert.match(r.headers.get('content-type')!,/application\/json/);assert.equal((await r.json()).error,'authentication_required');assert.equal(r.headers.get('location'),null)});
test('configuration and upstream errors use JSON for API clients',async()=>{for(const [settings,headers] of [[{},{}],[env,{cookie:session}]] as const){const r=await emailAuth(req('/api/identity',headers),settings,next,never);assert.equal(r.status,503);assert.ok((await r.json()).message)}});
test('public terrain does not fetch account identity and strips forged identity',async()=>{const r=await emailAuth(req('/api/terrain/3/1/2',{cookie:session,'oai-authenticated-user-id':'spoof'}),env,next,never);assert.equal(r.status,200);assert.equal((await r.json())['oai-authenticated-user-id'],undefined);const guarded=await emailAuth(req('/api/studio',{cookie:session}),env,next,never);assert.equal(guarded.status,503)});
test('expired HTML navigation redirects to a safe return path',async()=>{const r=await emailAuth(req('/account',{cookie:session,accept:'text/html'}),env,next,fake(async()=>new Response('{}',{status:401})));assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/auth/login?return_to=%2Faccount')});
test('invalid provider session data cannot set a cookie',async()=>{for(const data of [{access_token:token,expires_in:0},{access_token:'bad;cookie',expires_in:60},{expires_in:60}]){const r=await emailAuth(post('/auth/verify',{email:'a@example.com',code:'123456'}),env,next,fake(async()=>Response.json(data)));assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null)}});
test('logout uses the current device scope and clears credential despite network failure',async()=>{const r=post('/auth/logout',{return_to:'/account'});r.headers.set('cookie',session);let called=false;const result=await emailAuth(r,env,next,fake(async(url,init)=>{called=true;assert.equal(new URL(String(url)).searchParams.get('scope'),'local');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);throw Error('offline')}));assert.ok(called);assert.equal(result.status,303);assert.match(result.headers.get('set-cookie')!,/Max-Age=0/)});

test('configuration accepts publishable and legacy anon keys only',()=>{
 const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.ok(isPublicAuthKey('sb_publishable_test'));
 assert.ok(isPublicAuthKey(jwt('anon')));
 for(const key of [undefined,'','sb_secret_test',jwt('service_role'),jwt('authenticated'),'broken','a.b.c'])assert.equal(isPublicAuthKey(key),false);
});
test('privileged keys fail closed without reaching provider or business routes',async()=>{
 let called=false;
 const forbidden=async()=>{called=true;return new Response('unexpected');};
 for(const key of ['sb_secret_example','a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.b']) {
  const r=await emailAuth(post('/auth/send',{email:'a@example.com'}),{...env,SUPABASE_PUBLISHABLE_KEY:key},forbidden,fake(forbidden));
  assert.equal(r.status,503);
 }
 assert.equal(called,false);
});
