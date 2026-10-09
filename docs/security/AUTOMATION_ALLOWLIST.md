# GloveCubs automation allowlist policy

**DEFAULT: AUTOMATION DENIED**

**ALLOWED AUTOMATION: NONE**

No bot, crawler, scraper, AI agent, monitoring probe, Playwright script, Cursor automation, ChatGPT operator, Googlebot, or custom HTTP client is permitted to create side effects on GloveCubs unless it is explicitly allowlisted below.

## Current allowlist entries

| Entry | Mechanism | Purpose | Added |
|---|---|---|---|
| *(none)* | — | — | — |

Do **not** silently allow:

- ChatGPT / AI assistants
- Google / Bing / other search crawlers
- AI training crawlers
- Uptime monitors
- Cursor / Playwright / custom scripts
- “Verified bots” from BotID’s directory

## Security contract

| Surface | Control |
|---|---|
| **Public human side-effect routes** | BotID required (`requireHumanBotId` — bots and verified bots → 403) |
| **Public AI routes** | BotID required + rate limited (before OpenAI / DB / telemetry) |
| **Legacy Express duplicate public writes** | **410 Gone** (drained) |
| **Webhooks** | Signature authenticated (e.g. Stripe `constructEvent`) — **not** browser BotID |
| **Internal machine routes** | Secret authenticated (e.g. `INTERNAL_CRON_SECRET`) |
| **Automation allowlist** | **NONE** |

There are no implicit exceptions.

## Enforcement layers

1. **Vercel WAF Bot Protection** (managed ruleset) — `challenge` for non-browser traffic
2. **Vercel WAF AI Bots** (managed ruleset) — `deny` for AI crawlers
3. **BotID** on public side-effect and public AI routes — server `checkBotId()` before any OpenAI/DB/email side effect; verified bots are also rejected
4. **WAF + app rate limits** — secondary defense on sensitive POSTs / AI
5. `robots.txt` — advisory only; **not** an enforcement control

## Protected write routes (BotID) — Next storefront

**Public human side-effect routes**

- `POST /api/leads/request-pricing`
- `POST /api/quote-request`
- `POST /api/contact`
- `POST /api/invoice/intake`
- `POST /api/auth/self-signup/finalize`

**Public AI routes** (BotID + rate limit)

- `POST /api/gloves/recommend` — public-write limit 5 / 10 min / IP
- `POST /api/ai/glove-finder` — AI RPM limiter
- `POST /api/ai/invoice/recommend` — AI RPM limiter

Password reset and login password checks go through Supabase Auth (platform rate limits). They are not BotID-wrapped API routes in this app.

## Legacy Express duplicates (410)

When Express `server.js` is running, these anonymous public writes return **410** and must not create side effects:

- `POST /api/rfqs` → Next `/api/quote-request`
- `POST /api/public/lead-capture` → Next `/api/leads/request-pricing`
- `POST /api/contact` → Next `/api/contact`
- `POST /api/auth/register` → Next `/signup`
- `POST /api/ai/glove-finder` → Next `/api/ai/glove-finder`
- `POST /api/ai/invoice/extract` → Next `/api/invoice/intake`
- `POST /api/ai/invoice/recommend` → Next `/api/ai/invoice/recommend`

**Not drained:** Stripe webhook (signature), internal cron (secret), authenticated/admin Express APIs.

## How to add one allowed automation later (explicit only)

Only add an entry when the owner explicitly requests it. Prefer the least privilege option:

### Option A — Vercel WAF bypass custom rule

1. Firewall → Rules → add a **bypass** custom rule that matches a narrow, hard-to-spoof signal (static IP / CIDR preferred; avoid broad User-Agent matches).
2. Place the bypass **above** blocking rules.
3. Publish.
4. Document the entry in the table above (who, why, expiry).

### Option B — BotID / WAF BotID bypass

1. Add a WAF bypass targeting the trusted source for BotID-evaluated paths.
2. Keep application `requireHumanBotId()` fail-closed for everyone else.
3. If a future allowlist is needed inside `requireHumanBotId()`, add an **explicit** named check (e.g. shared secret header + IP) — never “allow all verified bots”.

### Option C — Authenticated service credential

1. Prefer a dedicated authenticated API with service credentials over public form endpoints.
2. Do not reuse anonymous public POST routes for automation.

## Explicit non-goals

- Do not rely on client-only honeypots or hidden fields as the primary control.
- Do not treat page GETs (e.g. `/request-pricing`) as completed RFQs.
- Do not undo CDN/static caching fixes while tuning bot controls.
- Do not apply browser BotID to signature-authenticated webhooks or secret-authenticated machine routes.
