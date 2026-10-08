# Portfolio Ledger

Dashboard for the Safra National Bank CSV exports (Accounts, Activity, Positions, Assets_Securities).
ES/EN, light/dark, plain-language tooltips on every financial term, instrument data enriched via OpenFIGI.

## Privacy model
- CSVs are parsed **in the browser** (PapaParse). They are never uploaded or stored.
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

One-time setup:
1. Optional: set `OPENFIGI_API_KEY` in the root `.env` (empty = anonymous OpenFIGI tier)
2. Cloudflare DNS: CNAME `portfolio` → `damianferencz.org` (DNS only)
3. NPM (port 81):
   - Access Lists → new list `portfolio` with a username/password
   - Proxy Hosts → `portfolio.damianferencz.org` → `http://portfolio-dashboard:80`, Access List `portfolio`,
     SSL: request a Let's Encrypt cert, Force SSL + HTTP/2

Local image test: `docker build -t portfolio-dashboard:local . && docker run --rm -p 8099:80 portfolio-dashboard:local`

## Layout
- `src/lib/csv.ts` – parses exports, detects the file type by its columns (not its name)
- `src/lib/normalize.ts` – builds the Dataset (accounts, daily NAV, holdings, classified activity).
  Semantics follow `docs/formats/safra-csv-exports.md` in the financial-companion repo
  (NAV = Σ `MarketValueUSD - Settled`; transaction codes 113/114/162/163/182/889; contra legs hidden by default)
- `src/lib/figi.ts` – OpenFIGI client (batched, retries on 429)
- `src/lib/analytics.ts` – KPIs, change-in-value, allocation, exposures, ladder, events, alerts
- `src/i18n/` – UI strings and the glossary used by tooltips
- `deploy/` – Dockerfile companion nginx template + compose stub for nucbox-g3-docker
