"""Download / refresh the Bypass Paywalls Clean unpacked extension."""
import io
import json
import logging
import shutil
import time
import zipfile
from pathlib import Path

import httpx

from config import BPC_MAX_AGE_DAYS, BPC_ZIP_URL, EXT_DIR

log = logging.getLogger("extension")
STAMP = "installed.json"


def installed_version() -> str | None:
    manifest = Path(EXT_DIR) / "manifest.json"
    if not manifest.exists():
        return None
    try:
        return json.loads(manifest.read_text())["version"]
    except Exception:
        return None


def age_days() -> float:
    stamp = Path(EXT_DIR) / STAMP
    if not stamp.exists():
        return float("inf")
    try:
        return (time.time() - json.loads(stamp.read_text())["installed_at"]) / 86400
    except Exception:
        return float("inf")


def download() -> str:
    """Fetch the latest BPC zip and unpack it into EXT_DIR. Returns the version."""
    log.info("downloading extension from %s", BPC_ZIP_URL)
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        resp = client.get(BPC_ZIP_URL, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        blob = resp.content

    zf = zipfile.ZipFile(io.BytesIO(blob))
    names = zf.namelist()
    # The archive wraps everything in a single top-level directory; strip it so
    # manifest.json lands directly in EXT_DIR (Chrome needs it at the root).
    roots = {n.split("/")[0] for n in names}
    prefix = f"{roots.pop()}/" if len(roots) == 1 else ""
    if not any(n == f"{prefix}manifest.json" for n in names):
        raise RuntimeError("downloaded archive has no manifest.json at its root")

    # EXT_DIR is a bind-mount point, so it can never be renamed — only its
    # contents can be replaced. Stage inside it, then swap the contents over.
    target = Path(EXT_DIR)
    target.mkdir(parents=True, exist_ok=True)
    staging = target / ".staging"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    for name in names:
        if not name.startswith(prefix) or name.endswith("/"):
            continue
        dest = staging / name[len(prefix):]
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(name) as src, open(dest, "wb") as out:
            shutil.copyfileobj(src, out)

    version = json.loads((staging / "manifest.json").read_text())["version"]
    (staging / STAMP).write_text(json.dumps({"installed_at": time.time(), "version": version}))

    # Chrome only reads the extension at browser launch, and the browser is
    # always stopped while this runs, so a non-atomic swap is safe here.
    for entry in target.iterdir():
        if entry.name == ".staging":
            continue
        shutil.rmtree(entry) if entry.is_dir() else entry.unlink()
    for entry in list(staging.iterdir()):
        entry.rename(target / entry.name)
    staging.rmdir()
    log.info("extension installed: version %s (%d files)", version, len(names))
    return version


def ensure(force: bool = False) -> str:
    """Install the extension if missing, stale, or when force=True."""
    have = installed_version()
    if force or have is None or age_days() > BPC_MAX_AGE_DAYS:
        try:
            return download()
        except Exception as exc:
            if have:
                log.warning("extension refresh failed (%s); keeping version %s", exc, have)
                return have
            raise
    log.info("extension version %s is current (%.1f days old)", have, age_days())
    return have
