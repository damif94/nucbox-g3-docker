"""
agents.damianferencz.org — multi-customer AI agent host.

A FastAPI service that proxies /chat to Claude (Opus 4.8) via the `anthropic`
SDK. Each request selects a *customer* via the `X-Customer` header; the customer's
config (system prompt, server tools, MCP access, skills) is loaded from
YAML under CUSTOMERS_DIR. Missing/unknown customer falls back to `default`.

Provider auth: ANTHROPIC_API_KEY (read from env by the SDK).
Client auth: optional shared X-API-Key (AGENTS_API_KEY).

/chat accepts a text message plus optional base64 image and document (PDF)
attachments. Pass a `chatId` to remember the last few turns (in memory,
namespaced per customer; cleared on restart).

Interactive API docs (Swagger UI) at /docs; ReDoc at /redoc; OpenAPI at
/openapi.json. The server listens on $PORT (8723 on the host).
"""

import json
import logging
import os
import secrets
from pathlib import Path
from typing import Literal

import yaml
from fastapi import Depends, FastAPI, Header, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from toolpacks import Handler, load_toolpacks

logger = logging.getLogger("agents")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="agents",
    summary="Multi-customer AI agent host backed by Claude.",
    description=(
        "POST text — plus optional base64 image/PDF attachments — to `/chat`. "
        "Select a customer with the `X-Customer` header (falls back to `default`); "
        "each customer has its own system prompt, server tools, MCP access, and "
        "skills.\n\nSet `ANTHROPIC_API_KEY` in the environment to enable `/chat`."
    ),
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "meta", "description": "Service metadata and health."},
        {"name": "chat", "description": "Talk to the agent."},
    ],
)

# Opus 4.8 is the current most-capable model; override per request/customer.
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")
HAS_KEY = bool(os.environ.get("ANTHROPIC_API_KEY"))

# Client auth: if AGENTS_API_KEY is set, /chat requires a matching X-API-Key
# header. Left empty (e.g. local dev), auth is disabled.
AGENTS_API_KEY = os.environ.get("AGENTS_API_KEY", "")

# Per-customer config + MCP gateway.
CUSTOMERS_DIR = Path(os.environ.get("CUSTOMERS_DIR", "/config/customers"))
SKILLS_REGISTRY = Path(os.environ.get("SKILLS_REGISTRY", "/skills/registry.json"))
MCP_BASE_URL = os.environ.get("MCP_BASE_URL", "https://mcp.damianferencz.org").rstrip("/")
MCP_GATEWAY_TOKEN = os.environ.get("MCP_GATEWAY_TOKEN", "")

# Conversation memory: in-memory dict keyed by "<customer>:<chatId>". We keep the
# last MAX_TURNS user/assistant pairs. Wiped on restart/rebuild.
MAX_TURNS = 5
CONVERSATIONS: dict[str, list[dict]] = {}

# Server-tool types that require a beta header (everything else is GA).
TOOL_BETAS = {"code_execution_20250825": "code-execution-2025-08-25"}


def _tool_name(tool_type: str) -> str:
    """Canonical tool name from a dated type, e.g. `web_fetch_20250910` -> `web_fetch`."""
    head, _, tail = tool_type.rpartition("_")
    return head if tail.isdigit() else tool_type

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str | None = Security(api_key_header)):
    if not AGENTS_API_KEY:
        return  # auth disabled
    if not key or not secrets.compare_digest(key, AGENTS_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


# --- Customer config -------------------------------------------------------


class SkillRef(BaseModel):
    type: Literal["anthropic", "custom"]
    id: str | None = None      # prebuilt (anthropic) skill_id, e.g. "pdf"
    name: str | None = None    # custom skill friendly name (registry key)
    version: str | None = None


class CustomerConfig(BaseModel):
    name: str
    system: str = "You are a helpful assistant."
    model: str | None = None
    tools: list[str] = Field(default_factory=list)
    mcp: list[str] = Field(default_factory=list)
    skills: list[SkillRef] = Field(default_factory=list)
    # Hand-written client-side tool packs (see app/toolpacks.py), e.g. ["maximus"].
    toolpacks: list[str] = Field(default_factory=list)


def _load_customers() -> dict[str, CustomerConfig]:
    out: dict[str, CustomerConfig] = {}
    if CUSTOMERS_DIR.is_dir():
        for path in sorted(CUSTOMERS_DIR.glob("*.yaml")):
            try:
                data = yaml.safe_load(path.read_text()) or {}
                cfg = CustomerConfig(**data)
                out[cfg.name] = cfg
            except Exception as exc:  # malformed config shouldn't take down the service
                logger.warning("Skipping bad customer config %s: %s", path, exc)
    if "default" not in out:
        logger.warning("No 'default' customer config found; using a built-in default.")
        out["default"] = CustomerConfig(name="default")
    return out


def _load_registry() -> dict[str, dict]:
    try:
        return json.loads(SKILLS_REGISTRY.read_text())
    except (FileNotFoundError, ValueError):
        return {}


CUSTOMERS = _load_customers()
SKILL_REGISTRY = _load_registry()
logger.info("Loaded customers: %s", ", ".join(sorted(CUSTOMERS)))


def _resolve_customer(name: str | None) -> CustomerConfig:
    return CUSTOMERS.get(name or "default") or CUSTOMERS["default"]


def _resolve_skills(cfg: CustomerConfig) -> list[dict]:
    """Map a customer's skill refs to container.skills entries (registry lookup for custom)."""
    entries: list[dict] = []
    for s in cfg.skills:
        if s.type == "anthropic":
            if not s.id:
                logger.warning("[%s] anthropic skill missing 'id'; skipping", cfg.name)
                continue
            entry = {"type": "anthropic", "skill_id": s.id}
            if s.version:
                entry["version"] = s.version
            entries.append(entry)
        else:  # custom
            reg = SKILL_REGISTRY.get(s.name or "")
            if not reg:
                logger.warning(
                    "[%s] custom skill '%s' not in registry; skipping", cfg.name, s.name
                )
                continue
            entries.append(
                {
                    "type": "custom",
                    "skill_id": reg["skill_id"],
                    "version": s.version or reg.get("version", "latest"),
                }
            )
    return entries


def _build_request_kwargs(cfg: CustomerConfig) -> tuple[dict, list[str], dict[str, Handler]]:
    """Assemble tools/mcp_servers/container + beta headers from customer config.

    `cfg.tools` holds explicit Anthropic tool *types* (e.g. `web_fetch_20250910`,
    `code_execution_20250825`) — the caller chooses compatible variants in YAML;
    we pass them through and only derive the canonical name and any beta headers.

    `cfg.toolpacks` names hand-written client-side packs (see app/toolpacks.py);
    their tool *definitions* are added to `tools` and their handlers returned so
    the chat loop can execute the resulting `tool_use` calls here.
    """
    tools: list[dict] = [{"type": t, "name": _tool_name(t)} for t in cfg.tools]
    betas: set[str] = {TOOL_BETAS[t] for t in cfg.tools if t in TOOL_BETAS}
    extra: dict = {"system": cfg.system}

    pack_defs, handlers = load_toolpacks(cfg.toolpacks)
    tools += pack_defs

    skill_entries = _resolve_skills(cfg)
    if skill_entries:
        extra["container"] = {"skills": skill_entries}
        # Skills run through code execution; the customer must also list
        # `code_execution_20250825` in `tools` (see config docs).
        betas.update({"skills-2025-10-02", "code-execution-2025-08-25"})

    mcp_servers = [
        {
            "type": "url",
            "name": n,
            "url": f"{MCP_BASE_URL}/{n}",
            "authorization_token": MCP_GATEWAY_TOKEN,
        }
        for n in cfg.mcp
    ]
    if mcp_servers:
        extra["mcp_servers"] = mcp_servers
        tools += [{"type": "mcp_toolset", "mcp_server_name": n} for n in cfg.mcp]
        betas.add("mcp-client-2025-11-20")

    if tools:
        extra["tools"] = tools
    return extra, sorted(betas), handlers


# The client is created lazily so the service still boots (and /health works)
# even before a key is configured.
_client = None


def get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


# Upper bound on agent steps: each server-tool `pause_turn` continuation and each
# client-side tool round trips through here. Caps runaway loops.
MAX_AGENT_STEPS = 12


def _run(
    model: str,
    messages: list[dict],
    extra: dict,
    betas: list[str],
    handlers: dict[str, Handler] | None = None,
):
    """Call Claude, resolving `pause_turn` and client-side `tool_use` (capped).

    `pause_turn` is a server-tool continuation (re-send to resume). `tool_use`
    means Claude wants a client-side tool from a tool pack — we run the handler
    and feed the result back. Both loop until Claude ends its turn or we hit
    MAX_AGENT_STEPS.
    """
    client = get_client()
    common = dict(model=model, max_tokens=16000, thinking={"type": "adaptive"}, **extra)
    msgs = list(messages)
    resp = None
    for _ in range(MAX_AGENT_STEPS):
        if betas:
            resp = client.beta.messages.create(messages=msgs, betas=betas, **common)
        else:
            resp = client.messages.create(messages=msgs, **common)

        if resp.stop_reason == "pause_turn":
            # Server tool hit its iteration limit — append and re-send to continue.
            msgs = msgs + [{"role": "assistant", "content": resp.content}]
            continue

        if resp.stop_reason == "tool_use" and handlers:
            results = _run_client_tools(resp, handlers)
            msgs = msgs + [
                {"role": "assistant", "content": resp.content},
                {"role": "user", "content": results},
            ]
            continue

        return resp
    return resp


def _run_client_tools(resp, handlers: dict[str, Handler]) -> list[dict]:
    """Execute every `tool_use` block in a response, returning tool_result blocks.

    Each `tool_use` id must get exactly one result or the next request 400s, so
    unknown tools and handler exceptions both produce an is_error result.
    """
    results: list[dict] = []
    for block in resp.content:
        if block.type != "tool_use":
            continue
        handler = handlers.get(block.name)
        if handler is None:
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Unknown tool: {block.name}",
                    "is_error": True,
                }
            )
            continue
        try:
            content = handler(block.input)
            results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": content}
            )
        except Exception as exc:  # tool failures shouldn't crash the chat
            logger.warning("Tool '%s' failed: %s", block.name, exc)
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Error: {exc}",
                    "is_error": True,
                }
            )
    return results


# --- Schemas ---------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    llm_configured: bool


class RootResponse(BaseModel):
    service: str = "agents"
    docs: str = "/docs"
    health: str = "/health"


class CustomersResponse(BaseModel):
    customers: list[str]


class Attachment(BaseModel):
    """A base64-encoded image or document (e.g. a PDF) sent alongside the text."""

    kind: Literal["image", "document"] = Field(description="`image` or `document`.")
    media_type: str = Field(
        description=(
            "MIME type. Images: image/png, image/jpeg, image/gif, image/webp. "
            "Documents: application/pdf or text/plain."
        ),
        examples=["image/png"],
    )
    data: str = Field(description="Base64-encoded bytes, no newlines.")


class ChatRequest(BaseModel):
    message: str = Field(description="The user's text prompt.")
    model: str | None = Field(
        default=None,
        description=f"Claude model ID. Overrides the customer/default ({DEFAULT_MODEL}).",
    )
    chatId: str | None = Field(
        default=None,
        description=(
            f"Conversation ID. When set, the last {MAX_TURNS} user/assistant turns "
            "are remembered (per customer); omit for a stateless one-off."
        ),
    )
    attachments: list[Attachment] = Field(
        default_factory=list,
        description="Optional images and documents to send with the message.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"message": "Explain quantum computing in two sentences.", "chatId": "demo-1"}
            ]
        }
    }


class ChatResponse(BaseModel):
    reply: str | None = None
    customer: str | None = None
    error: str | None = None


# --- Routes ----------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["meta"], summary="Liveness check")
def health():
    return HealthResponse(status="ok", llm_configured=HAS_KEY)


@app.get("/", response_model=RootResponse, tags=["meta"], summary="Service info")
def root():
    return RootResponse()


@app.get(
    "/customers",
    response_model=CustomersResponse,
    tags=["meta"],
    summary="List configured customer names",
)
def customers():
    return CustomersResponse(customers=sorted(CUSTOMERS))


def _build_content(req: ChatRequest) -> list[dict]:
    # Attachments go before the text block (Anthropic's recommended ordering).
    blocks: list[dict] = []
    for att in req.attachments:
        block_type = "image" if att.kind == "image" else "document"
        blocks.append(
            {
                "type": block_type,
                "source": {
                    "type": "base64",
                    "media_type": att.media_type,
                    "data": att.data,
                },
            }
        )
    blocks.append({"type": "text", "text": req.message})
    return blocks


@app.post(
    "/chat",
    response_model=ChatResponse,
    tags=["chat"],
    summary="Send a message (with optional attachments) to a customer's agent",
    dependencies=[Depends(require_api_key)],
)
def chat(
    req: ChatRequest,
    x_customer: str | None = Header(default=None, alias="X-Customer"),
):
    if not HAS_KEY:
        return ChatResponse(error="ANTHROPIC_API_KEY is not set; configure it in .env")

    cfg = _resolve_customer(x_customer)
    extra, betas, handlers = _build_request_kwargs(cfg)
    model = req.model or cfg.model or DEFAULT_MODEL

    mem_key = f"{cfg.name}:{req.chatId}" if req.chatId else None
    history = CONVERSATIONS.get(mem_key, []) if mem_key else []
    messages = history + [{"role": "user", "content": _build_content(req)}]

    try:
        resp = _run(model, messages, extra, betas, handlers)
    except Exception as exc:
        logger.exception("[%s] chat failed", cfg.name)
        return ChatResponse(customer=cfg.name, error=str(exc))

    reply = "".join(block.text for block in resp.content if block.type == "text")

    if mem_key:
        updated = history + [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": reply},
        ]
        CONVERSATIONS[mem_key] = updated[-(MAX_TURNS * 2):]

    return ChatResponse(reply=reply, customer=cfg.name)
