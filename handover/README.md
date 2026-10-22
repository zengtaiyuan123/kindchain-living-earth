# KindChain continuation — 2026-10-22

This handover preserves the current Living Earth implementation and provides independent email authentication plus a local, redacted configuration audit. It does not activate payment, payouts, screen fulfillment, or deploy an independent site.

## Source of truth

- Current published Sites version: v172, source commit `a088e3570a723605cb3fd480024d71bf2c78d92d` in the Sites source repository.
- Public URL: https://kindchain-living-earth.zengtaiyuan.chatgpt.site/
- This GitHub repository's main branch was inspected at `adfddd2ca8b5b2f20faba8201bc22912eb3cb538` ("Initial KindChain Living Earth source"). It is an older snapshot, not v172. Do not deploy its root as the latest app or apply this adapter to that root.
- The email adapter was validated on a v172 source export. It requires that export; the complete current app and assets are not duplicated in this handover folder. Its source hashes reject incompatible baselines.
- Zhipeng's uploaded source archive contains Next.js 14, Prisma/PostgreSQL and NextAuth Google login. Supabase is used as a database; this alone does not enable email OTP.

## Inspect the existing Mac mini handover

Use Node.js 22.13 or newer. From the root of this checkout, run:

```sh
node handover/check-handover.mjs --env /Users/Shared/kindchain-handover/production.env
```

The script reads the specified file locally, prints only fixed variable names and configuration statuses, and makes no network requests. It neither executes dotenv content nor displays values, hosts, emails or unrecognized variable names. A `present_unverified` status is not a successful provider test. Its output can be shared for diagnosis without including the original env file.

```sh
node --test handover/check-handover.test.mjs
```

## Continue with existing services

1. Reuse existing PostgreSQL, Google OAuth and Stripe configuration where suitable; do not rotate it merely to inspect it. Preserve existing production until the new deployment has passed acceptance.
2. Decide whether to retain PostgreSQL or migrate data to D1. The v172 app uses D1. A PostgreSQL URL cannot substitute for a D1 binding. Use the v172 migration audit and an explicit owner mapping before importing real data; never auto-merge users by matching email text.
3. For the separately prepared email OTP option, apply `email-auth/apply.py` to a v172 export, configure the existing Supabase project's Auth service if usable, and establish production email delivery. Follow `email-auth/GO-LIVE.md`. Google login and email OTP are distinct options; don't silently replace existing account identities.
4. The migration document states that Stripe webhook signing configuration and Resend were absent from its exported production variables. Inspect the actual current file before concluding they are still absent. Configure the new webhook endpoint and test signed callbacks before accepting payment.
5. Creator payouts require Connect onboarding, verified ownership, settlement and refund/reversal testing. A stored Stripe payment key alone does not establish payout readiness.
6. Screen fulfillment requires a real operator, booking availability and playback evidence. No such integration was verified.

## Verified access and limits

On 2026-10-22 Vercel returned one accessible team, Nexzones, and zero projects in that scope. This does not prove the original project is absent elsewhere. The private `zhipeng515/kindchain` repository returned 404 to the current connection; the uploaded source remains available. The uploaded ZIP had 221 files and did not contain `production.env`; the migration document describes a separate 299-file archive and a Mac-local env file.

Validation: the independent v172 adapter previously passed 200 unit tests and a production build (2026-10-21). The new redacted audit passes 8 tests (2026-10-22). Real provider login, email delivery, two-account browser isolation, physical phone testing, real payment/payouts and screen delivery remain unverified. Do not describe this PR as a production activation.
