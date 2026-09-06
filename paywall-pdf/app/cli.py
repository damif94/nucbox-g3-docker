"""Render URLs from the command line — for debugging without Telegram.

    docker compose run --rm --entrypoint python3 paywall-pdf \\
      cli.py <url> [--pdf] [--raw]
"""
import asyncio
import logging
import sys
from pathlib import Path

from config import DEBUG_DIR, DEFAULT_FORMAT
from render import Renderer

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-7s %(name)-9s %(message)s",
                    datefmt="%H:%M:%S")


async def main(urls: list[str], raw: bool, fmt: str) -> int:
    out = Path(DEBUG_DIR)
    out.mkdir(parents=True, exist_ok=True)
    r = Renderer()
    await r.start()
    failures = 0
    try:
        for url in urls:
            try:
                res = await r.render(url, raw=raw, fmt=fmt)
            except Exception as exc:
                failures += 1
                print(f"FAIL  {url}\n      {exc}", flush=True)
                continue
            path = out / res.filename
            path.write_bytes(res.data)
            print(f"OK    {res.engine:8} {res.fmt:4} {res.chars:7,} chars  "
                  f"{len(res.data) // 1024:6,} KB  {path}", flush=True)
    finally:
        await r.stop()
    return failures


if __name__ == "__main__":
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("usage: cli.py <url>... [--pdf] [--raw]")
    raw = "--raw" in flags
    fmt = "pdf" if raw or "--pdf" in flags else DEFAULT_FORMAT
    sys.exit(min(asyncio.run(main(args, raw, fmt)), 1))
