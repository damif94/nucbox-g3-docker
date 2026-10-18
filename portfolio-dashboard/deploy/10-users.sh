#!/bin/sh
# Writes the login list (user:password per line) and the profile list (profile:user,user per
# line) into the conf.d tmpfs before nginx starts; deploy/njs/auth.js reads both. It never
# touches disk outside the container's tmpfs.
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

# Profiles: each one is a separate upload library (/data/library/<profile>). Format:
# PORTFOLIO_PROFILES=profile:user,user;profile2:user,user (the first profile listed also
# receives a pre-profiles library). Unset means one profile, "main", shared by every login.
pf=/etc/nginx/conf.d/profiles
logins=$(cut -d: -f1 "$f" | tr '\n' ',' | sed 's/,$//')
profiles=${PORTFOLIO_PROFILES:-main:$logins}
: > "$pf"
echo "$profiles" | tr ';' '\n' | while IFS=: read -r name members; do
  name=$(echo "$name" | tr -d ' ')
  members=$(echo "$members" | tr -d ' ')
  [ -n "$name" ] || continue
  if ! echo "$name" | grep -Eq '^[a-z0-9][a-z0-9_-]{0,31}$'; then
    echo "10-users.sh: bad profile name '$name' (a-z, 0-9, - and _ only)" >&2
    exit 1
  fi
  # a typo in a member name would silently lock someone out: refuse to start instead
  for u in $(echo "$members" | tr ',' ' '); do
    if ! cut -d: -f1 "$f" | grep -qxF "$u"; then
      echo "10-users.sh: profile '$name' lists '$u', who has no login" >&2
      exit 1
    fi
  done
  printf '%s:%s\n' "$name" "$members" >> "$pf"
done
for u in $(echo "$logins" | tr ',' ' '); do
  cut -d: -f2 "$pf" | tr ',' '\n' | grep -qxF "$u" || echo "10-users.sh: warning: '$u' is in no profile and can't sign in" >&2
done
chmod 640 "$pf"
chgrp nginx "$pf"
