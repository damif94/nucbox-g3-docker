# Playwright's image already carries Chromium 140 + every system library it
# needs. The extension only loads in full Chromium (never headless_shell),
# which this image provides.
FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

COPY app/requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt


COPY app/ /app/
COPY vendor/ /app/vendor/

WORKDIR /app
# Ubuntu 24.04 ships "ubuntu" at uid 1000, which matches damian:damian on the
# host, so files landing in /srv/data keep this box's ownership convention.
USER ubuntu
CMD ["python3", "main.py"]
