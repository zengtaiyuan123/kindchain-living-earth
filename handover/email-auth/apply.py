#!/usr/bin/env python3
"""Apply only to an exported v168 source copy; never to the live checkout."""
import pathlib, sys, shutil, hashlib, json
root = pathlib.Path(sys.argv[1]).resolve()
patch = pathlib.Path(__file__).resolve().parent
if (root / '.git').exists() or str(root) == '/workspace/sites/kindchain-living-earth':
    raise SystemExit('Refusing live/repository checkout. Use an exported source copy.')
worker = root / 'worker/index.ts'
s = worker.read_text()
if 'emailAuth' in s: raise SystemExit('Already applied')
if hashlib.sha256(s.encode()).hexdigest() != '62ab86d49bf24f1563db98c0b5c9c00c09271b684467d91256b289a43b11bbca': raise SystemExit('Worker differs from v168; review integration manually.')

# Refuse to overwrite unrelated edits in the shared fixes.
expected = {'lib/request-security.ts': ['960c235763ca79c210ad7262d70bdefd35010460c517bb921735bf8e4425ff4d', '497607f4600d4c16672b945532ee7b1a150162cf31bf95098b9f6275b1468075'], 'app/festival/RitualPortal.tsx': ['e869482875cb469282ebc6123441bbb3c04a1f0ad66cdba34668db632a7e07db', '3e3b9836de4ed6d6c51516397b25fd68aebf16ea677e53cc35a1e931ab8394c8'], 'tests/request-security.test.mts': ['38717a904acc0246cea22263ac240c166e26c44bc1e59c32e1c767a9bc8fe490', '56bbfe19f22d9b73e923d8ab484a9a0889c9a45444a1b93c0f05c9f52e68dc14']}
for name, hashes in expected.items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest() not in hashes:
        raise SystemExit('Local edits require manual merge: '+name)

for name in expected:
    shutil.copyfile(patch/'overlays'/name,root/name)
shutil.copyfile(patch/'worker/email-auth.ts', root/'worker/email-auth.ts')
shutil.copyfile(patch/'tests/email-auth.test.mts', root/'tests/email-auth.test.mts')
shutil.copyfile(patch/'tests/deploy-guard.test.mts', root/'tests/deploy-guard.test.mts')
s = 'import {emailAuth, type EmailAuthEnv} from "./email-auth";\n' + s
s = s.replace('interface Env {', 'interface Env extends EmailAuthEnv {')
s = s.replace('export default worker;', 'export default { fetch(request: Request, env: Env, ctx: ExecutionContext) { return emailAuth(request, env, clean => worker.fetch(clean, env, ctx)); } };')
worker.write_text(s)
for p in (root/'app').rglob('*'):
    if p.suffix not in ('.ts','.tsx'): continue
    s = p.read_text().replace('/signin-with-chatgpt','/auth/login').replace('/signout-with-chatgpt','/auth/logout')
    s = s.replace('独立账户正在接入，当前仅开放测试账户。','支持邮箱验证码注册和登录。').replace('当前使用 ChatGPT 账户登录。','当前使用已验证邮箱登录。').replace('继续登录（当前使用 ChatGPT）','用邮箱注册／登录')
    s = s.replace('目前独立注册尚未开放。','可以使用邮箱验证码注册和登录。').replace('KindChain 独立邮箱注册尚未开放；目前只有测试账户入口，不能视为正式注册已经完成。','使用 Gmail、Hotmail 等邮箱接收验证码；首次验证成功后即可使用账户。')
    p.write_text(s)
(root/'app/AccountGate.tsx').write_text("'use client';\n// Independent email login uses a normal full-page navigation.\nexport default function AccountGate(){return null;}\n")
# Independent hosting has its own resource identities; never reuse the Sites project.
p=root/'vite.config.ts'; s=p.read_text()
s=s.replace('import hostingConfig from "./.openai/hosting.json";', 'const hostingConfig = {d1:"DB", r2:"BUCKET"};')
s=s.replace('import { sites } from "./build/sites-vite-plugin";','')
s=s.replace('      sites(),\n','')
s=s.replace('  main: "./worker/index.ts",','  name: "kindchain-independent",\n  compatibility_date: "2026-10-20",\n  main: "./worker/index.ts",')
s=s.replace('database_name: "site-creator-d1"','database_name: process.env.KINDCHAIN_D1_NAME || "kindchain-independent"').replace('database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID','database_id: process.env.KINDCHAIN_D1_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID').replace('bucket_name: "site-creator-r2"','bucket_name: process.env.KINDCHAIN_R2_BUCKET || "kindchain-independent"')
s=s.replace('  compatibility_flags:', '  assets: {binding: "ASSETS"},\n  images: {binding: "IMAGES"},\n  compatibility_flags:')
p.write_text(s)
p=root/'package.json'; package=json.loads(p.read_text())
package['scripts']['build']='npm run typecheck && vinext build'
package['scripts']['test']='npm run test:unit && npm run build'
package['scripts']['deploy:independent']='node scripts/deploy-independent.mjs'
p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(patch/'deploy-independent.mjs',root/'scripts/deploy-independent.mjs')
(root/'.openai/hosting.json').unlink(missing_ok=True)
print('Applied independent email-auth adaptation. No deployment performed.')
