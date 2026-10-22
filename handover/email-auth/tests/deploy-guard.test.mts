import test from 'node:test';import assert from 'node:assert/strict';
import {validateIndependentConfig} from '../scripts/deploy-independent.mjs';
const config=(id:unknown)=>({name:'kindchain-independent',d1_databases:[{binding:'DB',database_id:id}],r2_buckets:[{binding:'BUCKET',bucket_name:'kindchain-independent'}],assets:{binding:'ASSETS'},images:{binding:'IMAGES'}});
test('deployment rejects missing, malformed and placeholder database identifiers',()=>{for(const id of [undefined,null,'','bad','00000000-0000-4000-8000-000000000000','00000000-0000-0000-0000-000000000000'])assert.throws(()=>validateIndependentConfig(config(id)));validateIndependentConfig(config('11111111-1111-4111-8111-111111111111'))});
test('deployment requires the asset, image and storage bindings',()=>{const c=config('11111111-1111-4111-8111-111111111111');for(const key of ['assets','images','r2_buckets']){const invalid={...c,[key]:undefined};assert.throws(()=>validateIndependentConfig(invalid))}});
