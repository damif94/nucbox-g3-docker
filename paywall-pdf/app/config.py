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
RESTART_AFTER_JOBS = int(_env("RESTART_AFTER_JOBS", default="25"))
TRY_ARCHIVE_FALLBACK = _env("TRY_ARCHIVE_FALLBACK", default="1") == "1"
DEBUG_RETENTION_DAYS = int(_env("DEBUG_RETENTION_DAYS", default="7"))
