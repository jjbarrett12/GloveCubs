# Storefront dev troubleshooting (UI stability)

Use this guide when the Next.js storefront renders as **raw HTML** (unstyled), shows **404s on `/_next/static/*`**, or sections look broken after a code change.

## Quick recovery (recommended)

From repo root (stops port **3005**, wipes cache, restarts Next):

```bash
npm run dev:reset
```

From `storefront/` only:

```bash
npm run dev:reset
```

Then hard-refresh the browser (**Ctrl+Shift+R** / **Cmd+Shift+R**).

**Why this happens:** `Cannot find module './1682.js'` and unstyled HTML almost always mean `.next` was deleted or rebuilt **while `next dev` was still running** (common on Windows when `clean:next` or `npm run build` runs against a live dev server). The new scripts stop dev ports before wiping cache; `prebuild` does the same before every production build.

Equivalent manual steps:

1. Stop **all** terminals running `npm run dev` or root `npm run dev` (Ctrl+C).
2. Run `npm run clean:next` from `storefront/` (now stops ports 3005/3010 automatically).
3. Restart `npm run dev` (port **3005** by default).
4. Hard-refresh.

## Clearing the `.next` cache

Next.js writes compiled chunks and CSS to `.next/`. A corrupted or partial cache often causes:

- Missing global CSS
- 404 on `/_next/static/chunks/*` or `/_next/static/css/*`
- `Cannot find module './XXXX.js'` in the terminal

**Scripts:**

| Script | Purpose |
|--------|---------|
| `npm run dev:reset` | Stop dev ports → clean cache → start `next dev` |
| `npm run clean:next` | Stop dev ports → remove `.next` and `node_modules/.cache` |
| `npm run clean:dev` | Clean cache, then start dev server |
| `npm run build:clean` | Clean cache, then production build |
| `npm run verify:ui` | `lint` + `lint:css` + `production build` (`prebuild` stops dev ports first) |

On Windows, `clean:next` uses `scripts/clean-next.mjs` (cross-platform); do not rely on `rm -rf` in PowerShell.

## Network tab: `/_next/static` failures

1. Open DevTools → **Network**.
2. Filter by `static`.
3. Look for red entries under `/_next/static/`.

If CSS or JS chunks return **404** or **500**:

- Stop dev, run `npm run clean:dev`.
- Ensure only **one** dev server is bound to port **3005** (`EADDRINUSE` means a stale process may still be serving broken chunks).
- Confirm you are opening the same origin as the dev server (`http://localhost:3005`).

## Hydration mismatches

Symptoms:

- Console: `Hydration failed`, `Text content does not match`, `Prop did not match`
- Flash of unstyled or wrong layout, then partial fix

Common causes:

- Different HTML on server vs client (dates, random IDs, `window` in render path)
- Browser extensions mutating DOM
- Invalid HTML nesting (e.g. `<p>` inside `<p>`)

In development, `DevUiStabilityWatchdog` logs hydration-related errors with the `[GloveCubs UI stability]` prefix.

Fix: align server and client output; move browser-only logic into `useEffect` or client-only components.

## Malformed CSS pitfalls

Invalid declarations can cause **entire stylesheets** to be dropped or partially ignored:

| Invalid | Valid |
|---------|--------|
| `shrink: 0` | `flex-shrink: 0` |
| Unclosed `{` `}` | Balanced blocks |
| Invalid `clip-path` syntax | Valid `polygon(...)` percentages |

**Prevention:**

- Run `npm run lint:css` (Stylelint on `src/**/*.{css,scss}`).
- Keep experimental layout (honeycomb clip-path, overlaps) in **CSS modules** under `src/components/**` rather than `globals.css`.

`globals.css` should only contain Tailwind layers, design tokens, and shared utilities — not one-off section experiments.

## Tailwind rebuild issues

Tailwind scans `tailwind.config.ts` `content` globs. If new files are outside those paths, classes are purged at build time.

After changing `tailwind.config.ts` or adding new app directories:

1. Restart dev (or `clean:dev`).
2. Run `npm run build` to verify production CSS.

## Port and environment

| Variable | Default | Notes |
|----------|---------|--------|
| Dev port | `3005` | Set in `package.json` `dev` script |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:3005` | E2E smoke tests |

Wrong port → you may hit an old server instance or a different app with no CSS.

## Turbopack / webpack cache instability

Next 14 dev uses webpack by default. Symptoms match a stale cache:

- Chunk load errors after git branch switches
- Styles fine until hot reload, then broken

**Mitigation:** `npm run clean:dev` after branch switches or large dependency upgrades.

## Dev watchdog and smoke tests

| Tool | When |
|------|------|
| `DevUiStabilityWatchdog` | Dev only — console warnings + badge if CSS bundle missing |
| `npm run test:smoke` | Playwright: homepage styled, no static 404s, no console errors |
| `npm run verify:ui` | Lint + CSS lint + production build (CI-friendly) |

Smoke test markers (non-visual):

- `[data-ui-root="homepage"]` on homepage wrapper
- `[data-ui-section="hero"]` on hero section

## CI verification

```bash
cd storefront
npm run verify:ui
npx playwright install chromium
npm run test:smoke:ci
```

`test:smoke:ci` runs `build` then Playwright against `next start`.
