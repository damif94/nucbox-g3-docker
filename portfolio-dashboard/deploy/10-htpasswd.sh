#!/bin/sh
# Writes the basic-auth file into the conf.d tmpfs before nginx starts.
# nginx's {PLAIN} scheme avoids needing a hashing tool; the file never leaves the container's tmpfs.
set -eu
if [ -z "${PORTFOLIO_PASSWORD:-}" ]; then
  echo "10-htpasswd.sh: PORTFOLIO_PASSWORD is not set, refusing to start without auth" >&2
  exit 1
fi
f=/etc/nginx/conf.d/htpasswd
printf '%s:{PLAIN}%s\n' "${PORTFOLIO_USER:-damian}" "$PORTFOLIO_PASSWORD" > "$f"
# Optional extra logins: comma-separated user:password pairs (no commas in passwords).
echo "${PORTFOLIO_EXTRA_USERS:-}" | tr ',' '\n' | while IFS=: read -r u p; do
  if [ -n "$u" ] && [ -n "$p" ]; then printf '%s:{PLAIN}%s\n' "$u" "$p" >> "$f"; fi
done
chmod 640 "$f"
chgrp nginx "$f"
