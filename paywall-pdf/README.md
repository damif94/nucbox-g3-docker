# paywall-pdf

Send a link to Telegram, get the article back as a clean **EPUB** — the phone
substitute for the *Bypass Paywalls Clean* Chrome extension, which mobile Chrome
can't run.

```
phone ──link──▶ Telegram ──long poll──▶ paywall-pdf ──▶ headless Chromium + BPC
                    ◀────── EPUB ─────────────────────────────────┘
```

> The directory keeps its original name; PDF is still available per request
> (`/pdf`, and `/raw` which has no EPUB equivalent).

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
heuristic when Readability misjudges the page.

Before an extraction is allowed to compete it has to look like an article at
all. An anti-bot interstitial is prose too: The Telegraph's Akamai/TollBit
notice ("Access Issue Help", served with HTTP 402) parses as a clean
888-character article, sails past `MIN_ARTICLE_CHARS` and wins the race against
engines that got nothing. So a candidate is dropped when the navigation
returned 4xx/5xx, or — for extractions under `BLOCK_MAX_CHARS` (2500) — when it
matches a wall marker (TollBit, `ak_ref_id`, "checking your browser",
"verify you are human"…). The length guard keeps an article *about* bot walls
from being thrown out for quoting one. Dropping the wall is what lets the
archive fallback fire: the same Telegraph link then comes back whole, 7,848
chars via `archive`. When everything is dropped and archive.today has no copy,
the bot says which engine hit what instead of sending a PDF of the wall.

The winner is then packaged as an
EPUB 3 (see below), or — for `/pdf` and `/raw` — re-typeset into a print
stylesheet (A4, serif, images capped) and printed via CDP `Page.printToPDF`.

Two details matter more than they look:

- **`channel="chromium"`** — Playwright's default `headless_shell` binary cannot
  load extensions at all.
- **The user agent has `Headless` stripped**, plus
  `--disable-blink-features=AutomationControlled`. Without this, Cloudflare and
  Akamai serve a challenge page instead of the article; with it, The Economist
  went from 0 to 8,000 characters.

BPC registers its ~800 blocking rules dynamically from an MV3 service worker, so
startup waits for those rules to be live before accepting any job.

## Why EPUB

A PDF has fixed A4 pages, so a phone or e-reader either shows unreadably small
text or forces horizontal panning. EPUB reflows to the device, and the reader's
own font, size, margins and dark mode all keep working — so the stylesheet
deliberately sets **no** body colour, background or font size, and styles only
small meta text in tones that survive inversion.

Building a valid book takes more than renaming the output:

- **XHTML, not HTML.** EPUB is XML and a reader will reject a malformed file, so
  the document is serialised with `XMLSerializer` over the browser's own parsed
  DOM rather than assembled from strings.
- **Images are files inside the zip**, not URLs — a book has to read offline. The
  bytes are captured from the responses the render page already downloaded;
  re-fetching them afterwards doubles the traffic and earns HTTP 429 from image
  CDNs (that cost 105 of 115 images on a test page before it was fixed).
- **WebP and AVIF are transcoded to JPEG.** Most news CDNs serve them and many
  e-readers still can't decode them. Oversized photos are scaled to 1200px in
  the same pass; PNGs stay PNG so transparency survives, and GIF/SVG are left
  alone so animation and vectors are not destroyed.
- **Every book gets a cover** — a rendered title card, since e-reader libraries
  are browsed by cover and an article without one is hard to find again.
- Both an EPUB 3 `nav.xhtml` and an EPUB 2 `toc.ncx` ship, so older devices
  still get a table of contents.

## Usage

Message the bot:

- `<link>` — clean reading-mode EPUB (several links per message is fine)
- `/pdf <link>` — the same article, as a PDF
- `/raw <link>` — the page printed as-is, ads and all (PDF: reproducing the page
  visually is not something EPUB can express)
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
  cli.py "https://example.com/article" [--pdf] [--raw]
```

Writes to `/srv/data/paywall-pdf/debug/` and logs which engine won and why.

Pass `-e PROFILE_DIR=/tmp/testprofile` to test while the bot is running —
otherwise the CLI clears the live container's Chrome profile lock and both
processes open the same profile at once.

## Known limits

- Sites that block datacenter *and* residential automation still fail; they fall
  through to archive.today, which itself rate-limits (HTTP 429) and may only
  hold an older snapshot.
- **telegraph.co.uk now blocks us at the edge** (Akamai + TollBit, HTTP 402 for
  both the browser and the plain fetch — BPC's rule for it only blocks Piano's
  `tinypass.com`, which no longer is where the wall lives). It works only
  through archive.today, and its Googlebot retry burns 30s on a read timeout
  before the fallback starts.
- BPC is bound to `host_permissions` for ~970 domains. Anything outside that
  list only gets the generic engines.
- Renders are serialised (one at a time) — this box has 4 cores.
- Articles are capped at 40 embedded images (`EPUB_MAX_IMAGES`); past that it is
  gallery cruft that only bloats the book.
- The EPUB is a single chapter. Splitting long articles into sections would give
  nicer navigation, but no reader needs it for one article.
