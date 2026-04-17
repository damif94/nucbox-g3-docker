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
| `nvme0n1p2` | 195.3 GB | (unmounted) | Unformatted — reserved for Docker volumes / data |

### Data Path Convention

- **System-local data** (nginx, portainer): relative paths like `./data`, `./mysql`
- **Service data** (media, databases, heavy I/O): `/srv/data/<service-name>`
  - `nvme0n1p2` can be formatted and mounted at `/srv/data` for isolation
  - Until mounted, fall back to root partition paths

## Project Structure

Each service has its own directory with a single `docker-compose.yml`.
Services start independently: `cd <service> && docker compose --env-file ../.env up -d`

## Services

| Service | Port | Status |
|---------|------|--------|
| portainer | 9000 | — |
| nginx (Proxy Manager) | 80, 81, 443 | — |
| watchtower | — | — |

*(Update this table as services are added)*

## Environment Variables

- `.env` at project root (encrypt with git-crypt once installed)
- `.env.example` provides template — always keep this up to date
- Services reference variables as `${VAR_NAME}`

## Networking

- Docker networks created manually before first use
- Nginx Proxy Manager handles SSL/TLS termination
- Services use isolated Docker networks; only expose ports where needed

### Shared Networks

```bash
# Create once on the host
docker network create services_shared
```

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
