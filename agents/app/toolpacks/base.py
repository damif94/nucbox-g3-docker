"""Generic primitives shared by every tool pack.

Nothing customer-specific lives here — just the contract a pack must satisfy so
the chat loop can advertise its tools to Claude and dispatch `tool_use` blocks
back to Python handlers.
"""

from __future__ import annotations

import typing as t
from dataclasses import dataclass

# Handler contract: receives the parsed `tool_use.input` dict, returns a string
# (typically JSON) that becomes the tool_result content. Raise to signal an
# error — the chat loop converts it into an is_error tool_result.
Handler = t.Callable[[dict], str]


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
