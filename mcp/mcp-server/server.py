import os
import uvicorn
from contextlib import asynccontextmanager, AsyncExitStack
from starlette.applications import Starlette
from starlette.routing import Mount
from fastmcp import FastMCP
from mcps import n8n, wikipedia, google_drive

PORT = int(os.environ.get("PORT", "3000"))
HOST = os.environ.get("HOST", "0.0.0.0")

# ── Static MCPs ───────────────────────────────────────────────────────────────

n8n_mcp = FastMCP("n8n")
wikipedia_mcp = FastMCP("wikipedia")

n8n.register(n8n_mcp)
wikipedia.register(wikipedia_mcp)

n8n_app = n8n_mcp.http_app(path="/", transport="streamable-http")
wikipedia_app = wikipedia_mcp.http_app(path="/", transport="streamable-http")

# ── Google Drive — one instance per account ───────────────────────────────────

GOOGLE_CREDS_DIR = os.environ.get("GOOGLE_CREDS_DIR", "/run/secrets/google")
_accounts = [a.strip() for a in os.environ.get("GOOGLE_ACCOUNTS", "").split(",") if a.strip()]

google_apps: dict = {}
for _name in _accounts:
    _token_path = os.path.join(GOOGLE_CREDS_DIR, _name, "token.json")
    _mcp = FastMCP(f"google-{_name}")
    google_drive.register(_mcp, _token_path)
    google_apps[_name] = _mcp.http_app(path="/", transport="streamable-http")

# ── App ───────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app):
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(n8n_app.lifespan(app))
        await stack.enter_async_context(wikipedia_app.lifespan(app))
        for ga in google_apps.values():
            await stack.enter_async_context(ga.lifespan(app))
        yield


app = Starlette(
    routes=[
        Mount("/n8n", app=n8n_app),
        Mount("/wikipedia", app=wikipedia_app),
        *[Mount(f"/google-{name}", app=ga) for name, ga in google_apps.items()],
    ],
    lifespan=lifespan,
)

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
