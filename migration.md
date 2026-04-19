# Migration Runbook: Pi → NucBox G3

Migrating all Docker services from Raspberry Pi 4 (`192.168.1.131`) to GMKtec NucBox G3 (`192.168.1.100`). Downtime is accepted.

---

## Prerequisites (before migration day)

- [ ] All compose files committed and pulled on NucBox (`git pull`)
- [ ] `.env` on NucBox populated with real values (copy from Pi's `/home/damian/docker/.env`)
- [ ] SSH key access from NucBox to Pi works: `ssh damian@192.168.1.131`
- [ ] Docker networks created on NucBox:
  ```bash
  docker network create services_shared
  docker network create media
  ```
- [ ] Check Toshiba data size vs `/srv/data` capacity:
  ```bash
  ssh damian@192.168.1.131 "du -sh /srv/toshiba/data/*"
  df -h /srv/data
  ```

---

## Phase 0 — Compose files & CLAUDE.md ✓

All compose files created, CLAUDE.md and `.env.example` updated. Nothing to do here.

---

## Phase 1 — nginx

No Toshiba needed. Can be done before everything else.

**1a. Stop nginx on both sides:**
```bash
# Pi
ssh damian@192.168.1.131 "cd /home/damian/docker/nginx && docker compose --env-file /home/damian/docker/.env down"

# NucBox
cd /home/damian/nucbox-g3-docker/nginx && docker compose --env-file ../.env down
```

**1b. Rsync nginx data Pi → NucBox** (run from NucBox):
```bash
rsync -av damian@192.168.1.131:/home/damian/docker/nginx/data/        /home/damian/nucbox-g3-docker/nginx/data/
rsync -av damian@192.168.1.131:/home/damian/docker/nginx/mysql/       /home/damian/nucbox-g3-docker/nginx/mysql/
rsync -av damian@192.168.1.131:/home/damian/docker/nginx/letsencrypt/ /home/damian/nucbox-g3-docker/nginx/letsencrypt/
rsync -av damian@192.168.1.131:/home/damian/docker/nginx/html/        /home/damian/nucbox-g3-docker/nginx/html/
```

**1c. Start nginx on NucBox:**
```bash
cd /home/damian/nucbox-g3-docker/nginx && docker compose --env-file ../.env up -d
docker compose logs -f
```

**1d. Update router NAT:**
In your router admin panel, change the port-forward target for ports 80 and 443 from `192.168.1.131` → `192.168.1.100`.

Verify at `http://192.168.1.100:81` (NPM admin UI).

---

## Phase 2 — Stop Pi services & plug in Toshiba

**2a. Stop all remaining Pi services:**
```bash
ssh damian@192.168.1.131 << 'EOF'
cd /home/damian/docker/evolution-api && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/n8n           && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/emby          && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/tdarr         && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/sonarr        && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/radarr        && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/bazarr        && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/prowlarr      && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/qbittorrent   && docker compose --env-file /home/damian/docker/.env down
cd /home/damian/docker/watchtower    && docker compose --env-file /home/damian/docker/.env down
EOF
```

Confirm nothing is left running on the Pi:
```bash
ssh damian@192.168.1.131 "docker ps"
```

**2b. Unplug Toshiba from Pi → plug into NucBox.**

**2c. Mount Toshiba on NucBox:**
```bash
lsblk  # find the Toshiba partition (likely /dev/sda1)
sudo mkdir -p /mnt/toshiba
sudo mount /dev/sda1 /mnt/toshiba
ls /mnt/toshiba/data  # confirm: media, evolution-api, n8n, ...
```

**2d. Clone Toshiba data to `/srv/data`:**
```bash
du -sh /mnt/toshiba/data/*   # double-check it fits
sudo rsync -av /mnt/toshiba/data/ /srv/data/
sudo chown -R 1000:1000 /srv/data
```

---

## Phase 3 — evolution-api + n8n

**3a. Stop NucBox n8n** (currently running with empty data):
```bash
cd /home/damian/nucbox-g3-docker/n8n && docker compose --env-file ../.env down
```

**3b. Start evolution-api:**
```bash
cd /home/damian/nucbox-g3-docker/evolution-api && docker compose --env-file ../.env up -d
docker compose logs -f
```

**3c. Start n8n:**
```bash
cd /home/damian/nucbox-g3-docker/n8n && docker compose --env-file ../.env up -d
docker compose logs -f
```

---

## Phase 4 — arr stack + qBittorrent

**4a. Create config dirs and rsync from Pi:**
```bash
sudo mkdir -p /home/damian/docker/{sonarr,radarr,bazarr,prowlarr,qbittorrent}/config

rsync -av damian@192.168.1.131:/home/damian/docker/sonarr/config/      /home/damian/docker/sonarr/config/
rsync -av damian@192.168.1.131:/home/damian/docker/radarr/config/      /home/damian/docker/radarr/config/
rsync -av damian@192.168.1.131:/home/damian/docker/bazarr/config/      /home/damian/docker/bazarr/config/
rsync -av damian@192.168.1.131:/home/damian/docker/prowlarr/config/    /home/damian/docker/prowlarr/config/
rsync -av damian@192.168.1.131:/home/damian/docker/qbittorrent/config/ /home/damian/docker/qbittorrent/config/
```

**4b. Start services:**
```bash
cd /home/damian/nucbox-g3-docker/sonarr      && docker compose --env-file ../.env up -d
cd /home/damian/nucbox-g3-docker/radarr      && docker compose --env-file ../.env up -d
cd /home/damian/nucbox-g3-docker/bazarr      && docker compose --env-file ../.env up -d
cd /home/damian/nucbox-g3-docker/prowlarr    && docker compose --env-file ../.env up -d
cd /home/damian/nucbox-g3-docker/qbittorrent && docker compose --env-file ../.env up -d
```

---

## Phase 5 — Emby + Tdarr

**5a. Create config dirs and rsync from Pi:**
```bash
sudo mkdir -p /home/damian/docker/emby/{config,cache}
sudo mkdir -p /home/damian/docker/tdarr/{config,logs,server}

rsync -av damian@192.168.1.131:/home/damian/docker/emby/config/  /home/damian/docker/emby/config/
rsync -av damian@192.168.1.131:/home/damian/docker/emby/cache/   /home/damian/docker/emby/cache/
rsync -av damian@192.168.1.131:/home/damian/docker/tdarr/config/ /home/damian/docker/tdarr/config/
rsync -av damian@192.168.1.131:/home/damian/docker/tdarr/logs/   /home/damian/docker/tdarr/logs/
rsync -av damian@192.168.1.131:/home/damian/docker/tdarr/server/ /home/damian/docker/tdarr/server/
```

**5b. Start services:**
```bash
cd /home/damian/nucbox-g3-docker/emby  && docker compose --env-file ../.env up -d
cd /home/damian/nucbox-g3-docker/tdarr && docker compose --env-file ../.env up -d
```

> Emby will rebuild its media index on first start — library content appears progressively, this is normal.

---

## Phase 6 — Watchtower

No data to migrate:
```bash
cd /home/damian/nucbox-g3-docker/watchtower && docker compose --env-file ../.env up -d
```

> Portainer is already running on NucBox — skip migration (its data is NucBox-specific).

---

## Phase 7 — Cleanup

**7a. Verify all services are up:**
```bash
docker ps
```

Expected: 14 containers (evolution-api, evolution-postgres, evolution-redis, n8n, n8n-postgres, nginx-proxy-manager, npm-mariadb, landing, emby, tdarr, sonarr, radarr, bazarr, prowlarr, qbittorrent, watchtower, portainer).

**7b. Unmount and remove Toshiba:**
```bash
sudo umount /mnt/toshiba
# Physically unplug the Toshiba drive
```

**7c. Update CLAUDE.md:**
Mark all services as `running` in the Services table.

---

## Post-migration checklist

- [ ] All subdomains of `damianferencz.org` resolve correctly
- [ ] Emby accessible and media library visible
- [ ] n8n workflows intact (check execution history)
- [ ] Evolution API: WhatsApp instances reconnected
- [ ] Sonarr/Radarr: indexers responding (verify via Prowlarr)
- [ ] qBittorrent: existing torrents visible
- [ ] Tdarr: node shows as `G3Node`
- [ ] Watchtower: next scheduled run sends Telegram notification
