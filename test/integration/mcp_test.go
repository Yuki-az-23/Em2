package integration

import (
	"encoding/json"
	"strings"
	"testing"

	"em2.social/em2/test/testenv"
)

type rpcOut struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code int `json:"code"`
	} `json:"error"`
}

func rpc(in *testenv.Instance, token, method string, params any) (*testenv.Response, rpcOut) {
	in.T.Helper()
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method}
	if params != nil {
		body["params"] = params
	}
	r := in.Do("POST", "/mcp", token, body)
	var out rpcOut
	_ = json.Unmarshal(r.Raw, &out)
	return r, out
}

type toolResult struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	IsError    bool           `json:"isError"`
	Structured map[string]any `json:"structuredContent"`
}

func callTool(in *testenv.Instance, token, name string, args map[string]any) toolResult {
	in.T.Helper()
	_, out := rpc(in, token, "tools/call", map[string]any{"name": name, "arguments": args})
	var res toolResult
	if err := json.Unmarshal(out.Result, &res); err != nil {
		in.T.Fatalf("tools/call %s: %v %+v", name, err, out)
	}
	return res
}

func TestMCPHandshakeListAndCalls(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	r, out := rpc(in, "", "initialize", map[string]any{"protocolVersion": "2025-03-26", "capabilities": map[string]any{},
		"clientInfo": map[string]any{"name": "test", "version": "0"}})
	var init struct {
		ProtocolVersion string `json:"protocolVersion"`
		ServerInfo      struct {
			Name string `json:"name"`
		} `json:"serverInfo"`
		Instructions string `json:"instructions"`
	}
	_ = json.Unmarshal(out.Result, &init)
	if r.Status != 200 || init.ProtocolVersion != "2025-03-26" || init.ServerInfo.Name != "em2" || init.Instructions == "" {
		t.Fatalf("initialize: %d %s", r.Status, r.Raw)
	}
	if n := in.Do("POST", "/mcp", "", map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}); n.Status != 202 {
		t.Fatalf("notification: %d %s", n.Status, n.Raw)
	}
	if _, out := rpc(in, "", "no/such/method", nil); out.Error == nil || out.Error.Code != -32601 {
		t.Fatalf("unknown method: %+v", out)
	}
	_, out = rpc(in, "", "tools/list", nil)
	var list struct {
		Tools []struct {
			Name        string          `json:"name"`
			InputSchema json.RawMessage `json:"inputSchema"`
		} `json:"tools"`
	}
	_ = json.Unmarshal(out.Result, &list)
	names := map[string]string{}
	for _, tl := range list.Tools {
		names[tl.Name] = string(tl.InputSchema)
	}
	if len(list.Tools) < 25 || !strings.Contains(names["em2_publish"], `"channel_id"`) || !strings.Contains(names["em2_publish"], `"idempotency_key"`) ||
		!strings.Contains(names["em2_send"], `"handle"`) {
		t.Fatalf("tools/list: %s", out.Result)
	}

	// Without a key the tool fails the way REST does.
	if res := callTool(in, "", "em2_get_bridge", nil); !res.IsError || !strings.Contains(res.Content[0].Text, "unauthenticated") {
		t.Fatalf("unauthenticated call: %+v", res)
	}
	owner, _, _ := in.Human("owner")
	_, writer := in.Agent(owner, "writer")
	_, reader := in.Agent(owner, "reader")
	for _, k := range []string{writer, reader} {
		if res := callTool(in, k, "em2_set_bridge", map[string]any{"emotion": "joy", "color": "yellow"}); res.IsError {
			t.Fatalf("set bridge: %+v", res)
		}
	}
	if res := callTool(in, writer, "em2_set_bridge", map[string]any{"emotion": "Joy", "color": "yellow"}); !res.IsError {
		t.Fatal("an invalid emotion was accepted")
	}
	ch := callTool(in, writer, "em2_create_channel", map[string]any{"handle": "mcp-room", "title": "MCP room"})
	chID, _ := ch.Structured["id"].(string)
	if ch.IsError || chID == "" {
		t.Fatalf("create channel: %+v", ch)
	}
	if res := callTool(in, reader, "em2_subscribe", map[string]any{"channel_id": chID}); res.IsError {
		t.Fatalf("subscribe: %+v", res)
	}
	pub := callTool(in, writer, "em2_publish", map[string]any{"channel_id": chID, "body_md": "Hello over **MCP**."})
	id, _ := pub.Structured["id"].(string)
	if pub.IsError || id == "" || len(pub.Structured) != 1 {
		t.Fatalf("publish: %+v", pub)
	}
	if it := waitItem(in, "/v1/me/feed", reader, id); it == nil || it.Verdict.Kind != "pass" {
		t.Fatalf("published over MCP, read over REST: %+v", it)
	}
	feed := callTool(in, reader, "em2_read_feed", map[string]any{"limit": 5})
	if feed.IsError || !strings.Contains(feed.Content[0].Text, id) || !strings.Contains(feed.Content[0].Text, `"verdict"`) {
		t.Fatalf("read feed: %+v", feed)
	}
	// Scopes are the REST scopes: the default agent cannot fetch.
	if res := callTool(in, reader, "em2_fetch", map[string]any{"url": "https://example.org/"}); !res.IsError || !strings.Contains(res.Content[0].Text, "forbidden") {
		t.Fatalf("fetch without scope: %+v", res)
	}
	_, out = rpc(in, reader, "resources/read", map[string]any{"uri": "em2://llms.txt"})
	if !strings.Contains(string(out.Result), "em2_publish") {
		t.Fatalf("llms resource: %s", out.Result)
	}
}

func TestDiscoveryDocuments(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	for path, want := range map[string]string{
		"/":                           "text/html",
		"/llms.txt":                   "text/markdown",
		"/robots.txt":                 "text/plain",
		"/.well-known/em2-agent.json": "application/json",
	} {
		r := in.Must(in.Do("GET", path, "", nil), 200)
		if !strings.HasPrefix(r.Header.Get("Content-Type"), want) || !strings.Contains(r.Header.Get("Cache-Control"), "public") {
			t.Errorf("%s: %s %s", path, r.Header.Get("Content-Type"), r.Header.Get("Cache-Control"))
		}
		for _, leak := range []string{"0.4.0", "em2-2.1", "dossier-2", "postgres", "localhost"} {
			if strings.Contains(string(r.Raw), leak) {
				t.Errorf("%s mentions %q", path, leak)
			}
		}
	}
	page := in.Do("GET", "/", "", nil)
	if !strings.Contains(page.Header.Get("Content-Security-Policy"), "style-src 'sha256-") || !strings.Contains(string(page.Raw), "/mcp") {
		t.Fatalf("landing: %v %s", page.Header, page.Raw)
	}
	// Unknown paths stay the generic 404 instead of the landing page.
	in.Must(in.Do("GET", "/nothing-here", "", nil), 404)
	if oa := in.Must(in.Do("GET", "/v1/openapi.json", "", nil), 200); strings.Contains(string(oa.Raw), "llms.txt") || !strings.Contains(string(oa.Raw), `"/mcp"`) {
		t.Fatal("discovery documents leaked into, or MCP is missing from, the OpenAPI document")
	}
}
