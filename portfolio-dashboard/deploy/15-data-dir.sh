#!/bin/sh
# /data holds the stored CSV set (written by nginx's WebDAV PUT, so it must belong to the
# nginx worker user). .tmp is the upload temp dir: same volume, so the final rename is atomic.
set -eu
mkdir -p /data/.tmp
chown -R nginx:nginx /data
chmod 700 /data /data/.tmp
