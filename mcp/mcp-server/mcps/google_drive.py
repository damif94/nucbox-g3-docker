import asyncio
import os

import httpx
from fastmcp import FastMCP
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

DRIVE_API = "https://www.googleapis.com/drive/v3"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# Google Workspace types that must be exported rather than downloaded directly
_EXPORT_MIME = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}


def _get_access_token(token_path: str) -> str:
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds.valid and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return creds.token


def register(mcp: FastMCP, token_path: str) -> None:

    async def _auth_headers() -> dict:
        loop = asyncio.get_running_loop()
        token = await loop.run_in_executor(None, _get_access_token, token_path)
        return {"Authorization": f"Bearer {token}"}

    @mcp.tool()
    async def list_files(
        folder_id: str | None = None,
        query: str | None = None,
        max_results: int = 50,
    ) -> list:
        """
        List files and folders in Google Drive.
        folder_id: restrict to a specific folder (omit for all files).
        query: filter by name substring.
        Returns id, name, mimeType, modifiedTime, size, parents for each item.
        """
        parts = ["trashed = false"]
        if folder_id:
            parts.append(f"'{folder_id}' in parents")
        if query:
            escaped = query.replace("\\", "\\\\").replace("'", "\\'")
            parts.append(f"name contains '{escaped}'")

        params = {
            "q": " and ".join(parts),
            "pageSize": max_results,
            "fields": "files(id,name,mimeType,modifiedTime,size,parents)",
        }

        headers = await _auth_headers()
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{DRIVE_API}/files", headers=headers, params=params)
            r.raise_for_status()
            return r.json().get("files", [])

    @mcp.tool()
    async def read_file(file_id: str) -> str:
        """
        Read a file's text content from Google Drive.
        Google Docs → plain text, Sheets → CSV, Slides → plain text.
        Other text files are downloaded directly.
        """
        headers = await _auth_headers()
        async with httpx.AsyncClient(timeout=60.0) as client:
            meta_r = await client.get(
                f"{DRIVE_API}/files/{file_id}",
                headers=headers,
                params={"fields": "name,mimeType"},
            )
            meta_r.raise_for_status()
            mime_type = meta_r.json()["mimeType"]

            if mime_type in _EXPORT_MIME:
                r = await client.get(
                    f"{DRIVE_API}/files/{file_id}/export",
                    headers=headers,
                    params={"mimeType": _EXPORT_MIME[mime_type]},
                )
            else:
                r = await client.get(
                    f"{DRIVE_API}/files/{file_id}",
                    headers=headers,
                    params={"alt": "media"},
                )
            r.raise_for_status()
            return r.text
