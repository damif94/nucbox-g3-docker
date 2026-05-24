import httpx
from fastmcp import FastMCP

_REST_BASE = "https://en.wikipedia.org/api/rest_v1"
_ACTION_URL = "https://en.wikipedia.org/w/api.php"


def register(mcp: FastMCP) -> None:

    def client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={"User-Agent": "homelab-mcp/1.0 (homelab)"},
            timeout=15.0,
        )

    @mcp.tool()
    async def search_wikipedia(query: str, limit: int = 5) -> list:
        """Search Wikipedia for articles matching the query. Returns titles, snippets, and page IDs."""
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": limit,
            "format": "json",
            "utf8": 1,
        }
        async with client() as c:
            r = await c.get(_ACTION_URL, params=params)
            r.raise_for_status()
            return r.json()["query"]["search"]

    @mcp.tool()
    async def get_article_summary(title: str) -> dict:
        """
        Get a Wikipedia article's summary — intro paragraph, short description, and thumbnail URL.
        Use the exact article title (e.g. "Python (programming language)").
        """
        async with client() as c:
            r = await c.get(f"{_REST_BASE}/page/summary/{title}")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def get_article_text(title: str, intro_only: bool = False) -> dict:
        """
        Get plain-text content of a Wikipedia article.
        Set intro_only=True for just the lead section (faster, shorter).
        Full articles can be long — prefer intro_only unless detail is needed.
        """
        params: dict = {
            "action": "query",
            "prop": "extracts",
            "titles": title,
            "explaintext": 1,
            "format": "json",
        }
        if intro_only:
            params["exintro"] = 1
        async with client() as c:
            r = await c.get(_ACTION_URL, params=params)
            r.raise_for_status()
            pages = r.json()["query"]["pages"]
            page = next(iter(pages.values()))
            return {"title": page.get("title"), "extract": page.get("extract", "")}

    @mcp.tool()
    async def get_article_sections(title: str) -> list:
        """Get the table of contents (section list with indices and titles) for a Wikipedia article."""
        params = {
            "action": "parse",
            "page": title,
            "prop": "sections",
            "format": "json",
        }
        async with client() as c:
            r = await c.get(_ACTION_URL, params=params)
            r.raise_for_status()
            return r.json().get("parse", {}).get("sections", [])
