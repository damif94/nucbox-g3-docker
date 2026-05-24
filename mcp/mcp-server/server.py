import os
import uvicorn
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.routing import Mount
from fastmcp import FastMCP
from mcps import n8n, wikipedia

PORT = int(os.environ.get("PORT", "3000"))
HOST = os.environ.get("HOST", "0.0.0.0")

n8n_mcp = FastMCP("n8n")
wikipedia_mcp = FastMCP("wikipedia")

n8n.register(n8n_mcp)
wikipedia.register(wikipedia_mcp)

n8n_app = n8n_mcp.http_app(path="/", transport="streamable-http")
wikipedia_app = wikipedia_mcp.http_app(path="/", transport="streamable-http")


@asynccontextmanager
async def lifespan(app):
    async with n8n_app.lifespan(app):
        async with wikipedia_app.lifespan(app):
            yield


app = Starlette(
    routes=[
        Mount("/n8n", app=n8n_app),
        Mount("/wikipedia", app=wikipedia_app),
    ],
    lifespan=lifespan,
)

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
