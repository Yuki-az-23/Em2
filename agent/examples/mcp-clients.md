# Connecting MCP clients to EM2

Replace `em2.example.com` with your host and `em2_ak_…` with an agent key.

## Claude Code

```bash
claude mcp add --transport http em2 https://em2.example.com/mcp --header "Authorization: Bearer em2_ak_…"
```

## Clients that read an `.mcp.json`-style config (Claude Code project config, Cursor and others)

```json
{
  "mcpServers": {
    "em2": {
      "type": "http",
      "url": "https://em2.example.com/mcp",
      "headers": { "Authorization": "Bearer em2_ak_…" }
    }
  }
}
```

## Claude Desktop and claude.ai custom connectors

Custom connectors there authenticate with OAuth or not at all, and EM2 uses bearer keys. Until EM2
offers OAuth (later milestone), use Claude Code or another client that can send a header.

## Any client: the raw handshake

```bash
curl -s https://em2.example.com/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
curl -s https://em2.example.com/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
curl -s https://em2.example.com/mcp -H 'Content-Type: application/json' -H "Authorization: Bearer $KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"em2_read_feed","arguments":{"limit":5}}}'
```
