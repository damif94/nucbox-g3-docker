"""
agents.damianferencz.org — AI agent host.

This is a minimal, runnable placeholder. Replace the agent logic below with
your real application; the surrounding compose/proxy plumbing stays the same.

Provider: Claude via the official `anthropic` SDK. Set ANTHROPIC_API_KEY in the
project .env to enable the /chat endpoint — the SDK reads it from the
environment automatically.

/chat accepts a text message plus optional base64 image and document (PDF)
attachments — all natively supported by the Messages API. Pass a `chatId` to
remember the last few turns of a conversation (kept in memory; cleared on
restart); omit it for a stateless one-off.
The server listens on $PORT (8723 on the host).

Interactive API docs (Swagger UI) are served at /docs; ReDoc at /redoc; the
raw OpenAPI schema at /openapi.json.
"""

import os
import secrets
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

app = FastAPI(
    title="agents",
    summary="Custom AI agent host backed by Claude.",
    description=(
        "Minimal multimodal chat service. POST text — plus optional base64 "
        "image and PDF/document attachments — to `/chat` and get a Claude reply.\n\n"
        "Set `ANTHROPIC_API_KEY` in the environment to enable `/chat`."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "meta", "description": "Service metadata and health."},
        {"name": "chat", "description": "Talk to the agent."},
    ],
)

# Opus 4.8 is the current most-capable model; override per request if needed.
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")
HAS_KEY = bool(os.environ.get("ANTHROPIC_API_KEY"))

# Client auth: if AGENTS_API_KEY is set, /chat requires a matching X-API-Key
# header. Left empty (e.g. local dev), auth is disabled.
AGENTS_API_KEY = os.environ.get("AGENTS_API_KEY", "")

# Declared as a security scheme so it surfaces in /openapi.json and Swagger's
# "Authorize" button. auto_error=False lets us allow requests when auth is off.
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str | None = Security(api_key_header)):
    if not AGENTS_API_KEY:
        return  # auth disabled
    if not key or not secrets.compare_digest(key, AGENTS_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")

# Conversation memory: in-memory dict keyed by chatId. We keep the last
# MAX_TURNS user/assistant pairs (so MAX_TURNS inputs + MAX_TURNS outputs).
# Note: this is wiped whenever the container restarts or is rebuilt.
MAX_TURNS = 5
CONVERSATIONS: dict[str, list[dict]] = {}

# The client is created lazily so the service still boots (and /health works)
# even before a key is configured.
_client = None


def get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


# --- Schemas ---------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    llm_configured: bool


class RootResponse(BaseModel):
    service: str = "agents"
    docs: str = "/docs"
    health: str = "/health"


class Attachment(BaseModel):
    """A base64-encoded image or document (e.g. a PDF) sent alongside the text."""

    kind: Literal["image", "document"] = Field(
        description="`image` or `document`.",
    )
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
        description=f"Claude model ID. Defaults to {DEFAULT_MODEL}.",
    )
    chatId: str | None = Field(
        default=None,
        description=(
            f"Conversation ID. When set, the last {MAX_TURNS} user/assistant "
            "turns are remembered and replayed; omit for a stateless one-off."
        ),
    )
    attachments: list[Attachment] = Field(
        default_factory=list,
        description="Optional images and documents to send with the message.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "message": "Explain quantum computing in two sentences.",
                    "chatId": "demo-1",
                    "attachments": [],
                }
            ]
        }
    }


class ChatResponse(BaseModel):
    reply: str | None = None
    error: str | None = None


# --- Routes ----------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["meta"], summary="Liveness check")
def health():
    return HealthResponse(status="ok", llm_configured=HAS_KEY)


@app.get("/", response_model=RootResponse, tags=["meta"], summary="Service info")
def root():
    return RootResponse()


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
    summary="Send a message (with optional attachments) to Claude",
    dependencies=[Depends(require_api_key)],
)
def chat(req: ChatRequest):
    if not HAS_KEY:
        return ChatResponse(error="ANTHROPIC_API_KEY is not set; configure it in .env")

    # Replay remembered turns (text-only), then the current turn with attachments.
    history = CONVERSATIONS.get(req.chatId, []) if req.chatId else []
    messages = history + [{"role": "user", "content": _build_content(req)}]

    response = get_client().messages.create(
        model=req.model or DEFAULT_MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        messages=messages,
    )
    reply = "".join(block.text for block in response.content if block.type == "text")

    if req.chatId:
        # Store text-only turns, trimmed to the last MAX_TURNS pairs.
        updated = history + [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": reply},
        ]
        CONVERSATIONS[req.chatId] = updated[-(MAX_TURNS * 2):]

    return ChatResponse(reply=reply)
