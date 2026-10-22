/** Independent deployment only. Never install behind Sites hosted authentication. */
export interface EmailAuthEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; AUTH_ORIGIN?: string }
type Next = (request: Request) => Promise<Response>;
type Transport = typeof fetch;
const COOKIE = '__Host-kindchain_session';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function safeReturn(s: string | null): string {
  if (!s || !s.startsWith('/') || s.startsWith('//') || /[\\\r\n]/.test(s)) return '/';
  const u = new URL(s, 'https://kindchain.invalid');
  return u.origin !== 'https://kindchain.invalid' || u.pathname.startsWith('/auth/') ? '/' : u.pathname + u.search + u.hash;
}
/** Configuration validation only; the provider verifies actual credentials. */
export function isPublicAuthKey(key: string | undefined): boolean {
  if (!key || key.length > 4096) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role === 'anon';
  } catch { return false; }
}
const cookie = (token: string, age: number) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function session(request: Request): string {
  const values = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (values.length !== 1) return '';
  const token = values[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9._-]{20,3500}$/.test(token) ? token : '';
}
function response(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {status, headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", ...extra}});
}
function page(message: string, returnTo: string, email = '', status = 200): Response {
  const hidden = `<input type="hidden" name="return_to" value="${escape(returnTo)}">`;
  return response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · KindChain</title><style>body{margin:0;background:#071b19;color:#ecf6ef;font:16px/1.6 system-ui}main{max-width:420px;margin:8vh auto;padding:24px}h1{font-size:28px}label{display:block;margin:16px 0}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border-radius:12px;border:1px solid #6e9384}button{background:#c3ef9b;color:#11291c;font-weight:700;cursor:pointer}a{color:#c3ef9b}p{color:#c0d3ca}.message{padding:12px;border:1px solid #6e9384;border-radius:12px}</style><main><a href="/">KindChain</a><h1>用邮箱注册或登录</h1><p>Gmail、Hotmail 等邮箱都可以。首次验证成功后即可使用账户，无需设置密码。</p>${message ? `<p class="message" role="status">${escape(message)}</p>` : ''}<form method="post" action="/auth/send">${hidden}<label>邮箱<input name="email" type="email" autocomplete="email" maxlength="254" value="${escape(email)}" required></label><button>发送／重发验证码</button></form><form method="post" action="/auth/verify">${hidden}<label>收信邮箱<input name="email" type="email" autocomplete="email" maxlength="254" value="${escape(email)}" required></label><label>邮件中的验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label><button>验证并进入</button></form><p>重发请至少间隔 60 秒。当前版本会在登录凭证到期后要求重新验证邮箱。</p><a href="${escape(returnTo)}">返回网站</a></main></html>`, status);
}
async function form(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new Error('invalid_form');
  const reader = request.body?.getReader(); let text = ''; let size = 0; const decoder = new TextDecoder();
  if (reader) { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if(size > 4096) { await reader.cancel(); throw new Error('oversize'); } text += decoder.decode(part.value, {stream:true}); } }
  return new URLSearchParams(text + decoder.decode());
}
export async function emailAuth(request: Request, env: EmailAuthEnv, next: Next, transport: Transport = fetch): Promise<Response> {
  const url = new URL(request.url);
  const authRoute = url.pathname.startsWith('/auth/');
  const failure = (message: string, status: number, extra: Record<string,string> = {}) => {
    if (url.pathname.startsWith('/api/')) return Response.json({error:status === 401 ? 'authentication_required' : 'unavailable',message},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
    return response(message,status,extra);
  };
  const cleanHeaders = new Headers(request.headers);
  for (const name of [...cleanHeaders.keys()]) if (name.startsWith('oai-authenticated-')) cleanHeaders.delete(name);
  // Fixed public terrain data has no account-specific content. Avoid one remote
  // identity verification per tile while still stripping forged identity headers.
  if ((request.method === 'GET' || request.method === 'HEAD') && /^\/api\/terrain\/\d{1,5}\/\d{1,5}\/\d{1,5}$/.test(url.pathname)) {
    return next(new Request(request,{headers:cleanHeaders}));
  }
  let provider: URL;
  try {
    provider = new URL(env.SUPABASE_URL || '');
    if (provider.protocol !== 'https:' || provider.username || provider.password || provider.pathname !== '/' || provider.search || provider.hash || !isPublicAuthKey(env.SUPABASE_PUBLISHABLE_KEY) || env.AUTH_ORIGIN !== url.origin || url.protocol !== 'https:') throw new Error();
  } catch { return failure('邮箱认证尚未配置完成，请联系网站管理员。', 503); }
  const call = (path: string, method: string, body?: unknown, token?: string) => transport(new URL('/auth/v1/' + path, provider), {method, headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY!, ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(body ? {'Content-Type':'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(8000), redirect:'error'});
  const token = session(request);
  const hasCookie = (request.headers.get('cookie') || '').split(';').some(s => s.trim().startsWith(COOKIE + '='));
  if (authRoute) {
    const returnTo = safeReturn(url.searchParams.get('return_to'));
    if (request.method === 'GET' && url.pathname === '/auth/login') return page('', returnTo);
    if (request.method === 'GET' && url.pathname === '/auth/logout') return response(`<html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><form method="post" action="/auth/logout"><input type="hidden" name="return_to" value="${escape(returnTo)}"><button style="font-size:20px;padding:16px">确认退出此设备</button></form></html>`);
    if (request.method !== 'POST') return response('不支持的请求。', 405, {Allow:'POST'});
    if (request.headers.get('origin') !== env.AUTH_ORIGIN) return response('请求来源无效，请刷新重试。', 403);
    let values: URLSearchParams;
    try { values = await form(request); } catch { return response('表单格式无效。', 400); }
    const target = safeReturn(values.get('return_to'));
    if (url.pathname === '/auth/logout') {
      // Delete the local credential even if the provider is temporarily unavailable.
      if (token) { try { await call('logout?scope=local','POST',undefined,token); } catch { /* local logout still succeeds */ } }
      return response('',303, {Location:target,'Set-Cookie':cookie('',0)});
    }
    const email = (values.get('email') || '').trim();
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return page('请输入有效邮箱。',target,'',400);
    try {
      if (url.pathname === '/auth/send') {
        const result = await call('otp','POST',{email,create_user:true});
        if (!result.ok) return page(result.status === 429 ? '发送过于频繁，请稍后重试。' : '暂时无法发送验证码，请稍后重试。',target,email,result.status === 429 ? 429 : 503);
        return page('验证码请求已提交，请查看邮箱及垃圾邮件。',target,email);
      }
      if (url.pathname === '/auth/verify') {
        const code = values.get('code') || '';
        if (!/^\d{6,10}$/.test(code)) return page('请输入邮件中的数字验证码。',target,email,400);
        const result = await call('verify','POST',{email,token:code,type:'email'});
        if (!result.ok) return page(result.status >= 500 ? '认证服务暂时不可用，请稍后重试。' : '验证码无效、过期或尝试过多，请重试或重新发送。',target,email,result.status >= 500 ? 503 : 400);
        const data = await result.json() as {access_token?:string; expires_in?:number};
        if (!data.access_token || !/^[A-Za-z0-9._-]{20,3500}$/.test(data.access_token) || !Number.isFinite(data.expires_in) || data.expires_in! <= 0) throw new Error('bad_session');
        // Access-only session: never persist refresh tokens in browser storage or cookies.
        return response('',303,{Location:target,'Set-Cookie':cookie(data.access_token, Math.min(3600,Math.floor(data.expires_in!)))});
      }
      return response('页面不存在。',404);
    } catch { return page('认证服务暂时不可用，请稍后重试。',target,email,503); }
  }
  if (hasCookie && !token) return failure('登录凭证无效，请重新登录。',401,{'Set-Cookie':cookie('',0)});
  if (token) {
    try {
      const result = await call('user','GET',undefined,token);
      if (result.status === 401 || result.status === 403) {
        const extra = {'Set-Cookie':cookie('',0)};
        return !url.pathname.startsWith('/api/') && request.method === 'GET' && request.headers.get('accept')?.includes('text/html') ? response('',303,{...extra,Location:'/auth/login?return_to='+encodeURIComponent(safeReturn(url.pathname+url.search))}) : failure('登录已过期，请重新登录。',401,extra);
      }
      if (!result.ok) return failure('认证服务暂时不可用，请稍后重试。',503);
      const user = await result.json() as {id?:string; email?:string; email_confirmed_at?:string};
      if (!user.id || !/^[a-f0-9-]{36}$/i.test(user.id) || !user.email || !user.email_confirmed_at) return failure('邮箱尚未验证。',401);
      cleanHeaders.set('oai-authenticated-user-id',`supabase:${provider.host}:${user.id}`);
      cleanHeaders.set('oai-authenticated-user-email',user.email);
    } catch { return failure('认证服务暂时不可用，请稍后重试。',503); }
  }
  const result = await next(new Request(request,{headers:cleanHeaders}));
  // Never cache an authenticated response in a shared cache.
  if (token) { const headers = new Headers(result.headers); headers.set('Cache-Control','private, no-store'); return new Response(result.body,{status:result.status,statusText:result.statusText,headers}); }
  return result;
}
