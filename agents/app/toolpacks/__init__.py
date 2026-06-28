"""Hand-written, non-generic tool packs executed *client-side* in /chat.

Unlike server-side tools (`web_fetch`, `code_execution`) and MCP — which Claude
runs on Anthropic's side — these tools run here. When Claude emits a `tool_use`
block for one, the chat loop calls the matching Python handler, posts the result
back as a `tool_result`, and lets Claude continue. A pack is engaged only for
customers that list it in their `toolpacks:` config.

Each tool is spelled out explicitly: name, description, JSON-Schema inputs, and a
handler. No spec-driven generation — that keeps the surface curated (good tool
descriptions, an allowlist by construction) at the cost of a few lines per
endpoint.

Layout
------
base.py       generic primitives (Tool, Handler) — customer-agnostic
<pack>.py     one module per pack, exposing a module-level `TOOLS: list[Tool]`
__init__.py   the registry below wires pack names to their modules

To add a pack: create `app/toolpacks/<name>.py` with a `TOOLS` list and register
it in TOOLPACKS.

Packs available
---------------
maximus — read-only wrapper over the "Interface MaximUS" financial API. See
`maximus.py` for the endpoint coverage and its env config.
"""

from __future__ import annotations

import logging

from . import maximus
from .base import Handler, Tool

logger = logging.getLogger("agents.toolpacks")

__all__ = ["Handler", "Tool", "TOOLPACKS", "load_toolpacks"]


# --- registry --------------------------------------------------------------

TOOLPACKS: dict[str, list[Tool]] = {
    "maximus": maximus.TOOLS,
}


def load_toolpacks(names: list[str]) -> tuple[list[dict], dict[str, Handler]]:
    """Resolve pack names to (tool definitions, name→handler map).

    Unknown pack names are logged and skipped so one bad config entry doesn't
    take down the customer's chat.
    """
    definitions: list[dict] = []
    handlers: dict[str, Handler] = {}
    for name in names:
        pack = TOOLPACKS.get(name)
        if pack is None:
            logger.warning("Unknown tool pack '%s'; skipping", name)
            continue
        for tool in pack:
            definitions.append(tool.definition())
            handlers[tool.name] = tool.handler
    return definitions, handlers
