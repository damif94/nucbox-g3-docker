"""Configuration, read from the environment (see project .env)."""
import os

# An unfilled template value must not shadow a working fallback.
PLACEHOLDERS = {"changeme", "change-me", "todo", "xxx", "yourtoken"}


def _env(name: str, *fallbacks: str, default: str = "") -> str:
    for key in (name, *fallbacks):
        val = os.environ.get(key, "").strip()
        if val and val.lower() not in PLACEHOLDERS:
            return val
    return default

# --- Telegram -------------------------------------------------------------
# Falls back to the shared homelab bot (also used by watchtower for
# notifications). Watchtower only ever *sends*, so sharing the token with this
# long-polling bot is safe.
BOT_TOKEN = _env("PAYWALL_BOT_TOKEN", "TELEGRAM_BOT_TOKEN")
ALLOWED_CHAT_IDS = {
    int(c) for c in _env("PAYWALL_ALLOWED_CHAT_IDS", "TELEGRAM_CHAT_ID").replace(" ", "").split(",") if c
}

# --- Paths ----------------------------------------------------------------
EXT_DIR = _env("EXT_DIR", default="/data/extension")
PROFILE_DIR = _env("PROFILE_DIR", default="/data/profile")
DEBUG_DIR = _env("DEBUG_DIR", default="/data/debug")
READABILITY_JS = "/app/vendor/Readability.js"

# --- Extension ------------------------------------------------------------
BPC_ZIP_URL = _env(
    "BPC_ZIP_URL",
    default="https://gitflic.ru/project/magnolia1234/bpc_uploads/blob/raw?file=bypass-paywalls-chrome-clean-master.zip",
)
BPC_EXT_ID = "lkbebcjgcmobigpeffafkodonchffocl"  # deterministic: derived from manifest "key"
BPC_MAX_AGE_DAYS = int(_env("BPC_MAX_AGE_DAYS", default="7"))

# --- Rendering ------------------------------------------------------------
# Chromium 140 UA with "Headless" removed: the single most important
# anti-bot-detection measure (Economist/Cloudflare block the headless UA).
USER_AGENT = _env(
    "USER_AGENT",
    default="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
)
LOCALE = _env("LOCALE", default="es-UY")
TIMEZONE = _env("TZ", default="America/Montevideo")
NAV_TIMEOUT_MS = int(_env("NAV_TIMEOUT_MS", default="60000"))
JOB_TIMEOUT_S = int(_env("JOB_TIMEOUT_S", default="180"))
SETTLE_MS = int(_env("SETTLE_MS", default="3500"))
MIN_ARTICLE_CHARS = int(_env("MIN_ARTICLE_CHARS", default="600"))
# An anti-bot interstitial ("Access Issue Help", Cloudflare's "Just a moment…")
# is a real page with real prose, so a bare length check waves it through — the
# Telegraph's Akamai/TollBit block weighs 888 chars, comfortably over
# MIN_ARTICLE_CHARS. Extractions shorter than this are therefore also screened
# for block markers and for the HTTP status the navigation returned; anything
# longer is assumed to be a genuine article.
BLOCK_MAX_CHARS = int(_env("BLOCK_MAX_CHARS", default="2500"))
RESTART_AFTER_JOBS = int(_env("RESTART_AFTER_JOBS", default="25"))
TRY_ARCHIVE_FALLBACK = _env("TRY_ARCHIVE_FALLBACK", default="1") == "1"
DEBUG_RETENTION_DAYS = int(_env("DEBUG_RETENTION_DAYS", default="7"))

# --- PDF page -------------------------------------------------------------
# Chromium's printToPDF measures paper in inches and lays the page out at 96
# CSS px per inch, so a 375/96 x 812/96 in page *is* the iPhone 13 mini
# viewport (375x812 pt): one PDF page equals exactly one screenful, with
# nothing to pinch-zoom. Paper sizes are the usual ones.
PAGE_SIZES_IN: dict[str, tuple[float, float]] = {
    "iphone": (375 / 96, 812 / 96),
    "a4": (8.27, 11.69),
    "a5": (5.83, 8.27),
    "a6": (4.13, 5.83),
    "letter": (8.5, 11.0),
    "legal": (8.5, 14.0),
}
# Spellings that should resolve to a size: the env default shipped as
# "iphone13mini", and Spanish names are what gets typed at the bot.
PAGE_ALIASES = {
    "iphone13mini": "iphone", "iphone13": "iphone", "phone": "iphone",
    "movil": "iphone", "móvil": "iphone", "celular": "iphone", "tel": "iphone",
    "carta": "letter", "oficio": "legal", "din-a4": "a4",
}

MM_PER_IN = 25.4
# Typography is interpolated between two hand-tuned ends — the phone page
# (99mm wide, 11pt type, ragged right) and A4 (210mm, 12pt, justified) — so a
# new size lands on metrics consistent with both instead of needing its own
# table. Anything outside that span is clamped rather than extrapolated: type
# does not keep shrinking sensibly below a phone screen.
_NARROW_MM, _WIDE_MM = 375 / 96 * MM_PER_IN, 210.0


def _lerp(width_mm: float, narrow: float, wide: float) -> float:
    t = (min(max(width_mm, _NARROW_MM), _WIDE_MM) - _NARROW_MM) / (_WIDE_MM - _NARROW_MM)
    return narrow + (wide - narrow) * t


def page_profile(name: str) -> dict:
    """Geometry + type scale for one page size. Unknown names raise KeyError."""
    key = PAGE_ALIASES.get(name.strip().lower(), name.strip().lower())
    width_in, height_in = PAGE_SIZES_IN[key]
    w = width_in * MM_PER_IN
    side = _lerp(w, 5.0, 16.0)
    return {
        "name": key,
        "width_in": width_in,
        "height_in": height_in,
        "label": f"{w:.0f}×{height_in * MM_PER_IN:.0f} mm",
        "margin": f"{side * 1.15:.1f}mm {side:.1f}mm {side:.1f}mm",
        "body_font": f"{_lerp(w, 11.0, 12.0):.1f}pt/{_lerp(w, 1.55, 1.62):.2f}",
        "title_font": f"{_lerp(w, 17.0, 21.0):.1f}pt",
        "h2_font": f"{_lerp(w, 12.5, 13.0):.1f}pt",
        "h3_font": f"{_lerp(w, 11.0, 11.5):.1f}pt",
        # Justification tears holes in a ~45-character line, so the narrow
        # pages stay ragged right.
        "text_align": "justify" if w >= 140 else "left",
        # Capped as a fraction of the page height so one tall photo can't
        # leave a mostly-blank page, whatever the paper.
        "image_max_height": f"{height_in * MM_PER_IN * _lerp(w, 0.46, 0.39):.0f}mm",
    }


PAGE_NAMES = list(PAGE_SIZES_IN)
# Default for a request that names no size.
PDF_PAGE = PAGE_ALIASES.get(_env("PDF_PAGE", default="iphone").lower(),
                            _env("PDF_PAGE", default="iphone").lower())
if PDF_PAGE not in PAGE_SIZES_IN:
    PDF_PAGE = "iphone"
PAGE = page_profile(PDF_PAGE)

# --- Output ---------------------------------------------------------------
# Default output for a bare link. PDF pages are cut to the phone screen (see
# PDF_PAGES), which is how these get read; EPUB stays reachable per-request
# with /epub.
DEFAULT_FORMAT = _env("DEFAULT_FORMAT", default="pdf")

# --- EPUB -----------------------------------------------------------------
# Photos are re-encoded down to this width: e-readers gain nothing from a
# 3000px original, and it keeps the book small enough to send over Telegram.
EPUB_IMAGE_MAX_WIDTH = int(_env("EPUB_IMAGE_MAX_WIDTH", default="1200"))
EPUB_IMAGE_QUALITY = float(_env("EPUB_IMAGE_QUALITY", default="0.82"))
EPUB_MAX_IMAGE_BYTES = int(_env("EPUB_MAX_IMAGE_BYTES", default=str(12 * 1024 * 1024)))
# A news article carries a handful of photos; anything past this is gallery
# cruft that only bloats the book (a Wikipedia page can reach 150 images).
EPUB_MAX_IMAGES = int(_env("EPUB_MAX_IMAGES", default="40"))
# Image CDNs rate-limit a burst of requests coming from one page, so fetches
# are paced rather than fired all at once.
EPUB_FETCH_CONCURRENCY = int(_env("EPUB_FETCH_CONCURRENCY", default="4"))
EPUB_COVER = _env("EPUB_COVER", default="1") == "1"
