import test from 'node:test';import assert from 'node:assert/strict';
import {requestIdentity,requireScope,payload} from '../lib/request-security';
const origin='https://kindchain.example';
const req=(headers:Record<string,string>)=>new Request(origin,{headers});
const headers=(id:string)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':id+'@example.com','x-kindchain-author':'d'.repeat(32)});
test('accounts stay distinct on a shared device and ignore supplied owner/role fields',async()=>{
 const a=await requestIdentity(req(headers('alice')),{}),b=await requestIdentity(req({...headers('bob'),'x-owner':a.owner,'x-role':'admin'}),{});
 assert.notEqual(a.owner,b.owner);assert.notEqual(a.scope,b.scope);assert.equal(a.deviceOwner,b.deviceOwner);assert.equal(b.admin,false);
 assert.throws(()=>requireScope(req({'x-kindchain-context':a.scope}),b.scope),{status:409});
 requireScope(req({'x-kindchain-context':a.scope}),a.scope);
});
test('incomplete platform identity cannot create account ownership; admins need exact configured credential',async()=>{
 await assert.rejects(requestIdentity(req({'oai-authenticated-user-id':'alice'}),{}),{status:401});
 const guest=await requestIdentity(req({'oai-authenticated-user-id':'alice','x-kindchain-author':'d'.repeat(32)}),{});assert.equal(guest.signedIn,false);assert.ok(!guest.owner.startsWith('account:'));
 await assert.rejects(requestIdentity(req({'x-kindchain-admin':'wrong'}),{KINDCHAIN_ADMIN_TOKEN:'a'.repeat(32)}),{status:401});
 const admin=await requestIdentity(req({'x-kindchain-admin':'a'.repeat(32)}),{KINDCHAIN_ADMIN_TOKEN:'a'.repeat(32)});assert.equal(admin.admin,true);assert.equal(admin.signedIn,false);
});
const post=(body:string,extra:Record<string,string>={})=>new Request(origin,{method:'POST',headers:{origin,'content-type':'application/json',...extra},body});
test('mutations reject cross-origin, missing origin, non-JSON, arrays, and oversized UTF-8 bodies',async()=>{
 assert.deepEqual(await payload(post('{"ok":true}')),{ok:true});
 for(const foreign of ['https://evil.example','null',''])await assert.rejects(payload(post('{}',{origin:foreign})),{status:403});
 await assert.rejects(payload(post('{}',{'content-type':'text/plain'})),{status:415});
 for(const raw of ['[]','null','broken'])await assert.rejects(payload(post(raw)),{status:400});
 await assert.rejects(payload(post(JSON.stringify({message:'光'.repeat(3000)}))),{status:413});
});

test('all identity-aware reads reject stale account contexts including logout to guest',async()=>{
 const alice=await requestIdentity(req(headers('alice')),{});
 await assert.rejects(requestIdentity(req({...headers('bob'),'x-kindchain-context':alice.scope}),{}),{status:409});
 await assert.rejects(requestIdentity(req({'x-kindchain-author':'d'.repeat(32),'x-kindchain-context':alice.scope}),{}),{status:409});
 const matching=await requestIdentity(req({...headers('alice'),'x-kindchain-context':alice.scope}),{});
 assert.equal(matching.owner,alice.owner);
});
