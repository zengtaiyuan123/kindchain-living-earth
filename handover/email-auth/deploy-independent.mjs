import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function validateIndependentConfig(config) {
  const db = config.d1_databases?.find(d=>d.binding==='DB');
  if(config.name!=='kindchain-independent' || typeof db?.database_id!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db.database_id) || ['00000000-0000-4000-8000-000000000000','00000000-0000-0000-0000-000000000000'].includes(db.database_id)) throw Error('Set a real KINDCHAIN_D1_ID before building.');
  if(!config.r2_buckets?.some(b=>b.binding==='BUCKET' && typeof b.bucket_name==='string' && b.bucket_name.length>0)) throw Error('Missing BUCKET binding.');
  if(config.assets?.binding!=='ASSETS' || config.images?.binding!=='IMAGES') throw Error('Missing ASSETS/IMAGES bindings.');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(existsSync('.openai/hosting.json')) throw Error('Refusing to deploy a Sites-linked project.');
  const path='dist/server/wrangler.json';
  validateIndependentConfig(JSON.parse(readFileSync(path,'utf8')));
  const result=spawnSync('node_modules/.bin/wrangler',['deploy','--config',path],{stdio:'inherit'});
  process.exit(result.status??1);
}
