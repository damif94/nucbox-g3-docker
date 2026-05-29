import os
import httpx
from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:
    n8n_url = os.environ["N8N_API_URL"].rstrip("/")
    n8n_key = os.environ["N8N_API_KEY"]

    def client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=n8n_url,
            headers={"X-N8N-API-KEY": n8n_key},
            timeout=30.0,
        )

    # ── Workflows ─────────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_workflows(
        active: bool | None = None,
        name: str | None = None,
        tags: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> dict:
        """List workflows. Filter by active status, name substring, or comma-separated tag names."""
        params: dict = {"limit": limit, "excludePinnedData": "true"}
        if active is not None:
            params["active"] = str(active).lower()
        if name:
            params["name"] = name
        if tags:
            params["tags"] = tags
        if cursor:
            params["cursor"] = cursor
        async with client() as c:
            r = await c.get("/workflows", params=params)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def get_workflow(workflow_id: str) -> dict:
        """Get a workflow by ID with its full node and connection structure."""
        async with client() as c:
            r = await c.get(f"/workflows/{workflow_id}")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def create_workflow(
        name: str,
        nodes: list,
        connections: dict,
        settings: dict | None = None,
        tag_ids: list[str] | None = None,
    ) -> dict:
        """Create a new workflow. Provide nodes array, connections map, and optional settings."""
        body: dict = {
            "name": name,
            "nodes": nodes,
            "connections": connections,
            "settings": settings or {},
        }
        if tag_ids:
            body["tags"] = [{"id": t} for t in tag_ids]
        async with client() as c:
            r = await c.post("/workflows", json=body)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def update_workflow(
        workflow_id: str,
        name: str | None = None,
        nodes: list | None = None,
        connections: dict | None = None,
        settings: dict | None = None,
    ) -> dict:
        """Update a workflow. Only provided fields are changed; all other fields are preserved from the current workflow."""
        _ALLOWED_SETTINGS = {
            "executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution",
            "saveManualExecutions", "saveExecutionProgress", "executionTimeout",
            "timezone", "callerPolicy", "callerIds", "errorWorkflow",
        }
        async with client() as c:
            current = (await c.get(f"/workflows/{workflow_id}")).json()
            merged_settings = settings if settings is not None else current.get("settings", {})
            body = {
                "name": name if name is not None else current["name"],
                "nodes": nodes if nodes is not None else current["nodes"],
                "connections": connections if connections is not None else current["connections"],
                "settings": {k: v for k, v in merged_settings.items() if k in _ALLOWED_SETTINGS},
                "staticData": current.get("staticData"),
                "pinData": current.get("pinData", {}),
            }
            r = await c.put(f"/workflows/{workflow_id}", json=body)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def update_workflow_from_json(workflow_id: str, workflow_json: str) -> dict:
        """
        Update a workflow by passing its full JSON content as a string.
        Use this when you have a workflow file on disk: read it with the Read tool,
        then pass the file contents here — no manual reconstruction needed.
        The workflow_id in the URL takes precedence; id inside the JSON is ignored.
        """
        import json as _json
        _ALLOWED_SETTINGS = {
            "executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution",
            "saveManualExecutions", "saveExecutionProgress", "executionTimeout",
            "timezone", "callerPolicy", "callerIds", "errorWorkflow",
        }
        data = _json.loads(workflow_json)
        body = {
            "name": data["name"],
            "nodes": data["nodes"],
            "connections": data["connections"],
            "settings": {k: v for k, v in data.get("settings", {}).items() if k in _ALLOWED_SETTINGS},
            "staticData": data.get("staticData"),
            "pinData": data.get("pinData", {}),
        }
        async with client() as c:
            r = await c.put(f"/workflows/{workflow_id}", json=body)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def activate_workflow(workflow_id: str) -> dict:
        """Activate a workflow so it responds to triggers."""
        async with client() as c:
            r = await c.post(f"/workflows/{workflow_id}/activate")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def deactivate_workflow(workflow_id: str) -> dict:
        """Deactivate a workflow."""
        async with client() as c:
            r = await c.post(f"/workflows/{workflow_id}/deactivate")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def delete_workflow(workflow_id: str) -> dict:
        """Permanently delete a workflow."""
        async with client() as c:
            r = await c.delete(f"/workflows/{workflow_id}")
            r.raise_for_status()
            return r.json()

    # ── Executions ────────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_executions(
        workflow_id: str | None = None,
        status: str | None = None,
        include_data: bool = False,
        limit: int = 20,
        cursor: str | None = None,
    ) -> dict:
        """
        List executions. Status: canceled | crashed | error | new | running | success | waiting.
        Set include_data=True to get full node output (slow on large executions).
        """
        params: dict = {"limit": limit, "includeData": str(include_data).lower()}
        if workflow_id:
            params["workflowId"] = workflow_id
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        async with client() as c:
            r = await c.get("/executions", params=params)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def get_execution(execution_id: int) -> dict:
        """Get an execution with full node data and error details — useful for debugging failures."""
        async with client() as c:
            r = await c.get(f"/executions/{execution_id}", params={"includeData": "true"})
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def trigger_workflow(workflow_id: str, run_data: dict | None = None) -> dict:
        """Trigger a workflow execution immediately."""
        body: dict = {"workflowId": workflow_id}
        if run_data:
            body["runData"] = run_data
        async with client() as c:
            r = await c.post("/executions", json=body)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def stop_execution(execution_id: int) -> dict:
        """Stop a currently running execution."""
        async with client() as c:
            r = await c.post(f"/executions/{execution_id}/stop")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def retry_execution(execution_id: int) -> dict:
        """Retry a failed execution."""
        async with client() as c:
            r = await c.post(f"/executions/{execution_id}/retry")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def delete_execution(execution_id: int) -> dict:
        """Delete an execution record."""
        async with client() as c:
            r = await c.delete(f"/executions/{execution_id}")
            r.raise_for_status()
            return r.json()

    # ── Credentials ───────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_credentials() -> dict:
        """List all credentials. Secret data is never returned — names and types only."""
        async with client() as c:
            r = await c.get("/credentials")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def get_credential_schema(credential_type: str) -> dict:
        """
        Get the JSON schema for a credential type to know which fields to supply.
        Examples: httpBasicAuth, httpHeaderAuth, openAiApi, slackApi, githubApi.
        """
        async with client() as c:
            r = await c.get(f"/credentials/schema/{credential_type}")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def create_credential(name: str, type: str, data: dict) -> dict:
        """Create a credential. Call get_credential_schema first to know the required data fields."""
        async with client() as c:
            r = await c.post("/credentials", json={"name": name, "type": type, "data": data})
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def delete_credential(credential_id: str) -> dict:
        """Delete a credential by ID."""
        async with client() as c:
            r = await c.delete(f"/credentials/{credential_id}")
            r.raise_for_status()
            return r.json()

    # ── Variables ─────────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_variables() -> dict:
        """List all instance-level variables."""
        async with client() as c:
            r = await c.get("/variables")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def create_variable(key: str, value: str) -> dict:
        """Create a new instance-level variable."""
        async with client() as c:
            r = await c.post("/variables", json={"key": key, "value": value})
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def update_variable(variable_id: str, key: str | None = None, value: str | None = None) -> dict:
        """Update a variable's key or value."""
        body = {}
        if key is not None:
            body["key"] = key
        if value is not None:
            body["value"] = value
        async with client() as c:
            r = await c.put(f"/variables/{variable_id}", json=body)
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def delete_variable(variable_id: str) -> dict:
        """Delete a variable."""
        async with client() as c:
            r = await c.delete(f"/variables/{variable_id}")
            r.raise_for_status()
            return r.json()

    # ── Tags ──────────────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_tags(limit: int = 100) -> dict:
        """List all workflow tags."""
        async with client() as c:
            r = await c.get("/tags", params={"limit": limit})
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def create_tag(name: str) -> dict:
        """Create a new tag."""
        async with client() as c:
            r = await c.post("/tags", json={"name": name})
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def delete_tag(tag_id: str) -> dict:
        """Delete a tag."""
        async with client() as c:
            r = await c.delete(f"/tags/{tag_id}")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def get_workflow_tags(workflow_id: str) -> list:
        """Get tags assigned to a workflow."""
        async with client() as c:
            r = await c.get(f"/workflows/{workflow_id}/tags")
            r.raise_for_status()
            return r.json()

    @mcp.tool()
    async def set_workflow_tags(workflow_id: str, tag_ids: list[str]) -> list:
        """Replace all tags on a workflow with the provided list of tag IDs."""
        async with client() as c:
            r = await c.put(f"/workflows/{workflow_id}/tags", json=[{"id": t} for t in tag_ids])
            r.raise_for_status()
            return r.json()
