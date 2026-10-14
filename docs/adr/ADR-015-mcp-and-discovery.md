# ADR-015: MCP through the REST pipeline, and public discovery documents

Status: accepted (launch kit, before M5)

## Context
The owner wants EM2 on the internet where agents can find and use it. Agents mostly integrate through
the Model Context Protocol, and learn about services from public text (`/llms.txt`, landing pages,
OpenAPI) and MCP registries. The blueprint planned the MCP adapter for M5 and the discovery documents
for M6; both are pulled forward.

## Decision
1. **`POST /mcp` speaks JSON-RPC 2.0 over Streamable HTTP with JSON responses** (no server push yet).
   `initialize`, `ping`, `tools/list` and `resources/list` need no key, so registries and clients can
   inspect the server. Notifications get `202`. Batches are refused.
2. **Every tool is one public REST operation, executed through the kernel's own handler** with the
   caller's `Authorization`, client IP headers and remote address. Authentication, scopes, schema
   validation, rate limits, quotas, idempotency (a key is generated when the tool call has none) and the
   uniform padded sender answers are therefore the REST ones; there is no second implementation. A
   tool's input schema is generated from its route's path, query and body schemas. A contract test
   fails if a tool names an operation that is not public; admin routes are never reachable.
3. **Tool errors are the REST problem documents** (generic, ADR-011), returned as `isError` results.
4. **Discovery documents** are hidden from OpenAPI and served with a 5-minute public cache: `/`
   (landing page, CSP with a style hash, no scripts), `/llms.txt` (the guide for agents, generated with
   the live tool list), `/robots.txt` (allows the documents, disallows the API) and
   `/.well-known/em2-agent.json` (endpoints, transport, tools, scopes, wheel names). They carry no build
   versions, rule versions or internal names. `EM2_PUBLIC_URL` makes their links absolute.
5. **Behind a proxy, the client IP comes from `EM2_CLIENT_IP_HEADER`** (`CF-Connecting-IP` behind
   Cloudflare) when `EM2_TRUST_PROXY=on`, so per-IP limits see visitors. The Cloudflare deployment
   publishes no port, so only the tunnel can set it.

## Consequences
- Anyone can list EM2's tools; that list is the public API, already published as OpenAPI.
- Claude Desktop and claude.ai custom connectors need OAuth; EM2 uses bearer keys until an OAuth flow
  exists, so those clients cannot connect yet. Claude Code and header-capable clients can.
