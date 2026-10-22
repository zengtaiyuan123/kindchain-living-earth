#!/usr/bin/env node
// Read-only. Never source the env file, contact providers, or print values.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

const groups = {
  existingDatabase: ['DATABASE_URL', 'DIRECT_URL'],
  existingGoogleLogin: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'],
  payments: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  existingEmailService: ['RESEND_API_KEY'],
  independentEmailLogin: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'AUTH_ORIGIN'],
  independentStorage: ['KINDCHAIN_D1_ID', 'KINDCHAIN_D1_NAME', 'KINDCHAIN_R2_BUCKET'],
};
const placeholders = /^(?:YOUR[_ -]|REPLACE[_ -]|CHANGEME|TODO|EXAMPLE|<|\$\{)/i;
function status(key, value) {
  if (!value?.trim()) return 'missing';
  if (placeholders.test(value) || /YOUR_PROJECT|YOUR_KINDCHAIN_DOMAIN|your-project|your-domain|localhost|example\.com/i.test(value)) return 'placeholder';
  if (['DATABASE_URL','DIRECT_URL'].includes(key)) {
    try { if (!['postgres:','postgresql:'].includes(new URL(value).protocol)) return 'invalid_format'; } catch {return 'invalid_format';}
  }
  if (['SUPABASE_URL','AUTH_ORIGIN','NEXTAUTH_URL'].includes(key)) {
    try { const u=new URL(value); if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')return 'invalid_format'; } catch {return 'invalid_format';}
  }
  if (key==='SUPABASE_PUBLISHABLE_KEY') {
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) {
      try {const parts=value.split('.');if(parts.length!==3||JSON.parse(Buffer.from(parts[1],'base64url')).role!=='anon')return 'wrong_key_type';}catch{return 'wrong_key_type';}
    }
  }
  if(key==='STRIPE_SECRET_KEY'&&!/^(sk|rk)_(test|live)_\S+$/.test(value))return 'invalid_format';
  if(key==='STRIPE_WEBHOOK_SECRET'&&!/^whsec_\S+$/.test(value))return 'invalid_format';
  if(key==='KINDCHAIN_D1_ID'&&(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)||/^00000000-0000-/.test(value)))return 'invalid_format';
  return 'present_unverified';
}
export function inspectEnv(text) {
  if (Buffer.byteLength(text)>65536) throw Error('env_too_large');
  const parsed=parseEnv(text), result={};
  for(const [group,keys] of Object.entries(groups)) {
    result[group]=Object.fromEntries(keys.map(key=>[key,status(key,parsed[key])]));
  }
  return {
    credentials: result,
    stripeMode: /^(sk|rk)_live_/.test(parsed.STRIPE_SECRET_KEY||'')?'live':/^(sk|rk)_test_/.test(parsed.STRIPE_SECRET_KEY||'')?'test':'unknown',
    verifiedWithProviders:false,
    notes:['Values, URLs and unknown keys are deliberately omitted.',
      'PostgreSQL connection strings do not configure D1 or Supabase Auth.',
      'Google OAuth credentials do not enable Hotmail email OTP.',
      'Present means local configuration exists; delivery, ownership, permissions and provider acceptance remain unverified.',
      'This command never changes keys, deploys, sends email, charges money or migrates data.']
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--env'){console.error('Usage: node check-handover.mjs --env /path/to/production.env');process.exitCode=2;}
  else try {console.log(JSON.stringify(inspectEnv(readFileSync(args[1],'utf8')),null,2));}
  catch {console.error('Unable to inspect configuration. Check file access, size and dotenv format locally. No values were printed.');process.exitCode=1;}
}
