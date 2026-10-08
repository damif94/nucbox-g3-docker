#!/bin/sh
# Writes the basic-auth file into the conf.d tmpfs before nginx starts.
# nginx's {PLAIN} scheme avoids needing a hashing tool; the file never leaves the container's tmpfs.
set -eu
if [ -z "${PORTFOLIO_PASSWORD:-}" ]; then
  echo "10-htpasswd.sh: PORTFOLIO_PASSWORD is not set, refusing to start without auth" >&2
  exit 1
fi
printf '%s:{PLAIN}%s\n' "${PORTFOLIO_USER:-damian}" "$PORTFOLIO_PASSWORD" > /etc/nginx/conf.d/htpasswd
chmod 640 /etc/nginx/conf.d/htpasswd
chgrp nginx /etc/nginx/conf.d/htpasswd
