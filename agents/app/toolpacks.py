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

Packs available
---------------
maximus — read-only wrapper over the "Interface MaximUS" financial API
(apimax.picodix.com). Surfaces accounts, advisors, virtual groups, holdings, and
ETL job status. No write/upload tools are exposed (deliberately — see README).

Config (env)
------------
MAXIMUS_BASE_URL   Base URL (default https://apimax.picodix.com).
MAXIMUS_API_TOKEN  Sent verbatim as the `Authorization` header. Include a
                   "Bearer " prefix in the value if the deployment needs one;
                   the MaximUS spec documents a raw token, so the default
                   expectation is the bare token.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Callable

import httpx

logger = logging.getLogger("agents.toolpacks")

# Handler contract: receives the parsed `tool_use.input` dict, returns a string
# (typically JSON) that becomes the tool_result content. Raise to signal an
# error — the chat loop converts it into an is_error tool_result.
Handler = Callable[[dict], str]


@dataclass(frozen=True)
class Tool:
    """An Anthropic tool definition paired with its client-side handler."""

    name: str
    description: str
    input_schema: dict
    handler: Handler

    def definition(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


# --- maximus ---------------------------------------------------------------

MAXIMUS_BASE_URL = os.environ.get("MAXIMUS_BASE_URL", "https://apimax.picodix.com").rstrip("/")
MAXIMUS_TIMEOUT = float(os.environ.get("MAXIMUS_TIMEOUT", "30"))

# YYYYMM month strings appear in several schemas; describe the format once.
_MONTH_DESC = "Period as a 6-digit YYYYMM string, e.g. 202406 for June 2024."


def _maximus_get(path: str, params: dict | None = None) -> str:
    """GET a MaximUS endpoint and return the response body as a string.

    Auth is read per-call from the environment so a token rotated in `.env`
    takes effect on the next container start without code changes.
    """
    token = os.environ.get("MAXIMUS_API_TOKEN", "")
    if not token:
        raise RuntimeError(
            "MAXIMUS_API_TOKEN is not set; the maximus tool pack cannot authenticate."
        )
    # Drop unset optional params so we don't send empty query values.
    clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    url = f"{MAXIMUS_BASE_URL}{path}"
    resp = httpx.get(
        url,
        params=clean,
        headers={"Authorization": token, "Accept": "application/json"},
        timeout=MAXIMUS_TIMEOUT,
    )
    if resp.status_code >= 400:
        # Surface the status + body so Claude can explain/recover rather than
        # silently failing.
        raise RuntimeError(f"MaximUS {path} returned HTTP {resp.status_code}: {resp.text[:1000]}")
    # Pretty-print JSON when possible; otherwise hand back the raw text.
    try:
        return json.dumps(resp.json(), ensure_ascii=False)
    except ValueError:
        return resp.text


def _h_list_accounts(inp: dict) -> str:
    return _maximus_get("/entities/accounts", {"ipcode": inp.get("ipcode")})


def _h_list_advisors(inp: dict) -> str:
    return _maximus_get("/entities/advisors")


def _h_list_virtual_groups(inp: dict) -> str:
    return _maximus_get("/entities/vgroups")


def _h_get_etl_status(inp: dict) -> str:
    guid = inp["guid"]
    return _maximus_get(f"/etl/etl/{guid}")


def _h_get_holdings_detail(inp: dict) -> str:
    return _maximus_get(
        "/holdings/detail",
        {"account": inp["account"], "pmonth": inp["pmonth"]},
    )


def _h_get_holdings_summary(inp: dict) -> str:
    return _maximus_get(
        "/holdings/summary",
        {"account": inp["account"], "mfrom": inp["mfrom"], "mto": inp["mto"]},
    )


MAXIMUS_TOOLS: list[Tool] = [
    Tool(
        name="maximus_list_accounts",
        description=(
            "List portfolio accounts from the MaximUS system. Optionally filter "
            "to a single advisor by their advisor code (ipcode). Call this to "
            "discover account identifiers before querying holdings."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "ipcode": {
                    "type": "string",
                    "description": "Advisor code to filter by. Omit to list all accounts.",
                }
            },
            "required": [],
        },
        handler=_h_list_accounts,
    ),
    Tool(
        name="maximus_list_advisors",
        description="List all advisors registered in the MaximUS system, including their codes and names.",
        input_schema={"type": "object", "properties": {}, "required": []},
        handler=_h_list_advisors,
    ),
    Tool(
        name="maximus_list_virtual_groups",
        description=(
            "List virtual groups (vgroups) in the MaximUS system — user-defined "
            "groupings of accounts used for aggregated reporting."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
        handler=_h_list_virtual_groups,
    ),
    Tool(
        name="maximus_get_etl_status",
        description=(
            "Check the status of a MaximUS ETL job (the pipeline that ingests "
            "uploaded statement PDFs), identified by the process GUID returned "
            "when the PDFs were uploaded."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "guid": {
                    "type": "string",
                    "description": "The process GUID returned by the PDF upload endpoint.",
                }
            },
            "required": ["guid"],
        },
        handler=_h_get_etl_status,
    ),
    Tool(
        name="maximus_get_holdings_detail",
        description=(
            "Get the detailed holdings of a single account for one month — the "
            "position-by-position breakdown. Use maximus_list_accounts first to "
            "find the account identifier."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Account identifier."},
                "pmonth": {"type": "string", "description": _MONTH_DESC},
            },
            "required": ["account", "pmonth"],
        },
        handler=_h_get_holdings_detail,
    ),
    Tool(
        name="maximus_get_holdings_summary",
        description=(
            "Get a summarized holdings view for a single account across a range "
            "of months (mfrom..mto inclusive) — useful for trends over time. Use "
            "maximus_list_accounts first to find the account identifier."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "account": {"type": "string", "description": "Account identifier."},
                "mfrom": {"type": "string", "description": "Start month. " + _MONTH_DESC},
                "mto": {"type": "string", "description": "End month. " + _MONTH_DESC},
            },
            "required": ["account", "mfrom", "mto"],
        },
        handler=_h_get_holdings_summary,
    ),
]


# --- registry --------------------------------------------------------------

TOOLPACKS: dict[str, list[Tool]] = {
    "maximus": MAXIMUS_TOOLS,
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
