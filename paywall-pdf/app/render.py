"""Render a URL to a readable PDF, with Bypass Paywalls Clean loaded."""
import asyncio
import base64
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx
from playwright.async_api import Error as PWError, async_playwright

import extension
from config import (
    BPC_EXT_ID, DEBUG_DIR, EXT_DIR, JOB_TIMEOUT_S, LOCALE, MIN_ARTICLE_CHARS,
    NAV_TIMEOUT_MS, PROFILE_DIR, READABILITY_JS, RESTART_AFTER_JOBS, SETTLE_MS,
    TIMEZONE, TRY_ARCHIVE_FALLBACK, USER_AGENT,
)
from template import build as build_page

log = logging.getLogger("render")

GOOGLEBOT_UA = ("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; "
                "Googlebot/2.1; +http://www.google.com/bot.html) Chrome/140.0.0.0 Safari/537.36")

LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    # Hides the navigator.webdriver / automation surface that Cloudflare & Akamai read.
    "--disable-blink-features=AutomationControlled",
    "--disable-features=Translate,OptimizationHints",
]

# Removes the remaining obvious automation tells before any page script runs.
STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'languages', {get: () => ['es-UY','es','en-US','en']});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
window.chrome = window.chrome || {runtime: {}};
try {
  const q = navigator.permissions.query;
  navigator.permissions.query = (p) => p && p.name === 'notifications'
    ? Promise.resolve({state: Notification.permission}) : q(p);
} catch (e) {}
"""

# Cookie/consent walls block the article and poison the PDF; click them away.
CONSENT_JS = """
() => {
  const wants = [
    'aceptar y continuar', 'aceptar todo', 'aceptar todas', 'acepto', 'aceptar',
    'accept all', 'i accept', 'accept cookies', 'agree and continue', 'i agree',
    'continue reading', 'continuar', 'entendido', 'de acuerdo', 'got it',
    'allow all', 'consent', 'zustimmen', 'tout accepter',
  ];
  let clicked = 0;
  const nodes = [...document.querySelectorAll('button, a[role=button], [role=button], input[type=submit], .fc-button')];
  for (const el of nodes) {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!t || t.length > 40) continue;
    if (wants.some(w => t === w || t.startsWith(w))) {
      try { el.click(); clicked++; } catch (e) {}
      if (clicked >= 3) break;
    }
  }
  return clicked;
}
"""

# Kills sticky bars / modals that repeat on every printed page, and re-enables
# scrolling that paywall overlays often lock.
UNBLOCK_JS = """
() => {
  const kill = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      const r = el.getBoundingClientRect();
      if (r.height > 40 || cs.position === 'fixed') kill.push(el);
    }
    if (parseInt(cs.zIndex || '0', 10) > 9000 && cs.position !== 'static') kill.push(el);
  }
  kill.forEach(el => el.style.setProperty('display', 'none', 'important'));
  for (const el of [document.documentElement, document.body]) {
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('position', 'static', 'important');
    el.style.setProperty('height', 'auto', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('filter', 'none', 'important');
  }
  return kill.length;
}
"""

# Lazy-loaded images have no usable src until scrolled into view.
LAZY_JS = """
() => {
  const pick = (ss) => {
    const parts = ss.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [u, d] = s.split(/\\s+/);
      return {u, w: parseInt((d || '').replace(/\\D/g, ''), 10) || 0};
    });
    parts.sort((a, b) => b.w - a.w);
    return parts.length ? parts[0].u : null;
  };
  for (const img of document.querySelectorAll('img')) {
    const ds = img.getAttribute('data-src') || img.getAttribute('data-original')
            || img.getAttribute('data-lazy-src') || img.getAttribute('data-hi-res-src');
    if (ds && !img.getAttribute('src')) img.setAttribute('src', ds);
    const dss = img.getAttribute('data-srcset') || img.getAttribute('srcset');
    if (dss) { const b = pick(dss); if (b) img.setAttribute('src', b); }
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    const s = img.getAttribute('src');
    if (s) { try { img.setAttribute('src', new URL(s, document.baseURI).href); } catch (e) {} }
  }
  for (const src of document.querySelectorAll('source')) src.remove();
}
"""

EXTRACT_JS = r"""
() => {
  const JUNK = ['script','style','noscript','nav','aside','footer','header','form',
    'iframe','button','svg','video','audio','[aria-hidden=true]',
    '[class*="related"]','[class*="newsletter"]','[class*="promo"]','[class*="social"]',
    '[class*="share"]','[class*="comment"]','[class*="subscri"]','[class*="paywall"]',
    '[class*="advert"]','[id*="advert"]','[class*="recirc"]','[class*="taboola"]'];

  // Fallback for pages Readability misjudges: pick the tightest container that
  // holds essentially all of the paragraph text.
  const densest = () => {
    const score = new Map();
    for (const p of document.querySelectorAll('p')) {
      const t = (p.innerText || '').trim();
      if (t.length < 40) continue;
      let el = p.parentElement, depth = 0;
      while (el && el !== document.body && depth < 5) {
        score.set(el, (score.get(el) || 0) + t.length);
        el = el.parentElement; depth++;
      }
    }
    if (!score.size) return null;
    const max = Math.max(...score.values());
    let best = null, bestDepth = -1;
    for (const [el, len] of score) {
      if (len < max * 0.9) continue;            // keep only near-complete containers
      let d = 0;
      for (let n = el; n; n = n.parentElement) d++;
      if (d > bestDepth) { best = el; bestDepth = d; }   // deepest == most specific
    }
    if (!best) return null;
    const clone = best.cloneNode(true);
    clone.querySelectorAll(JUNK.join(',')).forEach(e => e.remove());
    const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    return {content: clone.innerHTML, chars: text.length};
  };

  const meta = (sel, attr) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute(attr) || '').trim() : '';
  };

  let art = null;
  try {
    art = new Readability(document.cloneNode(true),
      {charThreshold: 250, keepClasses: false, classesToPreserve: ['caption']}).parse();
  } catch (e) { art = null; }

  const rChars = art ? (art.textContent || '').replace(/\s+/g, ' ').trim().length : 0;
  let content = art ? art.content : null, chars = rChars, method = 'readability';

  // Only reach for the heuristic when Readability clearly came up short.
  if (rChars < 1200) {
    const alt = densest();
    if (alt && alt.chars > rChars * 1.5 && alt.chars > 400) {
      content = alt.content; chars = alt.chars; method = 'density';
    }
  }
  if (!content) return {error: 'no article content found'};

  return {
    title: (art && art.title || meta('meta[property="og:title"]', 'content')
            || document.title || '').trim(),
    content, chars, method,
    byline: ((art && art.byline) || meta('meta[name="author"]', 'content') || '').trim(),
    siteName: ((art && art.siteName) || meta('meta[property="og:site_name"]', 'content') || '').trim(),
    published: ((art && art.publishedTime) || meta('meta[property="article:published_time"]', 'content')
                || meta('time[datetime]', 'datetime') || '').trim(),
  };
}
"""

# Broken images (CDN refusals, tracking pixels) otherwise print as big empty
# boxes and pad the PDF with blank space.
SETTLE_IMAGES_JS = """
async () => {
  await Promise.all([...document.images].map(img => img.complete ? null : new Promise(res => {
    img.addEventListener('load', res, {once: true});
    img.addEventListener('error', res, {once: true});
    setTimeout(res, 6000);
  })));
  let dropped = 0;
  for (const img of [...document.images]) {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w === 0 || (w < 60 && h < 60)) { img.remove(); dropped++; }
  }
  // A figure whose image is gone is just a stray caption.
  for (const fig of document.querySelectorAll('figure, picture')) {
    if (!fig.querySelector('img')) { fig.remove(); }
  }
  return dropped;
}
"""

AUTOSCROLL_JS = """
async () => {
  const step = Math.max(400, window.innerHeight * 0.8);
  const max = Math.min(document.body.scrollHeight, 60000);
  for (let y = 0; y < max; y += step) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 90));
  }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 250));
}
"""

PDF_OPTS = {
    "printBackground": True,
    "paperWidth": 8.27, "paperHeight": 11.69,   # A4
    "marginTop": 0.0, "marginBottom": 0.0, "marginLeft": 0.0, "marginRight": 0.0,
    "preferCSSPageSize": True,
}


@dataclass
class Result:
    pdf: bytes
    title: str
    engine: str
    chars: int
    url: str

    @property
    def filename(self) -> str:
        base = re.sub(r"[^\w\s-]", "", self.title, flags=re.UNICODE).strip()
        base = re.sub(r"[\s_]+", "-", base)[:70].strip("-") or "articulo"
        return f"{base}.pdf"


class RenderError(RuntimeError):
    pass


class Renderer:
    """Owns one long-lived Chromium with the extension loaded."""

    def __init__(self) -> None:
        self._pw = None
        self._ctx = None
        self._jobs = 0
        self._lock = asyncio.Lock()
        self.ext_version: str | None = None
        self.rules: int = 0

    # --- lifecycle --------------------------------------------------------
    @staticmethod
    def _clear_profile_locks() -> None:
        """Chromium refuses to open a profile locked by another host, and the
        lock records the container hostname — which changes every time the
        container is recreated. This container is the profile's only user, so
        any lock found at startup is stale."""
        for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
            stale = Path(PROFILE_DIR) / name
            try:
                if stale.is_symlink() or stale.exists():
                    stale.unlink()
                    log.info("removed stale profile lock %s", name)
            except OSError as exc:
                log.warning("could not remove %s: %s", name, exc)

    async def start(self) -> None:
        self.ext_version = extension.ensure()
        Path(PROFILE_DIR).mkdir(parents=True, exist_ok=True)
        self._clear_profile_locks()
        Path(DEBUG_DIR).mkdir(parents=True, exist_ok=True)
        self._pw = await async_playwright().start()
        self._ctx = await self._pw.chromium.launch_persistent_context(
            PROFILE_DIR,
            channel="chromium",          # full Chromium: headless_shell can't load extensions
            headless=True,
            args=[*LAUNCH_ARGS,
                  f"--disable-extensions-except={EXT_DIR}",
                  f"--load-extension={EXT_DIR}"],
            chromium_sandbox=False,
            viewport={"width": 1400, "height": 1800},
            user_agent=USER_AGENT,
            locale=LOCALE,
            timezone_id=TIMEZONE,
            extra_http_headers={"Accept-Language": f"{LOCALE},es;q=0.9,en;q=0.8"},
            ignore_https_errors=True,
        )
        await self._ctx.add_init_script(STEALTH_JS)
        self._ctx.set_default_navigation_timeout(NAV_TIMEOUT_MS)
        self.rules = await self._wait_for_extension()
        self._jobs = 0
        log.info("browser up: BPC %s, %d blocking rules active", self.ext_version, self.rules)

    async def _wait_for_extension(self, timeout_s: int = 45) -> int:
        """Wait until the MV3 service worker has registered its blocking rules."""
        page = await self._ctx.new_page()
        deadline = time.monotonic() + timeout_s
        rules = 0
        try:
            while time.monotonic() < deadline:
                try:
                    await page.goto(f"chrome-extension://{BPC_EXT_ID}/options/options.html",
                                    timeout=15000)
                    rules = await page.evaluate("""async () => {
                        let n = 0;
                        try { n += (await chrome.declarativeNetRequest.getSessionRules()).length; } catch (e) {}
                        try { n += (await chrome.declarativeNetRequest.getDynamicRules()).length; } catch (e) {}
                        return n;
                    }""")
                    if rules > 0:
                        return rules
                except PWError:
                    pass
                await asyncio.sleep(1.5)
            log.warning("extension rules not confirmed after %ss (got %d)", timeout_s, rules)
            return rules
        finally:
            await page.close()

    async def stop(self) -> None:
        try:
            if self._ctx:
                await self._ctx.close()
        finally:
            if self._pw:
                await self._pw.stop()
            self._ctx = self._pw = None

    async def restart(self, force_extension_update: bool = False) -> None:
        await self.stop()
        if force_extension_update:
            extension.ensure(force=True)
        await self.start()

    # --- engines ----------------------------------------------------------
    async def _engine_browser(self, url: str, raw: bool
                              ) -> tuple[dict | None, str | None, bytes | None]:
        """Load the URL in Chromium with BPC active.

        Returns (article, rendered_html, raw_pdf). The HTML snapshot carries the
        extension's DOM changes and feeds a second extraction attempt, because
        Readability sometimes fails on a live page it handles fine statically.
        """
        page = await self._ctx.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
            except PWError:
                pass
            # BPC rewrites the article asynchronously after load.
            await page.wait_for_timeout(SETTLE_MS)
            try:
                if await page.evaluate(CONSENT_JS):
                    await page.wait_for_timeout(1200)
            except PWError:
                pass
            try:
                await page.evaluate(AUTOSCROLL_JS)
            except PWError:
                pass
            await page.evaluate(LAZY_JS)

            if raw:
                await page.evaluate(UNBLOCK_JS)
                await page.emulate_media(media="screen")
                await page.wait_for_timeout(600)
                cdp = await self._ctx.new_cdp_session(page)
                res = await cdp.send("Page.printToPDF", {**PDF_OPTS, "preferCSSPageSize": False})
                return None, None, base64.b64decode(res["data"])

            snapshot = await page.content()
            await page.add_script_tag(path=READABILITY_JS)
            art = await page.evaluate(EXTRACT_JS)
            if art.get("error"):
                log.info("browser extract: %s", art["error"])
                return None, snapshot, None
            return art, snapshot, None
        finally:
            await page.close()

    async def _engine_static(self, url: str) -> dict | None:
        """Fetch raw HTML with no JS at all: defeats client-side paywalls that
        delete server-rendered text after load (e.g. elobservador.com.uy)."""
        html_text = None
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            for ua in (USER_AGENT, GOOGLEBOT_UA):
                try:
                    r = await client.get(url, headers={
                        "User-Agent": ua,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": f"{LOCALE},es;q=0.9,en;q=0.8",
                        "Referer": "https://www.google.com/",
                    })
                    if r.status_code < 400 and len(r.text) > 2000:
                        html_text = r.text
                        break
                    log.info("static fetch %s -> HTTP %s (%d bytes)", ua[:24], r.status_code, len(r.text))
                except httpx.HTTPError as exc:
                    log.info("static fetch failed: %s", exc)
        if not html_text:
            return None
        return await self._parse_html(html_text, url)

    async def _parse_html(self, html_text: str, url: str) -> dict | None:
        """Run Readability over HTML with every <script> removed."""
        stripped = re.sub(r"(?is)<script\b.*?</script\s*>", "", html_text)
        stripped = re.sub(r"(?is)<script\b[^>]*/?>", "", stripped)
        if "<base " not in stripped.lower():
            stripped = re.sub(r"(?i)(<head[^>]*>)", rf'\1<base href="{url}">', stripped, count=1)
        page = await self._ctx.new_page()
        try:
            await page.set_content(stripped, wait_until="domcontentloaded",
                                   timeout=NAV_TIMEOUT_MS)
            await page.evaluate(LAZY_JS)
            await page.add_script_tag(path=READABILITY_JS)
            art = await page.evaluate(EXTRACT_JS)
            return None if art.get("error") else art
        except PWError as exc:
            log.info("static parse failed: %s", exc)
            return None
        finally:
            await page.close()

    async def _engine_archive(self, url: str) -> dict | None:
        """Last resort for sites that block us at the edge (e.g. wsj.com)."""
        page = await self._ctx.new_page()
        try:
            await page.goto(f"https://archive.ph/newest/{url}", wait_until="domcontentloaded",
                            timeout=45000)
            await page.wait_for_timeout(4000)
            if "archive.ph/submit" in page.url or await page.locator("form#submiturl").count():
                log.info("archive.today has no snapshot for %s", url)
                return None
            await page.evaluate(LAZY_JS)
            await page.add_script_tag(path=READABILITY_JS)
            art = await page.evaluate(EXTRACT_JS)
            if art.get("error"):
                return None
            # Credit the original publication, not the archive mirror, and undo
            # the archive page's own title truncation marker.
            art["siteName"] = _host(url)
            art["title"] = re.sub(r"\s*[…]+\s*$", "", art.get("title", "")).strip()
            return art
        except PWError as exc:
            log.info("archive fallback failed: %s", exc)
            return None
        finally:
            await page.close()

    # --- public -----------------------------------------------------------
    async def render(self, url: str, raw: bool = False) -> Result:
        async with self._lock:
            if self._ctx is None:
                await self.start()
            elif self._jobs >= RESTART_AFTER_JOBS:
                log.info("recycling browser after %d jobs", self._jobs)
                await self.restart()
            try:
                return await asyncio.wait_for(self._render(url, raw), timeout=JOB_TIMEOUT_S)
            except asyncio.TimeoutError:
                raise RenderError(f"tardó más de {JOB_TIMEOUT_S}s y se canceló") from None
            except PWError as exc:
                log.exception("playwright error; restarting browser")
                await self.restart()
                raise RenderError(str(exc).splitlines()[0][:200]) from exc
            finally:
                self._jobs += 1

    async def _render(self, url: str, raw: bool) -> Result:
        t0 = time.monotonic()
        if raw:
            _, _, pdf = await self._engine_browser(url, raw=True)
            if not pdf:
                raise RenderError("no se pudo imprimir la página")
            return Result(pdf, _host(url), "raw", 0, url)

        candidates: list[tuple[str, dict]] = []
        browser_art, snapshot, _ = await self._engine_browser(url, raw=False)
        if browser_art:
            candidates.append(("bpc", browser_art))
            log.info("bpc engine: %d chars (%s)", browser_art["chars"], browser_art.get("method"))

        # Same page, but parsed as static HTML — recovers articles where
        # Readability trips over the live DOM (e.g. wired.com).
        if snapshot and (not browser_art or browser_art["chars"] < 20000):
            snap_art = await self._parse_html(snapshot, url)
            if snap_art:
                candidates.append(("bpc-html", snap_art))
                log.info("bpc-html engine: %d chars (%s)", snap_art["chars"], snap_art.get("method"))

        static_art = await self._engine_static(url)
        if static_art:
            candidates.append(("static", static_art))
            log.info("static engine: %d chars (%s)", static_art["chars"], static_art.get("method"))

        best = max(candidates, key=lambda c: c[1]["chars"], default=None)
        if (not best or best[1]["chars"] < MIN_ARTICLE_CHARS) and TRY_ARCHIVE_FALLBACK:
            arch = await self._engine_archive(url)
            if arch:
                log.info("archive engine: %d chars", arch["chars"])
                candidates.append(("archive", arch))
                best = max(candidates, key=lambda c: c[1]["chars"])

        if not best:
            raise RenderError("no se pudo extraer el artículo (el sitio bloqueó el acceso)")
        engine, art = best
        if art["chars"] < MIN_ARTICLE_CHARS:
            raise RenderError(
                f"solo se recuperaron {art['chars']} caracteres — probablemente el sitio "
                f"bloquea el acceso automatizado. Probá /raw {url}"
            )

        doc = build_page(
            title=art["title"] or _host(url),
            content_html=art["content"],
            url=url,
            site=art.get("siteName") or _host(url),
            byline=art.get("byline", ""),
            published=_fmt_date(art.get("published", "")),
            engine=engine,
        )
        pdf = await self._print_doc(doc, url)
        log.info("rendered %s via %s: %d chars, %d KB, %.1fs",
                 _host(url), engine, art["chars"], len(pdf) // 1024, time.monotonic() - t0)
        return Result(pdf, art["title"] or _host(url), engine, art["chars"], url)

    async def _print_doc(self, doc_html: str, url: str) -> bytes:
        page = await self._ctx.new_page()
        try:
            # Image CDNs frequently 403 a request with no Referer.
            await page.set_extra_http_headers({"Referer": url})
            await page.set_content(doc_html, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
            except PWError:
                pass
            try:
                dropped = await page.evaluate(SETTLE_IMAGES_JS)
                if dropped:
                    log.info("dropped %d unloadable image(s)", dropped)
            except PWError:
                pass
            await page.emulate_media(media="print")
            cdp = await self._ctx.new_cdp_session(page)
            res = await cdp.send("Page.printToPDF", PDF_OPTS)
            return base64.b64decode(res["data"])
        finally:
            await page.close()


def _host(url: str) -> str:
    return (urlparse(url).hostname or url).removeprefix("www.")


def _fmt_date(raw: str) -> str:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", raw or "")
    if not m:
        return ""
    months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
              "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    y, mo, d = m.groups()
    return f"{int(d)} de {months[int(mo) - 1]} de {y}"
