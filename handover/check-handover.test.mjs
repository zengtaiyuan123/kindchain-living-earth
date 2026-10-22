import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEnv} from './check-handover.mjs';
test('report never contains secrets, connection strings or unknown keys',()=>{
 const secret='distinct-private-value-2198';
 const r=inspectEnv(`DATABASE_URL="postgresql://user:${secret}@private-host/db"\nNEXTAUTH_SECRET=${secret}\nUNKNOWN_PRIVATE=${secret}\nSTRIPE_SECRET_KEY=sk_live_${secret}`);
 const out=JSON.stringify(r);assert.ok(!out.includes(secret));assert.ok(!out.includes('private-host'));assert.ok(!out.includes('UNKNOWN_PRIVATE'));assert.equal(r.stripeMode,'live');assert.equal(r.verifiedWithProviders,false);
});
test('Postgres and Google credentials do not imply email OTP is configured',()=>{
 const r=inspectEnv('DATABASE_URL=postgresql://u:p@host/db\nGOOGLE_CLIENT_ID=abc\nGOOGLE_CLIENT_SECRET=xyz');
 assert.equal(r.credentials.existingDatabase.DATABASE_URL,'present_unverified');assert.equal(r.credentials.independentEmailLogin.SUPABASE_URL,'missing');
});
test('placeholders and unsafe origins remain unready',()=>{
 for(const origin of ['https://YOUR_KINDCHAIN_DOMAIN','http://host','https://u:p@host','https://host/path'])assert.notEqual(inspectEnv('AUTH_ORIGIN='+origin).credentials.independentEmailLogin.AUTH_ORIGIN,'present_unverified');
});
test('privileged authentication key rejected',()=>{
 for(const key of ['sb_secret_abc','x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x'])assert.equal(inspectEnv('SUPABASE_PUBLISHABLE_KEY='+key).credentials.independentEmailLogin.SUPABASE_PUBLISHABLE_KEY,'wrong_key_type');
});
test('public keys accepted only as unverified local configuration',()=>{
 const r=inspectEnv('SUPABASE_PUBLISHABLE_KEY=sb_publishable_examplekey');assert.equal(r.credentials.independentEmailLogin.SUPABASE_PUBLISHABLE_KEY,'present_unverified');
});
test('dotenv input remains data, never shell commands',()=>{
 const r=inspectEnv('NEXTAUTH_SECRET="$(echo NEVER_EXECUTE)"');assert.equal(r.credentials.existingGoogleLogin.NEXTAUTH_SECRET,'present_unverified');assert.ok(!JSON.stringify(r).includes('NEVER_EXECUTE'));
});
test('missing webhook is identified independently of an existing Stripe key',()=>{
 const r=inspectEnv('STRIPE_SECRET_KEY=sk_test_fixture');assert.equal(r.stripeMode,'test');assert.equal(r.credentials.payments.STRIPE_WEBHOOK_SECRET,'missing');
});
test('oversized files fail without echoing input',()=>{assert.throws(()=>inspectEnv('x'.repeat(65537)),/env_too_large/)});
