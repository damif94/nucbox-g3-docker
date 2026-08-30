# paywall-pdf

Send a link to Telegram, get the article back as a clean PDF — the phone
substitute for the *Bypass Paywalls Clean* Chrome extension, which mobile Chrome
can't run.

```
phone ──link──▶ Telegram ──long poll──▶ paywall-pdf ──▶ headless Chromium + BPC
                    ◀────── PDF ──────────────────────────────────┘
```

## How it works

One long-lived headless Chromium runs with the BPC extension loaded. For each
link, four extractors race and **the one that recovers the most article text
wins** — different paywalls break in different ways, so no single method covers
everything:

| Engine | What it does | Beats |
|---|---|---|
| `bpc` | Chromium + extension, Readability on the live DOM | Real client-side paywalls (economist.com) |
| `bpc-html` | Same page, re-parsed as static HTML | Pages whose live DOM confuses Readability |
| `static` | Plain HTTP fetch, no JS at all | Paywalls whose JS *deletes* server-rendered text (elobservador.com.uy, wired.com) |
| `archive` | archive.today snapshot | Sites blocking us at the edge (wsj.com returns HTTP 401) |

Extraction uses Mozilla Readability, falling back to a densest-paragraph-container
heuristic when Readability misjudges the page. The winner is re-typeset into a
print stylesheet (A4, serif, images capped) and printed via CDP `Page.printToPDF`.

Two details matter more than they look:

- **`channel="chromium"`** — Playwright's default `headless_shell` binary cannot
  load extensions at all.
- **The user agent has `Headless` stripped**, plus
  `--disable-blink-features=AutomationControlled`. Without this, Cloudflare and
  Akamai serve a challenge page instead of the article; with it, The Economist
  went from 0 to 8,000 characters.

BPC registers its ~800 blocking rules dynamically from an MV3 service worker, so
startup waits for those rules to be live before accepting any job.

## Usage

Message the bot:

- `<link>` — clean reading-mode PDF (several links per message is fine)
- `/raw <link>` — the page printed as-is, ads and all
- `/status` — extension version, rule count, counters
- `/update` — pull the newest BPC build and restart the browser

Only chat IDs in `PAYWALL_ALLOWED_CHAT_IDS` (default: `TELEGRAM_CHAT_ID`) are
served; anything else is logged and dropped.

## Deploy

```bash
cd paywall-pdf
docker compose --env-file ../.env up -d --build
docker compose logs -f
```

No published ports and no UFW rule: the bot reaches Telegram by outbound long
polling, so nothing new is exposed on the LAN.

State lives in `/srv/data/paywall-pdf/`:

- `extension/` — unpacked BPC, refreshed in place (weekly, or on `/update`)
- `profile/` — Chrome profile; persists extension state and any site logins
- `debug/` — CLI output, swept after 7 days

## Debugging without Telegram

```bash
docker compose --env-file ../.env run --rm --entrypoint python3 paywall-pdf \
  cli.py "https://example.com/article" [--raw]
```

Writes to `/srv/data/paywall-pdf/debug/` and logs which engine won and why.

## Known limits

- Sites that block datacenter *and* residential automation still fail; they fall
  through to archive.today, which itself rate-limits (HTTP 429) and may only
  hold an older snapshot.
- BPC is bound to `host_permissions` for ~970 domains. Anything outside that
  list only gets the generic engines.
- Renders are serialised (one at a time) — this box has 4 cores.
