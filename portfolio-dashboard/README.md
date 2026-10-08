# Portfolio Ledger

Dashboard for the Safra National Bank CSV exports (Accounts, Activity, Positions, Assets_Securities).
ES/EN, light/dark, plain-language tooltips on every financial term, instrument data enriched via OpenFIGI.

## Privacy model
- CSVs are parsed **in the browser** (PapaParse). The last uploaded set is also stored on the server
  (`/srv/data/portfolio-dashboard`, via nginx WebDAV `PUT` on `/api/data/*`, behind the login) and shared
  by every login, so the dashboard opens without uploading. Uploading new files is optional and can
  replace any subset; kinds not re-uploaded fall back to the stored copies (`src/lib/store.ts`).
- Only security identifiers (ISIN / option ticker) are sent to `/api/figi`, an nginx proxy to OpenFIGI
  (POST only, 16 KB body cap, rate-limited to OpenFIGI's anonymous quota).
- FIGI lookups are cached in `localStorage` (identifiers only).

## Develop
```bash
npm install
npm run dev        # Vite dev server; /api/figi is proxied to OpenFIGI by vite.config.ts
                   # (OPENFIGI_API_KEY=... npm run dev to use a key)
npm run build      # typecheck + production build
```

## Deploy (this box)
One `nginx:alpine` container serves the static build and proxies `/api/figi` to OpenFIGI
(`deploy/nginx.conf.template`). No Node at runtime, no host port: it sits behind Nginx Proxy Manager.

```bash
cd portfolio-dashboard && docker compose --env-file ../.env up -d --build
```

Served at `https://damianferencz.org/portfolio/` (Vite `base: '/portfolio/'`). NPM strips the prefix,
so the container itself serves from `/`.

One-time setup:
1. Root `.env`: `PORTFOLIO_PASSWORD` (required; `PORTFOLIO_USER` defaults to `damian`), plus optional
   `PORTFOLIO_EXTRA_USERS=user:password,user2:password2` for more logins.
   The login is the app's own sign-in screen backed by cookie sessions in the container's nginx
   (`deploy/njs/auth.js`), not an NPM Access List: an Access List would lock the whole
   `damianferencz.org` host, and the browser's Basic Auth dialog can't be styled. The app shell is
   public (no account data in it); `/api/data/*` and `/api/figi` need a session. Sessions are a
   signed HttpOnly cookie valid 30 days; the HMAC key is `/data/.session-secret` (created on first
   start; delete it to sign everyone out). Logins are rate-limited per client IP.
   `OPENFIGI_API_KEY` stays empty (anonymous OpenFIGI tier).
2. NPM proxy host `damianferencz.org` → Advanced → add:
   ```nginx
   location = /portfolio { return 301 /portfolio/; }
   location /portfolio/ {
     proxy_pass http://portfolio-dashboard:80/;   # trailing slash strips the prefix
     proxy_set_header Host $host;
     proxy_set_header X-Forwarded-Proto $scheme;
     proxy_set_header X-Forwarded-For $remote_addr;
     proxy_set_header X-Real-IP $remote_addr;
   }
   ```

Local image test: `docker build -t portfolio-dashboard:local . && docker run --rm -p 8099:80 -e PORTFOLIO_PASSWORD=test portfolio-dashboard:local`
(then open `http://localhost:8099/` — assets are requested under `/portfolio/`, so only the NPM route renders fully)

## Layout
- `src/lib/csv.ts` – parses exports, detects the file type by its columns (not its name)
- `src/lib/normalize.ts` – builds the Dataset (accounts, daily NAV, holdings, classified activity).
  Semantics follow `docs/formats/safra-csv-exports.md` in the financial-companion repo
  (NAV = Σ `MarketValueUSD - Settled`; transaction codes 113/114/162/163/182/889; contra legs hidden by default)
- `src/lib/figi.ts` – OpenFIGI client (batched, retries on 429)
- `src/lib/analytics.ts` – KPIs, change-in-value, allocation, exposures, ladder, events, alerts
- `src/i18n/` – UI strings and the glossary used by tooltips
- `src/lib/session.ts`, `src/components/Login.tsx` – sign-in screen and session client
- `deploy/` – nginx config + template, njs session auth, entrypoint scripts
