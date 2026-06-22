# nucbox-g3-docker Project Context

This file contains project-specific context for Claude Code.

## Hardware

- **Device**: GMKtec NucBoxG3 Plus (Mini PC)
- **CPU**: Intel N150, 4 cores, up to 3.6 GHz (x86_64), VT-x enabled
- **RAM**: 16 GB
- **Architecture**: x86_64 (amd64)
- **OS**: Ubuntu 24.04.4 LTS (Noble)

## Access

- **Primary Access**: SSH (local network)
- **SSH User**: damian
- **Project Path**: `/home/damian/nucbox-g3-docker`
- **LAN IP**: `192.168.0.100`

## Storage

| Partition | Size | Mount | Notes |
|-----------|------|-------|-------|
| `nvme0n1p1` | 100 MB | `/boot/efi` | EFI |
| `nvme0n1p5` | 280.5 GB | `/` | Root, ~250 GB free |
| `nvme0n1p2` | 195.3 GB | `/srv/data` | ext4, UUID `b9e73044-62fa-4c6c-80b3-fbc18dd27eb6`, auto-mounted via fstab |

### Data Path Convention

- **System-local data** (nginx, portainer): relative paths like `./data`, `./mysql`
- **Service config** (arr stack, emby, tdarr, qbittorrent): `/home/damian/docker/<service>/config`
  - Mirrors the Pi's path convention for easy rsync during migration
- **Service data** (media, databases, heavy I/O): `/srv/data/<service-name>`
  - Permissions: `sudo mkdir -p /srv/data/<service> && sudo chown -R 1000:1000 /srv/data/<service>`

## Project Structure

Each service has its own directory with a single `docker-compose.yml`.
Services start independently: `cd <service> && docker compose --env-file ../.env up -d`

## Services

| Service | Port(s) | Status |
|---------|---------|--------|
| portainer | 9000 | running |
| nginx (Proxy Manager) | 80, 81, 443 | running |
| watchtower | — | running |
| n8n | 5678 | running |
| mcp-router | 4781 | running |
| mcp-server | — (internal) | running |
| evolution-api | 8088 | — |
| metatube | 8081 | — |
| emby | 8096 | — |
| tdarr | 8265, 8266 | — |
| qbittorrent | 8080, 6881 | — |
| sonarr | 8989 | — |
| radarr | 7878 | — |
| bazarr | 6767 | — |
| prowlarr | 9696 | — |
| cloudflare-ddns | — | — |
| postgres (shared) | 5432 | running |
| agents | 8723 | running (multi-customer) |

## Environment Variables

- `.env` at project root (gitignored — not committed)
- `.env.example` provides template — always keep this up to date
- Services reference variables as `${VAR_NAME}`

## Networking

- Docker networks created manually before first use
- Nginx Proxy Manager handles SSL/TLS termination
- Services use isolated Docker networks; only expose ports where needed

### NPM Default Site (Landing Page)

`http://192.168.0.100` (port 80) serves the landing page via NPM's default site config at `/data/nginx/default_host/site.conf`, pointing to `/html/index.html` (mounted from `nginx/html/`). HTML changes are reflected immediately — no restart needed.

> **Caveat:** Saving any setting in the NPM UI triggers a config regeneration that may overwrite `site.conf`. If the landing page stops working, restore it with:
> ```bash
> docker cp /tmp/site.conf nginx-proxy-manager:/data/nginx/default_host/site.conf && docker exec nginx-proxy-manager nginx -s reload
> ```
> The correct `site.conf` content is:
> ```nginx
> server {
>   listen 80 default;
>   listen [::]:80 default;
>   server_name default-host.localhost;
>   access_log /data/logs/default-host_access.log combined;
>   error_log /data/logs/default-host_error.log warn;
>   include conf.d/include/letsencrypt-acme-challenge.conf;
>   location / {
>     index index.html;
>     root /html;
>   }
> }
> ```

### Shared Networks

```bash
# Create once on the host
docker network create services_shared
docker network create media
```

### Docker Daemon (`/etc/docker/daemon.json`)

```json
{
  "userland-proxy": false,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

- `iptables` is **not** disabled — Docker manages its own NAT/masquerade rules so containers can reach the internet.
- `userland-proxy: false` — uses kernel hairpin NAT instead of a userland proxy process for port forwarding.
- `no-new-privileges: true` — prevents container processes from gaining new privileges via setuid/setgid.
- Log rotation is capped at 3 × 10 MB per container.

> After editing `daemon.json`, apply with `sudo systemctl restart docker` then redeploy affected stacks.

### Firewall (UFW)

UFW is active on the host. **Every new host port mapping must be whitelisted** or the service will be unreachable from the LAN.

```bash
# Allow a TCP port
sudo ufw allow <port>/tcp

# Allow TCP + UDP (e.g. BitTorrent)
sudo ufw allow <port>/tcp && sudo ufw allow <port>/udp

# Check current rules
sudo ufw status
```

Current whitelisted ports:

| Service | Port(s) | Protocol |
|---|---|---|
| Nginx Proxy Manager | 80, 81, 443 | TCP |
| Portainer | 9000 | TCP |
| n8n | 5678 | TCP |
| Emby | 8096 | TCP |
| Tdarr | 8265, 8266 | TCP |
| qBittorrent | 8080 | TCP |
| qBittorrent | 6881 | TCP + UDP |
| Sonarr | 8989 | TCP |
| Radarr | 7878 | TCP |
| Bazarr | 6767 | TCP |
| Prowlarr | 9696 | TCP |
| Evolution API | 8088 | TCP |
| MeTube | 8081 | TCP |
| MCP Gateway | 4781 | TCP |
| PostgreSQL (shared) | 5432 | TCP |
| Agents | 8723 | TCP |

> When adding a new service, always update this table and run the `ufw allow` command before testing connectivity.

## Deployment Workflow

1. Edit/commit from workstation and push
2. SSH: `ssh damian@192.168.0.100`
3. Pull: `cd /home/damian/nucbox-g3-docker && git pull`
4. Deploy: `cd <service> && docker compose --env-file ../.env up -d`
5. Check: `docker compose logs -f`

## Architecture Notes

- All images are standard `linux/amd64` — no ARM compatibility concerns
- More powerful than a Pi: 16 GB RAM, Intel N150 handles transcoding better
- Timezone: `America/Montevideo`

## Useful Commands

```bash
# All running containers
docker ps

# Logs for a service
docker compose logs -f

# Update and restart
docker compose pull && docker compose up -d

# Resource usage
docker stats

# System cleanup
docker system prune -f
```
