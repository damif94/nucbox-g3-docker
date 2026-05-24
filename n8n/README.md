# n8n

Self-hosted n8n instance backed by PostgreSQL, exposed via Nginx Proxy Manager.

- **URL**: https://n8n.damianferencz.org
- **Port**: 5678
- **Data**: `/srv/data/n8n`

## Deployment

```bash
cd /home/damian/nucbox-g3-docker/n8n
docker compose --env-file ../.env up -d
```

---

## Adding MCP servers to n8n workflows

### Key findings (hard-won)

#### Use node v1.1, not v1

When you drag an **MCP Client Tool** node into a workflow, n8n creates it as **version 1**. Version 1 only supports the SSE transport, which is broken in n8n's internal `proxyFetch`/undici stack — it opens the SSE stream fine but silently never sends the follow-up POST, leaving the tool list call hanging forever.

**Always use v1.1.** Version 1.1 supports **Streamable HTTP**, which is a single POST endpoint with no handshake — it works reliably.

Because n8n's UI always creates v1 and reverts to v1 on save, you need to patch the node via the API after adding it.

#### Patch script

```bash
API_KEY="<your n8n API key>"
WF_ID="<workflow id>"

# 1. Fetch the workflow
curl -s "https://n8n.damianferencz.org/api/v1/workflows/${WF_ID}" \
  -H "X-N8N-API-KEY: ${API_KEY}" > /tmp/wf.json

# 2. Patch MCP nodes (edit the Python block for each node)
python3 << 'EOF'
import json

with open('/tmp/wf.json') as f:
    wf = json.load(f)

for n in wf['nodes']:
    if 'mcpClientTool' not in n.get('type', ''):
        continue
    if n['name'] == 'My MCP Node':               # match by node name
        n['typeVersion'] = 1.1
        n['parameters'] = {
            'endpointUrl': 'https://mcp.example.com/mcp',
            'serverTransport': 'httpStreamable',
            'authentication': 'headerAuth',       # or 'none'
            'options': {}
        }

_ALLOWED_SETTINGS = {
    'executionOrder','saveDataErrorExecution','saveDataSuccessExecution',
    'saveManualExecutions','saveExecutionProgress','executionTimeout',
    'timezone','callerPolicy','callerIds','errorWorkflow',
}
body = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': {k: v for k, v in wf.get('settings', {}).items() if k in _ALLOWED_SETTINGS},
    'staticData': wf.get('staticData'),
    'pinData': wf.get('pinData', {}),
}

with open('/tmp/wf_patch.json', 'w') as f:
    json.dump(body, f)
print("Patch written")
EOF

# 3. Apply
curl -s -X PUT "https://n8n.damianferencz.org/api/v1/workflows/${WF_ID}" \
  -H "X-N8N-API-KEY: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d @/tmp/wf_patch.json | python3 -c "
import sys, json
r = json.load(sys.stdin)
for n in r.get('nodes', []):
    if 'mcpClientTool' in n.get('type',''):
        print(n['name'], '| v' + str(n['typeVersion']), '|', n['parameters'].get('endpointUrl'))
"
```

> **Warning**: Every time you save the workflow from the n8n UI, n8n reverts the node back to v1. Re-run the patch after each UI save.

#### `settings` field pitfall

n8n's `PUT /workflows/{id}` rejects unknown fields in the `settings` object. The GET response includes internal fields (`binaryMode`, `availableInMCP`, `timeSavedMode`, etc.) that cannot be sent back. Always filter settings to the allowed keys shown in the script above.

---

### MCP servers in use

| Node name | Endpoint | Transport | Auth |
|-----------|----------|-----------|------|
| n8n MCP | `https://mcp.damianferencz.org/n8n` | Streamable HTTP | Header Auth (Bearer) |
| Basketball MCP | `https://docs.sportradar.com/basketball/~gitbook/mcp` | Streamable HTTP | None |

The Bearer token for `mcp.damianferencz.org` is in `.env` and in `mcp/nginx.conf`.

---

### Testing an MCP endpoint before adding it to n8n

```bash
# Check if it responds (streamable-http)
curl -s -X POST "https://your-mcp-server.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'

# Expected: event: message / data: {"result":{"protocolVersion":...}}
# If you get 401 → needs auth
# If you get 404/405 → wrong URL or wrong transport (try SSE)
```
