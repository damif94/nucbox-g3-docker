# MCP Gateway

A single nginx router (`mcp-router`) on port 4781 that proxies to a modular FastMCP backend (`mcp-server`) over a shared Docker network. The backend speaks the [streamable-http MCP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

## Architecture

```
Claude (client)
    │  HTTPS  Bearer token
    ▼
mcp.damianferencz.org:443  (NPM)
    │
    ▼
mcp-router:4781  (nginx)
    ├── /<name>     → mcp-server:3000/<name>   (one route per MCP)
    └── /health     → 200 OK (no auth)

mcp-server:3000  (single Python process)
    ├── /n8n        ← FastMCP "n8n"
    └── /wikipedia  ← FastMCP "wikipedia"
```

Tools are split into modules under `mcp-server/mcps/`. Each module owns one integration and exposes a `register(mcp)` function. `server.py` creates one `FastMCP` instance per module, mounts them all in a parent Starlette app, and runs a single uvicorn process.

### Layout

```
mcp/
├── docker-compose.yml
├── nginx.conf
└── mcp-server/
    ├── Dockerfile
    ├── requirements.txt
    ├── server.py          ← entrypoint: mounts all sub-apps, wires lifespans
    └── mcps/
        ├── __init__.py
        ├── n8n.py         ← register(mcp): n8n automation tools
        └── wikipedia.py   ← register(mcp): Wikipedia search tools
```

---

## Adding a new MCP

### 1. Create `mcp-server/mcps/<name>.py`

```python
from fastmcp import FastMCP

def register(mcp: FastMCP) -> None:

    @mcp.tool()
    async def my_tool(param: str) -> dict:
        """One-line description shown to the LLM."""
        ...
```

### 2. Update `mcp-server/server.py`

```python
from mcps import n8n, wikipedia, mymodule   # ← add import

# create instance
mymodule_mcp = FastMCP("mymodule")
mymodule_app = mymodule_mcp.http_app(path="/", transport="streamable-http")
mymodule.register(mymodule_mcp)

# wire lifespan
@asynccontextmanager
async def lifespan(app):
    async with n8n_app.lifespan(app):
        async with wikipedia_app.lifespan(app):
            async with mymodule_app.lifespan(app):  # ← add
                yield

# add mount
app = Starlette(routes=[
    ...
    Mount("/mymodule", app=mymodule_app),           # ← add
])
```

### 3. Add a route to `nginx.conf`

```nginx
location = /mymodule {
  if ($mcp_auth_ok = 0) {
    return 401 '{"error":"Unauthorized"}';
  }
  proxy_pass         http://mcp-server:3000/mymodule/;
  proxy_http_version 1.1;
  proxy_set_header   Host $host;
  proxy_set_header   X-Real-IP $remote_addr;
  proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header   X-Forwarded-Proto $scheme;
  proxy_buffering    off;
  proxy_read_timeout 300s;
}
```

### 4. Deploy

```bash
cd /home/damian/nucbox-g3-docker/mcp
docker compose --env-file ../.env up -d --build
docker restart mcp-router
```

### 5. Verify

```bash
curl -s -X POST http://192.168.0.100:4781/mymodule \
  -H "Authorization: Bearer DPeEexgHjIdpSk2usqzdMPJn2i4+ONjVFQeRHmxywvw=" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Expected: {"error":{"message":"Bad Request: Missing session ID",...}}
# A 404 means the route wasn't picked up — check nginx.conf and restart mcp-router.
```

### 6. Register in Claude Code

```bash
claude mcp add --transport http mymodule https://mcp.damianferencz.org/mymodule \
  --header "Authorization: Bearer DPeEexgHjIdpSk2usqzdMPJn2i4+ONjVFQeRHmxywvw="
```

### 7. Update CLAUDE.md

Add the service to the services table in `../.claude/CLAUDE.md`.

---

## Auth tokens

All tokens are listed in `nginx.conf` under the `map $http_authorization $mcp_auth_ok` block. To add a new client:

```nginx
"Bearer <new-token>" 1;
```

Then reload: `docker restart mcp-router`.

---

## Current routes

| Path | Description |
|------|-------------|
| `/n8n` | n8n automation tools |
| `/wikipedia` | Wikipedia search tools |
| `/health` | Health check — no auth required |
