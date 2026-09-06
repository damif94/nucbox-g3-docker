"""Minimal async Telegram Bot API client (long polling)."""
import logging

import httpx

log = logging.getLogger("telegram")


class Telegram:
    def __init__(self, token: str) -> None:
        if not token:
            raise RuntimeError("no bot token configured (PAYWALL_BOT_TOKEN / TELEGRAM_BOT_TOKEN)")
        self._base = f"https://api.telegram.org/bot{token}"
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
        self._offset = 0

    async def close(self) -> None:
        await self._client.aclose()

    async def _call(self, method: str, **params):
        r = await self._client.post(f"{self._base}/{method}", json=params)
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"{method} failed: {data.get('description')}")
        return data["result"]

    async def me(self) -> dict:
        return await self._call("getMe")

    async def get_updates(self, timeout: int = 50) -> list[dict]:
        try:
            updates = await self._call(
                "getUpdates", offset=self._offset, timeout=timeout,
                allowed_updates=["message", "edited_message"],
            )
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError) as exc:
            log.debug("poll timeout/network: %s", exc)
            return []
        for u in updates:
            self._offset = max(self._offset, u["update_id"] + 1)
        return updates

    async def send(self, chat_id: int, text: str, reply_to: int | None = None) -> dict:
        kwargs = dict(chat_id=chat_id, text=text, parse_mode="HTML",
                      disable_web_page_preview=True)
        try:
            return await self._call(
                "sendMessage", **kwargs,
                **({"reply_to_message_id": reply_to} if reply_to else {}))
        except RuntimeError as exc:
            # The original message can be gone by the time a queued job runs.
            if reply_to and "replied not found" in str(exc):
                log.info("reply target %s is gone; sending unthreaded", reply_to)
                return await self._call("sendMessage", **kwargs)
            raise

    async def edit(self, chat_id: int, message_id: int, text: str) -> None:
        try:
            await self._call("editMessageText", chat_id=chat_id, message_id=message_id,
                             text=text, parse_mode="HTML", disable_web_page_preview=True)
        except RuntimeError as exc:
            log.debug("edit ignored: %s", exc)

    async def delete(self, chat_id: int, message_id: int) -> None:
        try:
            await self._call("deleteMessage", chat_id=chat_id, message_id=message_id)
        except RuntimeError:
            pass

    async def action(self, chat_id: int, action: str = "upload_document") -> None:
        try:
            await self._call("sendChatAction", chat_id=chat_id, action=action)
        except RuntimeError:
            pass

    async def send_document(self, chat_id: int, filename: str, blob: bytes,
                            caption: str = "", reply_to: int | None = None,
                            mime: str = "application/octet-stream") -> None:
        data = {"chat_id": str(chat_id), "caption": caption[:1024], "parse_mode": "HTML"}
        if reply_to:
            data["reply_to_message_id"] = str(reply_to)
        for attempt in (1, 2):
            r = await self._client.post(
                f"{self._base}/sendDocument", data=data,
                files={"document": (filename, blob, mime)},
            )
            payload = r.json()
            if payload.get("ok"):
                return
            desc = str(payload.get("description"))
            # The original message can be gone by the time a queued job runs.
            if attempt == 1 and "replied not found" in desc:
                log.info("reply target %s is gone; sending unthreaded", reply_to)
                data.pop("reply_to_message_id", None)
                continue
            raise RuntimeError(f"sendDocument failed: {desc}")
