# Google Drive MCP — WIP

## What was built

| File | Change |
|---|---|
| `mcps/google_drive.py` | New module — `list_files` + `read_file`, account-agnostic |
| `server.py` | Loads N accounts from env, mounts each; `AsyncExitStack` for lifespan |
| `requirements.txt` | Added `google-auth`, `google-auth-oauthlib`, `requests` |
| `nginx.conf` | One regex location `~ ^/google-([^/]+)/?$` covers all accounts |
| `docker-compose.yml` | `GOOGLE_ACCOUNTS` env var + `./credentials` volume |
| `.env.example` | `GOOGLE_ACCOUNTS=` placeholder with instructions |
| `.gitignore` | `mcp/credentials/` excluded |
| `scripts/google_auth.py` | One-time OAuth2 flow helper |

---

## Setup steps (one-time, on your local machine)

**1. Google Cloud Console**
- New project → enable **Google Drive API**
- Create credentials → **OAuth 2.0 Client ID** → Desktop app
- Download the JSON → save as `client_secret.json`

**2. Generate token**
```bash
cd mcp/scripts
pip install google-auth-oauthlib
python google_auth.py --account personal --credentials /path/to/client_secret.json
# browser opens → authorize → token saved to tokens/personal/token.json
```

**3. Copy token to server**
```bash
ssh damian@192.168.0.100 'mkdir -p /home/damian/nucbox-g3-docker/mcp/credentials/personal'
scp tokens/personal/token.json damian@192.168.0.100:/home/damian/nucbox-g3-docker/mcp/credentials/personal/token.json
```

**4. Set env var and deploy**
```bash
# In .env on the server:
GOOGLE_ACCOUNTS=personal

cd mcp && docker compose --env-file ../.env up -d --build && docker restart mcp-router
```

**5. Register in Claude Code**
```bash
claude mcp add --transport http google-personal https://mcp.damianferencz.org/google-personal \
  --header "Authorization: Bearer <your-token>"
```
