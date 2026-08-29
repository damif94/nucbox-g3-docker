#!/usr/bin/env python3
import http.client, socket

s = socket.socket(socket.AF_UNIX)
s.connect("/var/run/docker.sock")
c = http.client.HTTPConnection("localhost")
c.sock = s
c.request("POST", "/containers/nginx-proxy-manager/kill?signal=HUP")
r = c.getresponse()
print(f"nginx reload: HTTP {r.status}")
