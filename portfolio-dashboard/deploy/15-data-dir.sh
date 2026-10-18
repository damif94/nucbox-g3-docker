#!/bin/sh
# /data/library/<profile> holds each profile's uploaded exports (written by nginx's WebDAV PUT,
# so it must belong to the nginx worker user; PUT doesn't create directories, so every profile's
# is made here). .tmp is the upload temp dir: same volume, so the final rename is atomic.
# .session-secret is the HMAC key for login cookies; kept here so sessions survive restarts.
set -eu
mkdir -p /data/.tmp /data/library
first=$(head -n1 /etc/nginx/conf.d/profiles | cut -d: -f1)
for p in $(cut -d: -f1 /etc/nginx/conf.d/profiles); do mkdir -p "/data/library/$p"; done
# Before profiles the library was flat: those uploads belong to the first profile.
for f in /data/library/*.csv /data/library/*.json; do
  [ -f "$f" ] && mv "$f" "/data/library/$first/"
done
[ -s /data/.session-secret ] || head -c 48 /dev/urandom | base64 > /data/.session-secret
chown -R nginx:nginx /data
chmod 700 /data /data/.tmp /data/library /data/library/*
chmod 600 /data/.session-secret
