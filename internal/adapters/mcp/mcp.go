// Package mcp exposes EM2 to agents over the Model Context Protocol
// (JSON-RPC 2.0 on Streamable HTTP, JSON responses) and publishes the
// discovery documents agents and crawlers read first: the landing page,
// /llms.txt, /robots.txt and /.well-known/em2-agent.json (ADR-015).
//
// Every MCP tool is one public REST operation, executed through the kernel's
// own handler with the caller's credentials, so authentication, scopes,
// validation, quotas, idempotency and the uniform sender answers are exactly
// those of the REST API. There is no second implementation to drift.
package mcp

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

// Config for the adapter.
type Config struct {
	PublicURL string // absolute base URL used in the documents; "" uses relative paths
}

// Adapter is the MCP and discovery adapter.
type Adapter struct {
	cfg      Config
	internal http.Handler
	routes   func() []kernel.RouteSpec

	once    sync.Once
	catalog []toolDef
	byName  map[string]toolDef
}

type toolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema *schema.Schema `json:"inputSchema"`
	spec        kernel.RouteSpec
}

// New builds the adapter.
func New(cfg Config) *Adapter {
	cfg.PublicURL = strings.TrimRight(cfg.PublicURL, "/")
	return &Adapter{cfg: cfg}
}

func (a *Adapter) Manifest() kernel.Manifest {
	return kernel.Manifest{Name: "mcp", Version: "0.1.0", Kind: kernel.KindAdapter}
}

func (a *Adapter) Register(r *kernel.Registry) error {
	a.internal = r.Internal()
	a.routes = r.PublicRoutes()
	r.Route(kernel.Route{Method: "POST", Path: "/mcp", OperationID: "mcp",
		Summary: "Model Context Protocol endpoint (JSON-RPC 2.0, Streamable HTTP). Send your EM2 key as a bearer token; tools run the REST operations with it.",
		Tags:    []string{"agents"}, RawBody: []string{"application/json"}, MaxBody: 2 << 20,
		Responses: map[int]*schema.Schema{200: nil, 202: nil}, RateLimit: &kernel.RateLimit{Burst: 300, Per: time.Minute}, Handler: a.serve})
	a.discoveryRoutes(r)
	return nil
}

// Protocol versions this server speaks, newest first.
var versions = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func rpcResponse(id json.RawMessage, result any, e *rpcError) *kernel.Response {
	body := map[string]any{"jsonrpc": "2.0", "id": id}
	if e != nil {
		body["error"] = e
	} else {
		body["result"] = result
	}
	if id == nil {
		body["id"] = nil
	}
	b, _ := json.Marshal(body)
	return &kernel.Response{Status: http.StatusOK, Raw: b, ContentType: "application/json"}
}

func (a *Adapter) serve(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in rpcRequest
	trimmed := bytes.TrimSpace(req.Body)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		return rpcResponse(nil, nil, &rpcError{-32600, "Batches are not supported."}), nil
	}
	if err := json.Unmarshal(req.Body, &in); err != nil {
		return rpcResponse(nil, nil, &rpcError{-32700, "The body is not valid JSON."}), nil
	}
	if in.JSONRPC != "2.0" || in.Method == "" {
		return rpcResponse(in.ID, nil, &rpcError{-32600, "Not a JSON-RPC 2.0 request."}), nil
	}
	if in.ID == nil || string(in.ID) == "null" {
		// A notification: nothing to answer.
		return &kernel.Response{Status: http.StatusAccepted}, nil
	}
	switch in.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(in.Params, &p)
		v := versions[0]
		for _, s := range versions {
			if s == p.ProtocolVersion {
				v = s
			}
		}
		return rpcResponse(in.ID, map[string]any{
			"protocolVersion": v,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}, "resources": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "em2", "title": "EM2, an emotion-guided communication proxy", "version": "1"},
			"instructions":    instructions,
		}, nil), nil
	case "ping":
		return rpcResponse(in.ID, map[string]any{}, nil), nil
	case "tools/list":
		return rpcResponse(in.ID, map[string]any{"tools": a.tools()}, nil), nil
	case "tools/call":
		return a.call(in, req), nil
	case "resources/list":
		return rpcResponse(in.ID, map[string]any{"resources": resources}, nil), nil
	case "resources/read":
		return a.readResource(in, req), nil
	}
	return rpcResponse(in.ID, nil, &rpcError{-32601, "Unknown method."}), nil
}

const instructions = "EM2 guides communication by emotion. Set your bridge (em2_set_bridge) before sending. " +
	"Subscribe to channels (em2_subscribe) and read your feed (em2_read_feed): every item carries your own verdict. " +
	"Publishing (em2_publish) and sending (em2_send) always answer with an id only; delivery is decided by each receiver. " +
	"Read em2://llms.txt for the whole guide."

var pathParamRe = regexp.MustCompile(`\{([a-z_]+)\}`)

// build creates the tool catalogue from the routes once the kernel booted.
func (a *Adapter) build() {
	specs := map[string]kernel.RouteSpec{}
	for _, s := range a.routes() {
		specs[s.OperationID] = s
	}
	a.byName = map[string]toolDef{}
	for _, t := range tools {
		s, ok := specs[t.OperationID]
		if !ok {
			continue
		}
		var props []schema.Prop
		names := make([]string, 0, len(s.Params))
		for n := range s.Params {
			names = append(names, n)
		}
		sort.Strings(names)
		seen := map[string]bool{}
		for _, n := range names {
			props = append(props, schema.Req(n, s.Params[n]))
			seen[n] = true
		}
		add := func(o *schema.Schema, required bool) {
			if o == nil {
				return
			}
			keys := make([]string, 0, len(o.Properties))
			for k := range o.Properties {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				if seen[k] {
					continue
				}
				seen[k] = true
				req := required && contains(o.Required, k)
				props = append(props, schema.Prop{Name: k, Schema: o.Properties[k], Required: req})
			}
		}
		add(s.Query, false)
		add(s.Body, true)
		if len(s.RawBody) > 0 {
			props = append(props, schema.Req("body", schema.String().Doc("The request body, sent as is.")),
				schema.Opt("content_type", schema.Enum(s.RawBody...).Doc("Media type of body; default "+s.RawBody[0]+".")))
		}
		if s.Idempotent {
			props = append(props, schema.Opt("idempotency_key", schema.String().Len(1, 128).Match(`[A-Za-z0-9_-]{1,128}`).
				Doc("Repeat a call safely by reusing the same key. Generated when omitted.")))
		}
		d := toolDef{Name: t.Name, Description: t.Description, InputSchema: schema.Object(props...), spec: s}
		a.catalog = append(a.catalog, d)
		a.byName[t.Name] = d
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func (a *Adapter) tools() []toolDef {
	a.once.Do(a.build)
	return a.catalog
}

func toolError(id json.RawMessage, text string) *kernel.Response {
	return rpcResponse(id, map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": true}, nil)
}

// call runs a tool as the REST operation it maps to, with the caller's
// credentials and client address.
func (a *Adapter) call(in rpcRequest, outer *kernel.Request) *kernel.Response {
	a.once.Do(a.build)
	var p struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return rpcResponse(in.ID, nil, &rpcError{-32602, "params must be {name, arguments}."})
	}
	t, ok := a.byName[p.Name]
	if !ok {
		return rpcResponse(in.ID, nil, &rpcError{-32602, "Unknown tool."})
	}
	if p.Arguments == nil {
		p.Arguments = map[string]any{}
	}
	if errs := t.InputSchema.Validate(p.Arguments); len(errs) > 0 {
		return toolError(in.ID, "Invalid arguments: "+errs.Error())
	}
	s := t.spec
	path := pathParamRe.ReplaceAllStringFunc(s.Path, func(m string) string {
		v, _ := p.Arguments[m[1:len(m)-1]].(string)
		return url.PathEscape(v)
	})
	q := url.Values{}
	if s.Query != nil {
		for k := range s.Query.Properties {
			if v, ok := p.Arguments[k]; ok {
				q.Set(k, fmt.Sprint(v))
			}
		}
	}
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var body []byte
	ct := ""
	switch {
	case s.Body != nil:
		fields := map[string]any{}
		for k := range s.Body.Properties {
			if v, ok := p.Arguments[k]; ok {
				fields[k] = v
			}
		}
		body, _ = json.Marshal(fields)
		ct = "application/json"
	case len(s.RawBody) > 0:
		b, _ := p.Arguments["body"].(string)
		body = []byte(b)
		ct = s.RawBody[0]
		if v, _ := p.Arguments["content_type"].(string); v != "" {
			ct = v
		}
	}
	r := httptest.NewRequest(s.Method, path, bytes.NewReader(body))
	r.RemoteAddr = outer.Raw.RemoteAddr
	for _, h := range []string{"Authorization", "X-Forwarded-For", "CF-Connecting-IP", "User-Agent"} {
		if v := outer.Header.Get(h); v != "" {
			r.Header.Set(h, v)
		}
	}
	if ct != "" {
		r.Header.Set("Content-Type", ct)
	}
	if s.Idempotent {
		key, _ := p.Arguments["idempotency_key"].(string)
		if key == "" {
			b := make([]byte, 16)
			_, _ = rand.Read(b)
			key = "mcp-" + hex.EncodeToString(b)
		}
		r.Header.Set("Idempotency-Key", key)
	}
	rec := httptest.NewRecorder()
	a.internal.ServeHTTP(rec, r.WithContext(outer.Raw.Context()))
	res := rec.Result()
	text := rec.Body.String()
	if text == "" {
		text = fmt.Sprintf(`{"status":%d}`, res.StatusCode)
	}
	result := map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": res.StatusCode >= 400}
	if res.StatusCode < 400 {
		var structured map[string]any
		if json.Unmarshal(rec.Body.Bytes(), &structured) == nil {
			result["structuredContent"] = structured
		}
	}
	return rpcResponse(in.ID, result, nil)
}

var resources = []map[string]string{
	{"uri": "em2://llms.txt", "name": "llms.txt", "title": "How to use EM2", "mimeType": "text/markdown"},
	{"uri": "em2://openapi", "name": "openapi", "title": "The public REST API (OpenAPI 3.1)", "mimeType": "application/json"},
	{"uri": "em2://rulesets/active", "name": "ruleset", "title": "The ECBridge and verdict rules in force", "mimeType": "application/json"},
}

func (a *Adapter) readResource(in rpcRequest, outer *kernel.Request) *kernel.Response {
	var p struct {
		URI string `json:"uri"`
	}
	_ = json.Unmarshal(in.Params, &p)
	var text, mime string
	switch p.URI {
	case "em2://llms.txt":
		text, mime = a.llms(), "text/markdown"
	case "em2://openapi", "em2://rulesets/active":
		path := map[string]string{"em2://openapi": "/v1/openapi.json", "em2://rulesets/active": "/v1/bridge/rulesets/active"}[p.URI]
		rec := httptest.NewRecorder()
		a.internal.ServeHTTP(rec, httptest.NewRequest("GET", path, nil).WithContext(outer.Raw.Context()))
		text, mime = rec.Body.String(), "application/json"
	default:
		return rpcResponse(in.ID, nil, &rpcError{-32602, "Unknown resource."})
	}
	return rpcResponse(in.ID, map[string]any{"contents": []map[string]string{{"uri": p.URI, "mimeType": mime, "text": text}}}, nil)
}
