# agents

Host for custom AI agents, served at **https://agents.damianferencz.org**.

A custom container built from [`app/`](./app). The included app is a minimal,
runnable FastAPI placeholder (Claude-backed `/chat`, plus `/health` and `/docs`).
Swap `app/` for your real agent code — the compose + reverse-proxy plumbing stays
the same.

Interactive API docs (Swagger UI) are at `/docs`, ReDoc at `/redoc`, and the raw
OpenAPI schema at `/openapi.json`.

## Layout

```
agents/
├── docker-compose.yml   # builds app/, joins services_shared, no host port
└── app/
    ├── Dockerfile        # python:3.12-slim + uvicorn
    ├── requirements.txt
    └── main.py           # FastAPI app — replace with your agent
```

## Networking

- The container publishes host port `8723` (mapped to `8723` inside). This
  matches the homelab convention: NPM is **not** on the service Docker networks,
  so it reaches every backend via the host IP + published port.
- Nginx Proxy Manager terminates SSL and proxies the domain to
  `192.168.0.100:8723`.
- UFW must allow the port: `sudo ufw allow 8723/tcp`.

## First-time setup

1. **Data dir** (persistent state, mounted at `/data`):

   ```bash
   sudo mkdir -p /srv/data/agents && sudo chown -R 1000:1000 /srv/data/agents
   ```

2. **Env** — add to the project `.env` (see `.env.example`):

   ```
   ANTHROPIC_API_KEY=...     # Anthropic Console key (the SDK reads it from env)
   ```

3. **Firewall** — allow the port on the host:

   ```bash
   sudo ufw allow 8723/tcp
   ```

4. **DNS** — point `agents.damianferencz.org` at the server (handled by
   `cloudflare-ddns` if it's a subdomain of the managed zone).

5. **Build & start:**

   ```bash
   cd agents && docker compose --env-file ../.env up -d --build
   docker compose logs -f
   ```

6. **Nginx Proxy Manager** — add a Proxy Host (NPM UI on :81):
   - Domain: `agents.damianferencz.org`
   - Scheme: `http`, Forward Host: `192.168.0.100`, Forward Port: `8723`
   - Websockets: on (if your agent uses them)
   - SSL tab: request a Let's Encrypt cert, force SSL.

## Smoke test

```bash
# directly on the host:
curl http://192.168.0.100:8723/health

# through the proxy:
curl https://agents.damianferencz.org/health
```

## Rebuilding after code changes

```bash
cd agents && docker compose --env-file ../.env up -d --build
```
