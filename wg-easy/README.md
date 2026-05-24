# wg-easy

WireGuard VPN server with a web UI, running on the NucBox G3.

## Overview

- **Image**: `ghcr.io/wg-easy/wg-easy:15`
- **VPN port**: `51820/udp` — WireGuard traffic
- **Web UI port**: `51821/tcp` — admin interface
- **Data**: `/srv/data/wg-easy` (WireGuard configs, keys, peer list)
- **Auth**: username + password set via the web UI on first run (v15 dropped PASSWORD_HASH)

---

## Pre-deployment checklist

### 1. Set `.env` values

```env
WG_HOST=damianferencz.org   # public hostname or IP that clients will connect to
```

### 2. Create data directory

```bash
sudo mkdir -p /srv/data/wg-easy
sudo chown -R 1000:1000 /srv/data/wg-easy
```

### 3. Open firewall ports

```bash
sudo ufw allow 51820/udp   # WireGuard VPN
sudo ufw allow 51821/tcp   # Web UI (LAN only — consider restricting after setup)
```

### 4. Forward port on router

Forward **UDP 51820** from the internet → `192.168.0.100:51820`.
This is required for external devices to reach the VPN.

---

## Deploy

```bash
cd /home/damian/nucbox-g3-docker/wg-easy
docker compose --env-file ../.env up -d
docker compose logs -f
```

---

## First-run setup

1. Open `http://192.168.0.100:51821`
2. The UI will prompt you to create an admin username and password — do this immediately.
3. From then on, login uses those credentials.

If you ever need to reset the admin account:

```bash
docker exec -it wg-easy cli db:admin:reset
```

---

## Post-deploy

1. Create a peer (client config) for each device in the web UI.
2. Download the `.conf` or scan the QR code on the client.

### Optional: put Web UI behind Nginx Proxy Manager

Add a proxy host in NPM pointing to `wg-easy:51821` with SSL.
Set `INSECURE=true` in the environment if NPM → wg-easy traffic is plain HTTP.

---

## Notes

- `no-new-privileges: true` in `daemon.json` is compatible with `cap_add: NET_ADMIN` — capabilities are granted at container start, not acquired via execve.
- WireGuard is built into the Ubuntu 24.04 kernel (`6.8.x`), so `SYS_MODULE` and the `/lib/modules` bind-mount are included defensively but may not be strictly needed.
- The `sysctls` are set at the container level — no host sysctl changes required.
