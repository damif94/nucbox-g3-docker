#!/bin/sh
# /data holds the stored CSV set (written by nginx's WebDAV PUT, so it must belong to the
# nginx worker user). .tmp is the upload temp dir: same volume, so the final rename is atomic.
# .session-secret is the HMAC key for login cookies; kept here so sessions survive restarts.
set -eu
mkdir -p /data/.tmp
[ -s /data/.session-secret ] || head -c 48 /dev/urandom | base64 > /data/.session-secret
chown -R nginx:nginx /data
chmod 700 /data /data/.tmp
chmod 600 /data/.session-secret
