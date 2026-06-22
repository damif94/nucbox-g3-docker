# agents

Host for custom AI agents, served at **https://agents.damianferencz.org**.

A Claude-backed FastAPI service. `POST /chat` selects a **customer** via the
`X-Customer` header; each customer has its own config (system prompt, server
tools, MCP access, skills). Missing/unknown customer falls back to `default`.

Interactive API docs (Swagger UI) are at `/docs`, ReDoc at `/redoc`, and the raw
OpenAPI schema at `/openapi.json`.

## Layout

```
agents/
├── docker-compose.yml        # builds app/, publishes :8723, mounts config/ + skills/ (ro)
├── app/
│   ├── Dockerfile             # python:3.12-slim + uvicorn
│   ├── requirements.txt
│   └── main.py                # FastAPI app: customer routing, tools/MCP/skills
├── config/
│   └── customers/
│       ├── default.yaml        # fallback config (plain chat)
│       └── maximus.yaml        # first customer
└── skills/
    ├── registry.json           # custom-skill name -> {skill_id, version}
    └── <name>/SKILL.md          # locally authored custom skills (uploaded separately)
```

## Customers & capabilities

Each `config/customers/<name>.yaml` defines:

```yaml
name: maximus
system: "You are Maximus..."
# model: claude-opus-4-8                 # optional per-customer model override
tools:                                    # explicit Anthropic tool TYPES (you pick the variant)
  - web_fetch_20250910
  - code_execution_20250825
mcp: [wikipedia, n8n]                     # MCP gateway integrations (via the connector)
toolpacks: [maximus]                      # hand-written client-side tool packs (app/toolpacks.py)
skills:
  - { type: anthropic, id: pdf }          # prebuilt Anthropic skill
  - { type: custom, name: foo }           # custom skill, resolved via skills/registry.json
```

- **`tools` are explicit Anthropic tool types** — the app derives each tool's name
  and any required beta header from the type, and passes it through verbatim. You
  choose compatible variants in the YAML (see the caveat below).
- **Server tools, MCP, and skills run on Anthropic's side.** **Tool packs run
  here:** each pack in `app/toolpacks.py` bundles hand-written tool definitions
  with Python handlers; when a customer lists a pack in `toolpacks:`, `/chat`
  runs a client-side tool loop that executes those handlers and feeds results
  back. MCP uses the connector pointing at `https://mcp.damianferencz.org/<integration>`,
  authed with `MCP_GATEWAY_TOKEN`.
- **`maximus` tool pack** — read-only wrapper over the MaximUS API
  (apimax.picodix.com): list accounts/advisors/virtual groups, read holdings
  detail/summary, check ETL job status. Set `MAXIMUS_API_TOKEN` in `.env` (sent
  verbatim as the `Authorization` header). No write/upload tools are exposed.
- Config is mounted **read-only**, so edits take effect on `docker compose restart`
  (no rebuild needed).
- `GET /customers` lists configured customer names.

> **Tool-combo caveat:** the `_20260209` web tools (`web_search_20260209`,
> `web_fetch_20260209`) run code execution internally and auto-inject a
> `code_execution` tool. Combining them with skills or an explicit `code_execution`
> tool returns a 400 (duplicate tool). When using skills or code execution, pick the
> basic web variants instead: `web_search_20250305` / `web_fetch_20250910`.
> Skills also require `code_execution_20250825` to be present in `tools`.

## Custom skills

Skills are referenced by `skill_id`, which only exists after the skill is
**uploaded** to Anthropic — they are not loaded from disk at request time.

1. Author the skill in `skills/<name>/SKILL.md` (+ any helper files).
2. Register it once (no automated uploader yet — do it by hand):
   ```bash
   curl -X POST https://api.anthropic.com/v1/skills \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "anthropic-beta: skills-2025-10-02" \
     -F "display_title=My Skill" \
     -F "files[]=@skills/<name>/SKILL.md;filename=<name>/SKILL.md"
   # → returns a skill_id
   ```
3. Add it to `skills/registry.json`:
   ```json
   { "<name>": { "skill_id": "skill_abc123", "version": "latest" } }
   ```
4. Reference `{ type: custom, name: <name> }` in a customer's `skills:` list.

If a referenced custom skill isn't in the registry, the app logs a warning and
skips it (the request still succeeds).

## Authentication

- **Client → service:** optional shared `X-API-Key` (set `AGENTS_API_KEY`). Sent
  on `/chat`; `/health`, `/`, `/customers`, and `/docs` stay open.
- **Customer selection:** `X-Customer: <name>` header (not a secret; just selects config).

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
   AGENTS_API_KEY=...        # shared client X-API-Key (optional; empty disables auth)
   MCP_GATEWAY_TOKEN=...      # bare MCP gateway bearer token (matches mcp/nginx.conf)
   ```

3. **Build & start:**

   ```bash
   cd agents && docker compose --env-file ../.env up -d --build
   docker compose logs -f
   ```

> Host-level setup — UFW port, DNS, and the Nginx Proxy Manager host — follows
> the standard homelab conventions documented in the root `CLAUDE.md`.

## Smoke test

```bash
curl http://192.168.0.100:8723/health          # liveness
curl http://192.168.0.100:8723/customers        # configured customers

# chat as a customer:
curl -X POST http://192.168.0.100:8723/chat \
  -H "X-API-Key: $AGENTS_API_KEY" \
  -H "X-Customer: maximus" \
  -H "Content-Type: application/json" \
  -d '{"message":"hi","chatId":"demo-1"}'
```

## Rebuilding / reloading

```bash
# code or dependency change → rebuild:
cd agents && docker compose --env-file ../.env up -d --build

# customer config / skills registry change → restart (mounted read-only, no rebuild):
cd agents && docker compose --env-file ../.env restart
```
