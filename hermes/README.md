# hermes

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research) as Damian's
personal assistant, on Telegram as **@DamiPersonalAssistantBot**. Persistent memory, a
scheduler for reminders and recurring tasks, web search, and **read-only** access to the
box's files.

```
phone ──Telegram──▶ (long poll) hermes ──▶ Anthropic (claude-sonnet-5-5)
                                  │
                                  ├─ /files/media    (ro)  ← /srv/data/media
                                  └─ /files/toshiba  (ro)  ← /mnt/toshiba
LAN / VPN ──https──▶ NPM ──▶ hermes:9119  (dashboard, own login)
```

## Layout

| Host path | Container path | Notes |
|---|---|---|
| `/srv/data/hermes` | `/opt/data` | All state: `config.yaml`, `SOUL.md`, `memories/`, `skills/`, `cron/`, sessions DB, logs. Mode 700, owned by damian. |
| `/srv/data/media` | `/files/media` | read-only |
| `/mnt/toshiba` | `/files/toshiba` | read-only, long-form bind with `propagation: rslave` (follows USB remounts) |

`seed/` holds the files copied into `/srv/data/hermes` on first setup. Hermes owns the
live `config.yaml` after that (it migrates it on upgrade), so edit the live file and
back-port to `seed/` what is worth keeping.

## Security model

- **Who can talk to it:** only `HERMES_TELEGRAM_ALLOWED_USERS`; anyone else gets no reply
  (`unauthorized_dm_behavior: ignore`).
- **What it can touch:** shell commands run inside its own container (`terminal.backend: local`).
  There is **no Docker socket**; the only host data it sees is the two read-only mounts.
  `approvals.mode: smart` still screens risky commands, and scheduled jobs deny them.
- **No host port, no UFW rule.** Telegram is outbound polling; the dashboard is reached
  only through NPM.
- **Dashboard** (`https://hermes.damianferencz.org`) holds the API keys, so it is LAN/VPN only,
  in two layers:
  1. The DNS record points at the **private IP** `192.168.0.100`, so the name only leads
     anywhere on the LAN or over WireGuard (VPN clients use full-tunnel `0.0.0.0/0`).
  2. NPM access list `LAN + VPN only` allows `192.168.0.0/24`, `10.8.0.0/24`,
     `172.16.0.0/12` (Docker bridges, e.g. wg-easy's NAT) and denies everything else.

  Because the name resolves to a private IP, Let's Encrypt can't do its usual HTTP check,
  so the certificate uses the **Cloudflare DNS challenge** (`CF_API_TOKEN`).
  Login is Hermes' own basic auth (`HERMES_DASHBOARD_*` in `.env`).

## Operate

```bash
cd hermes && docker compose --env-file ../.env up -d
docker logs -f hermes

# Hermes CLI inside the container (always as the hermes user)
docker exec -it -u hermes hermes /opt/hermes/.venv/bin/hermes doctor
docker exec -it -u hermes hermes /opt/hermes/.venv/bin/hermes      # interactive chat
```

**Upgrade:** bump the pinned tag in `docker-compose.yml`, then `up -d`. It is pinned and
excluded from watchtower on purpose, because upgrades migrate the state in `/srv/data/hermes`.
Back up that directory first.

**Never run two Hermes containers on the same `/srv/data/hermes`.**
