#!/bin/sh
# Writes the login list (user:password per line) into the conf.d tmpfs before nginx starts;
# deploy/njs/auth.js reads it. It never touches disk outside the container's tmpfs.
set -eu
if [ -z "${PORTFOLIO_PASSWORD:-}" ]; then
  echo "10-users.sh: PORTFOLIO_PASSWORD is not set, refusing to start without auth" >&2
  exit 1
fi
f=/etc/nginx/conf.d/users
printf '%s:%s\n' "${PORTFOLIO_USER:-damian}" "$PORTFOLIO_PASSWORD" > "$f"
# Optional extra logins: comma-separated user:password pairs (no commas in passwords).
echo "${PORTFOLIO_EXTRA_USERS:-}" | tr ',' '\n' | while IFS=: read -r u p; do
  if [ -n "$u" ] && [ -n "$p" ]; then printf '%s:%s\n' "$u" "$p" >> "$f"; fi
done
chmod 640 "$f"
chgrp nginx "$f"
