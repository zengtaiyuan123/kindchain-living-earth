# KindChain 邮箱认证补丁（独立部署适配）

当前验证基线：v172（a088e3570a723605cb3fd480024d71bf2c78d92d）；仍兼容受影响文件相同的 v168/v169。补丁附带共享修复并校验受影响文件的原始内容；不同修改需手工合并。
用途：在当前 KindChain v172 的导出源码副本上应用，继续使用原有业务代码、D1 数据模型与 R2 文件存储。不是重建网站，也不是线上 Sites 的新版本。

## 已实现

- `/auth/login`：适配手机的邮箱注册/登录页面，Gmail、Hotmail 和其他邮箱走同一个流程。
- `/auth/send`：Supabase Auth 邮箱 OTP，首次用户允许创建；`/auth/verify` 验证码登录。
- `/auth/logout`：GET 确认页，POST 清除此设备凭证；尝试撤销此设备的上游会话。
- 服务端访问 `/auth/v1/user` 验证身份；先删除客户端传入的全部 `oai-authenticated-*`，再写入经验证的兼容身份头。
- 用户主键为认证项目域名+用户 UUID，继续使用原 owner/scope 权限隔离；不会凭邮箱相同合并旧 ChatGPT 用户。
- Origin 校验、4KB 表单限制、安全跳转、HttpOnly/Secure/SameSite cookie；故障时不降级成游客写入；已登录页面禁止共享缓存。
- 原页面登录链接切换到邮箱入口，移除测试账户拦截弹窗。邮箱认证没有部署到 Sites；共享的账户范围检查与顶层登录导航修复已纳入主站 v169。

## 尚未完成/不得宣称上线

没有接通真实 Supabase 项目、SMTP 或独立域名，没有进行真实邮件送达、真实双账户、真机验收。Google/Microsoft 一键登录未加入。支付、提现、大屏履约仍未接通。

**当前会话是 access-token-only，最长 1 小时，不实现自动续期。** 到期需重新验证邮箱。退出清除本地凭证；已签发且被复制的上游 JWT 可能仍在其有效期内可用。不要宣传即时全设备撤销。更长登录保留和严格撤销须在后续加入经过审计的会话/刷新方案。

## 应用补丁

从 v172 源码仓库导出一份独立目录，保留原仓库和线上站点。推荐在源码仓库执行 `git archive a088e3570a723605cb3fd480024d71bf2c78d92d | tar -x -C /absolute/path/to/independent-source`（目标须为空目录）。补丁拒绝在含 `.git` 或线上工作区的目录运行。

```bash
python3 KindChain_Email_Auth_Patch/apply.py /absolute/path/to/independent-source
cd /absolute/path/to/independent-source
npm ci
npm run test:unit
npm run build
```

补丁校验 v168 Worker 文件的 SHA256；基线不同则停止，需人工合并。补丁移除独立副本的 Sites 项目绑定、替换构建配置和构建命令，保留原业务源码。`tests/*.test.mjs` 中仍有 Sites 专用产物断言，不算独立环境的有效验收；本次不宣称它们全部通过。

## Zhipeng 接入顺序

1. 建立 Supabase 项目，开启 Email OTP。将邮件模板调整为显示 `{{ .Token }}` 的验证码，配置 OTP 长度和过期时间。注册与登录使用同一模板/流程。
2. 配置生产 SMTP、发件域名及 SPF/DKIM/DMARC；Supabase 默认邮件服务不等于向任意真实用户稳定发信。开启上游限流，并在 Cloudflare 对 `/auth/send` 和 `/auth/verify` 配置按可信客户端 IP 的限流。发送冷却由上游强制，页面提示本身不构成限流。若启用验证码挑战，需要补上挑战 UI 和 token 透传后再开放。
3. 建立独立 Cloudflare Worker、D1、R2 及 Images binding；D1/R2 的原生产数据不在代码包里。使用原交接包的 `database-bootstrap-v168.sql` 初始化空库，不要未经审核直接迁移旧 owner。
4. 构建时设置 `KINDCHAIN_D1_ID`、`KINDCHAIN_D1_NAME`、`KINDCHAIN_R2_BUCKET`。配置中的默认数据库 UUID 仅供本地构建。`npm run deploy:independent` 会拒绝占位数据库和带 Sites 身份的目录。
5. Worker 运行时设置 `SUPABASE_URL`（如 https://project.supabase.co）、`SUPABASE_PUBLISHABLE_KEY`（publishable/anon key，绝不能用 service_role）、`AUTH_ORIGIN`（最终 HTTPS 域名，仅 origin，不带末尾斜杠）。通过部署环境配置，不写进源码。原管理员、Web Push 等配置沿用交接说明，通过独立部署平台重新配置。
6. 在部署账户已授权的环境运行 `npm run build` 和 `npm run deploy:independent`。此补丁未替你开通云资源或发布。
7. 使用两个不同真实邮箱验收：首次注册→验证码错误/过期→登录→保存作品→互相发信回复→账户切换→退出→到期重登。验证不能读写另一账户私有数据。再用真实手机检查键盘、自动填码、慢网重试及草稿保护。确认通过后才向公众开放。

`AUTH_ORIGIN` 与访问 origin 必须一致，且必须 HTTPS；未配置时服务端返回 503，不伪装为可用登录。业务数据库仍在 D1；Supabase 负责认证，并非每个用户新建一套数据库。

## 验证记录

- 本次认证测试 25/25、业务单元测试 173/173、部署配置测试 2/2，合计 200/200 通过。两用户隔离使用模拟的、服务器已验证用户响应，并非真实双账户验收。
- TypeScript 严格检查通过。
- 独立 Vinext 生产构建通过（见随包 verification.txt）。
- 本环境未执行浏览器/真机测试，未连接真实 SMTP、Supabase 或生产数据库。

参考官方协议：
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-smtp
- https://github.com/supabase/auth

## 复查更新

完整检查范围、修复和未验证项见 REVIEW.md。此前版本曾遗漏 iframe 登录跳转、API 错误格式及部署资源校验，本包已经修正；请使用这个更新版本。

## 2026-10-21 更新

在 v172 导出源码实际应用本补丁并验证。增加公开认证密钥类型检查，拒绝 secret/service_role 密钥误配，避免以高权限凭证调用注册服务。邮件模板见 `email-template.html`，部署步骤见 `GO-LIVE.md`。线上仍为 v172 的 ChatGPT 托管身份，本文件是独立部署补丁，不代表邮箱登录已上线。
