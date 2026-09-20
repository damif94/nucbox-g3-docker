"""Telegram bot: send a link, get the article back as a phone-sized PDF.

Runs one long-lived headless Chromium with the Bypass Paywalls Clean extension
loaded, and serves one render at a time (this box has 4 cores).
"""
import asyncio
import html
import logging
import re
import signal
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

import config
import extension
from render import RenderError, Renderer
from telegram import Telegram

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)-9s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bot")

URL_RE = re.compile(r"https?://[^\s<>\"')]+", re.I)
TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_[ce]id|igshid|ref_?src|__twitter)", re.I)

# The command index, in one place: /start and /help render it as text, and
# setMyCommands publishes the same list to the menu button beside Telegram's
# input box. Descriptions are plain text — Telegram rejects markup there.
COMMANDS: list[tuple[str, str]] = [
    ("start", "Índice de comandos y cómo usar el bot"),
    ("epub", "<link> → el artículo en EPUB"),
    ("pdf", "[tamaño] <link> → el artículo en PDF"),
    ("raw", "[tamaño] <link> → la página tal cual se ve (PDF)"),
    ("status", "Estado del servicio"),
    ("update", "Actualizar la extensión Bypass Paywalls"),
    ("help", "Lo mismo que /start"),
]


def help_text() -> str:
    fmt = config.DEFAULT_FORMAT.upper()
    index = "\n".join(f"• <code>/{cmd}</code> — {html.escape(desc)}"
                      for cmd, desc in COMMANDS)
    sizes = "\n".join(
        f"• <code>{name}</code> — {html.escape(config.page_profile(name)['label'])}"
        for name in config.PAGE_NAMES)
    return (
        f"<b>Bypass Paywalls → {html.escape(fmt)}</b>\n\n"
        f"Mandame un link y te devuelvo el artículo limpio, en modo lectura, "
        f"como {html.escape(fmt)}.\n\n"
        "<b>Comandos</b>\n"
        f"• <code>&lt;link&gt;</code> — {html.escape(fmt)} limpio (lo mismo que "
        f"<code>/{config.DEFAULT_FORMAT.lower()}</code>)\n"
        f"{index}\n\n"
        "<b>Tamaños de página</b> (opcional, después del comando)\n"
        f"{sizes}\n"
        f"Por defecto <code>{html.escape(config.PDF_PAGE)}</code>. "
        "Ej.: <code>/pdf a4 https://…</code>\n"
        "El EPUB no lleva tamaño: el texto lo reacomoda tu lector.\n\n"
        "Podés mandar varios links en un mismo mensaje."
    )


def parse_size(text: str) -> tuple[dict | None, str]:
    """Pull an optional page size off a command: `/pdf a4 <link>`.

    Only the word right after the command counts, and only when the message
    *starts* with a command — a forwarded link prefixed with prose would
    otherwise have its first word read as a botched size name.

    Returns (profile, unknown_token); both empty means no size was named.
    """
    parts = text.split(maxsplit=2)
    if len(parts) < 2 or not parts[0].startswith("/"):
        return None, ""
    token = parts[1].strip(",;:").lower()
    if not token or URL_RE.match(token):
        return None, ""
    try:
        return config.page_profile(token), ""
    except KeyError:
        return None, token[:24]


def clean_url(url: str) -> str:
    """Drop tracking params and trailing punctuation."""
    url = url.rstrip(").,;:'\"]}»")
    p = urlparse(url)
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urlunparse(p._replace(query=urlencode(q), fragment=""))


def sweep_debug() -> None:
    cutoff = time.time() - config.DEBUG_RETENTION_DAYS * 86400
    for f in Path(config.DEBUG_DIR).glob("*"):
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


class Bot:
    def __init__(self) -> None:
        self.tg = Telegram(config.BOT_TOKEN)
        self.renderer = Renderer()
        self.queue: asyncio.Queue = asyncio.Queue()
        self.started = time.time()
        self.done = 0
        self.failed = 0
        self._stop = asyncio.Event()

    # --- job handling -----------------------------------------------------
    async def worker(self) -> None:
        while not self._stop.is_set():
            job = await self.queue.get()
            try:
                await self.process(**job)
            except Exception:
                log.exception("job crashed")
            finally:
                self.queue.task_done()

    async def process(self, chat_id: int, url: str, raw: bool, fmt: str,
                      page: dict | None, reply_to: int, status_id: int) -> None:
        host = (urlparse(url).hostname or url).removeprefix("www.")
        await self.tg.edit(chat_id, status_id, f"⏳ Abriendo <b>{html.escape(host)}</b>…")
        await self.tg.action(chat_id)
        try:
            res = await self.renderer.render(url, raw=raw, fmt=fmt, page=page)
        except RenderError as exc:
            self.failed += 1
            await self.tg.edit(chat_id, status_id,
                               f"❌ <b>{html.escape(host)}</b>\n{html.escape(str(exc))}")
            return
        except Exception as exc:
            self.failed += 1
            log.exception("render failed")
            await self.tg.edit(chat_id, status_id,
                               f"❌ <b>{html.escape(host)}</b>\nerror interno: "
                               f"{html.escape(str(exc)[:200])}")
            return

        size_mb = len(res.data) / 1e6
        if size_mb > 49:
            self.failed += 1
            await self.tg.edit(chat_id, status_id,
                               f"❌ El {res.fmt.upper()} pesa {size_mb:.0f} MB, "
                               f"más de lo que permite Telegram.")
            return

        note = {"bpc": "extensión", "bpc-html": "extensión", "static": "HTML sin JS",
                "archive": "archive.today", "raw": "página completa"}.get(res.engine, res.engine)
        caption = (f"<b>{html.escape(res.title[:180])}</b>\n"
                   f"{html.escape(host)} · {note}"
                   + (f" · {res.chars:,} caracteres".replace(",", ".") if res.chars else "")
                   + (f" · {html.escape(res.page)}" if res.page else ""))
        await self.tg.action(chat_id)
        try:
            await self.tg.send_document(chat_id, res.filename, res.data, caption,
                                        reply_to, mime=res.mime)
            await self.tg.delete(chat_id, status_id)
            self.done += 1
        except Exception as exc:
            self.failed += 1
            log.exception("upload failed")
            await self.tg.edit(chat_id, status_id, f"❌ No pude subir el archivo: "
                                                   f"{html.escape(str(exc)[:200])}")

    async def refresher(self) -> None:
        """BPC ships fixes constantly; stale rules mean silent failures. Refresh
        it on a timer, not just at container start."""
        while not self._stop.is_set():
            await asyncio.sleep(6 * 3600)
            if extension.age_days() <= config.BPC_MAX_AGE_DAYS or not self.queue.empty():
                continue
            try:
                log.info("extension is %.1f days old; refreshing", extension.age_days())
                await self.renderer.restart(force_extension_update=True)
            except Exception:
                log.exception("scheduled extension refresh failed")

    # --- message handling -------------------------------------------------
    async def handle(self, msg: dict) -> None:
        chat_id = msg["chat"]["id"]
        if config.ALLOWED_CHAT_IDS and chat_id not in config.ALLOWED_CHAT_IDS:
            # Name the sender: the id alone says nothing about whether this is
            # someone to add to PAYWALL_ALLOWED_CHAT_IDS or a stranger who found
            # the bot.
            who = msg.get("from") or {}
            log.warning("ignoring message from unauthorized chat %s (%s %s, @%s)",
                        chat_id, who.get("first_name", ""), who.get("last_name", ""),
                        who.get("username", "-"))
            return
        text = (msg.get("text") or msg.get("caption") or "").strip()
        if not text:
            return
        msg_id = msg["message_id"]
        low = text.lower()

        if low.startswith(("/start", "/help")):
            await self.tg.send(chat_id, help_text())
            return
        if low.startswith("/status"):
            await self.tg.send(chat_id, self.status_text())
            return
        if low.startswith("/update"):
            m = await self.tg.send(chat_id, "⏳ Actualizando la extensión…")
            try:
                await self.renderer.restart(force_extension_update=True)
                await self.tg.edit(chat_id, m["message_id"],
                                   f"✅ Bypass Paywalls Clean <b>{self.renderer.ext_version}</b>"
                                   f"\n{self.renderer.rules} reglas activas")
            except Exception as exc:
                await self.tg.edit(chat_id, m["message_id"],
                                   f"❌ Falló la actualización: {html.escape(str(exc)[:200])}")
            return

        raw = low.startswith("/raw")
        # /raw reproduces the page visually, which only a PDF can do.
        if raw or low.startswith("/pdf"):
            fmt = "pdf"
        elif low.startswith("/epub"):
            fmt = "epub"
        else:
            fmt = config.DEFAULT_FORMAT

        page, unknown = parse_size(text)
        if unknown:
            await self.tg.send(
                chat_id,
                f"No conozco el tamaño <code>{html.escape(unknown)}</code>. "
                f"Tengo: {', '.join(f'<code>{n}</code>' for n in config.PAGE_NAMES)}.",
                reply_to=msg_id)
            return
        if page and fmt == "epub":
            # EPUB has no page size at all — the reader reflows the text — so
            # saying so beats silently ignoring what was asked for.
            await self.tg.send(chat_id, "El EPUB no lleva tamaño de página (lo decide "
                                        "tu lector); lo genero igual.", reply_to=msg_id)
            page = None

        urls = [clean_url(u) for u in URL_RE.findall(text)]
        if not urls:
            await self.tg.send(chat_id, "Mandame un link (http/https) 🙂", reply_to=msg_id)
            return

        for url in urls[:5]:
            status = await self.tg.send(chat_id, "⏳ En cola…", reply_to=msg_id)
            await self.queue.put({
                "chat_id": chat_id, "url": url, "raw": raw, "fmt": fmt,
                "page": page, "reply_to": msg_id, "status_id": status["message_id"],
            })

    def status_text(self) -> str:
        up = time.time() - self.started
        h, m = divmod(int(up // 60), 60)
        return (
            "<b>Estado</b>\n"
            f"• Extensión: <b>{self.renderer.ext_version or '?'}</b> "
            f"({self.renderer.rules} reglas activas)\n"
            f"• PDFs generados: {self.done} · fallidos: {self.failed}\n"
            f"• En cola: {self.queue.qsize()}\n"
            f"• Tamaño por defecto: {html.escape(config.PDF_PAGE)} "
            f"({html.escape(config.PAGE['label'])})\n"
            f"• Uptime: {h}h {m}m"
        )

    # --- main loop --------------------------------------------------------
    async def run(self) -> None:
        sweep_debug()
        await self.renderer.start()
        me = await self.tg.me()
        # Publishes the index to the menu button next to the input box. The
        # token may be shared with watchtower, which only ever sends — so it
        # has no command menu of its own to clobber.
        await self.tg.set_my_commands(COMMANDS)
        log.info("bot @%s ready; authorized chats: %s",
                 me.get("username"), sorted(config.ALLOWED_CHAT_IDS) or "ANY (open!)")
        if not config.ALLOWED_CHAT_IDS:
            log.warning("no chat allowlist configured — anyone who finds the bot can use it")

        workers = [asyncio.create_task(self.worker()),
                   asyncio.create_task(self.refresher())]
        try:
            while not self._stop.is_set():
                try:
                    for update in await self.tg.get_updates():
                        msg = update.get("message") or update.get("edited_message")
                        if msg:
                            await self.handle(msg)
                except Exception:
                    log.exception("poll error; backing off")
                    await asyncio.sleep(5)
        finally:
            for w in workers:
                w.cancel()
            await self.renderer.stop()
            await self.tg.close()

    def request_stop(self) -> None:
        log.info("shutting down")
        self._stop.set()


async def main() -> None:
    bot = Bot()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, bot.request_stop)
    await bot.run()


if __name__ == "__main__":
    asyncio.run(main())
