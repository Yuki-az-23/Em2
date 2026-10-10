package kernel

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/pkg/schema"
)

// fakeModule lets tests register arbitrary routes, events and services.
type fakeModule struct {
	man Manifest
	reg func(r *Registry) error
}

func (f fakeModule) Manifest() Manifest         { return f.man }
func (f fakeModule) Register(r *Registry) error { return f.reg(r) }

func mod(name string, deps []string, reg func(r *Registry) error) fakeModule {
	if reg == nil {
		reg = func(*Registry) error { return nil }
	}
	return fakeModule{man: Manifest{Name: name, Version: "1.0.0", Kind: KindModule, DependsOn: deps}, reg: reg}
}

type greeter interface{ Greet() string }
type hello struct{}

func (hello) Greet() string { return "hello" }

func TestDependencyOrderAndCycles(t *testing.T) {
	order, err := dependencyOrder(map[string]Manifest{
		"c": {Name: "c", DependsOn: []string{"b"}},
		"b": {Name: "b", DependsOn: []string{"a"}},
		"a": {Name: "a"},
	})
	if err != nil || strings.Join(order, ",") != "a,b,c" {
		t.Fatalf("order = %v, %v", order, err)
	}
	_, err = dependencyOrder(map[string]Manifest{"a": {Name: "a", DependsOn: []string{"b"}}, "b": {Name: "b", DependsOn: []string{"a"}}})
	if err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected cycle error, got %v", err)
	}
	_, err = dependencyOrder(map[string]Manifest{"a": {Name: "a", DependsOn: []string{"ghost"}}})
	if err == nil || !strings.Contains(err.Error(), "unknown module") {
		t.Fatalf("expected unknown dependency error, got %v", err)
	}
}

func TestResolveRequiresDependsOn(t *testing.T) {
	var got string
	var resolveErr error
	k := New(Config{})
	_ = k.Register(
		mod("provider", nil, func(r *Registry) error { r.Provide(hello{}); return nil }),
		mod("friend", []string{"provider"}, func(r *Registry) error {
			g, err := Resolve[greeter](r)
			if err != nil {
				return err
			}
			got = g.Greet()
			return nil
		}),
		mod("stranger", nil, func(r *Registry) error {
			_, resolveErr = Resolve[greeter](r)
			return nil
		}),
	)
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	if got != "hello" {
		t.Fatalf("dependent module did not resolve the service")
	}
	if resolveErr == nil || !strings.Contains(resolveErr.Error(), "not in DependsOn") {
		t.Fatalf("module outside DependsOn resolved the service: %v", resolveErr)
	}
}

func TestRegisterRejectsBadManifests(t *testing.T) {
	cases := map[string][]Module{
		"bad name":      {mod("Bad-Name", nil, nil)},
		"reserved name": {mod("kernel", nil, nil)},
		"too short":     {mod("a", nil, nil)},
		"duplicate":     {mod("alpha", nil, nil), mod("alpha", nil, nil)},
		"shared schema": {fakeModule{man: Manifest{Name: "alpha", Schema: "shared"}}, fakeModule{man: Manifest{Name: "beta", Schema: "shared"}}},
		"public schema": {fakeModule{man: Manifest{Name: "alpha", Schema: "public"}}},
		"kernel schema": {fakeModule{man: Manifest{Name: "alpha", Schema: "kernel"}}},
	}
	for name, mods := range cases {
		t.Run(name, func(t *testing.T) {
			if err := New(Config{}).Register(mods...); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
	if err := New(Config{}).Register(mod("alpha", nil, nil), fakeModule{man: Manifest{Name: "beta", Schema: "beta"}}); err != nil {
		t.Fatalf("valid manifests rejected: %v", err)
	}
}

func TestBootRejectsBrokenGraphs(t *testing.T) {
	h := func(Ctx, *Request) (*Response, error) { return nil, nil }
	cases := map[string]Module{
		"duplicate route": mod("alpha", nil, func(r *Registry) error {
			r.Route(Route{Method: "GET", Path: "/x", OperationID: "x1", Handler: h})
			r.Route(Route{Method: "GET", Path: "/x", OperationID: "x2", Handler: h})
			return nil
		}),
		"undeclared path param": mod("alpha", nil, func(r *Registry) error {
			r.Route(Route{Method: "GET", Path: "/x/{id}", OperationID: "x", Handler: h})
			return nil
		}),
		"undeclared event": mod("alpha", nil, func(r *Registry) error {
			r.Subscribe("ghost.thing.happened", 1, func(Ctx, Envelope) error { return nil })
			return nil
		}),
		"event version mismatch": mod("alpha", nil, func(r *Registry) error {
			r.Emits(EventDef{Name: "alpha.thing.happened", Version: 2})
			r.Subscribe("alpha.thing.happened", 1, func(Ctx, Envelope) error { return nil })
			return nil
		}),
		"two authenticators": mod("alpha", nil, func(r *Registry) error {
			f := func(Ctx, string) (*core.Principal, error) { return nil, nil }
			r.Authenticator(f)
			r.Authenticator(f)
			return nil
		}),
	}
	for name, m := range cases {
		t.Run(name, func(t *testing.T) {
			k := New(Config{})
			if err := k.Register(m); err != nil {
				t.Fatalf("register: %v", err)
			}
			if err := k.Boot(); err == nil {
				t.Fatal("expected boot to fail")
			}
		})
	}
}

// testKernel boots a kernel with one module exposing routes that exercise the
// pipeline, and a fake authenticator: "human", "admin", "agent" tokens.
func testKernel(t *testing.T, cfg Config) *Kernel {
	t.Helper()
	k := New(cfg)
	idParam := map[string]*schema.Schema{"id": schema.UUID()}
	m := mod("demo", nil, func(r *Registry) error {
		r.Authenticator(func(_ Ctx, cred string) (*core.Principal, error) {
			switch cred {
			case "human":
				return &core.Principal{ID: "h1", Kind: core.KindHuman, Roles: []string{"user"}}, nil
			case "admin":
				return &core.Principal{ID: "a1", Kind: core.KindHuman, Roles: []string{"user", "admin"}}, nil
			case "agent":
				return &core.Principal{ID: "g1", Kind: core.KindAgent, Scopes: []string{"feed:read"}}, nil
			}
			return nil, ErrUnauthenticated
		})
		ok := func(Ctx, *Request) (*Response, error) { return JSON(200, map[string]string{"ok": "yes"}), nil }
		r.Route(Route{Method: "POST", Path: "/v1/echo", OperationID: "echo", Summary: "echo",
			Body:      schema.Object(schema.Req("name", schema.String().Len(1, 10))),
			MaxBody:   64,
			Responses: map[int]*schema.Schema{200: nil},
			Handler: func(_ Ctx, req *Request) (*Response, error) {
				var b struct{ Name string }
				if err := req.Decode(&b); err != nil {
					return nil, err
				}
				return JSON(200, map[string]string{"name": b.Name}), nil
			}})
		r.Route(Route{Method: "GET", Path: "/v1/things/{id}", OperationID: "getThing", Params: idParam,
			Query: schema.Object(schema.Opt("limit", schema.Integer().Range(1, 50))),
			Handler: func(_ Ctx, req *Request) (*Response, error) {
				return &Response{Status: 200, Body: map[string]string{"id": req.Params["id"]}, ETag: "v1"}, nil
			}})
		r.Route(Route{Method: "GET", Path: "/v1/boom", OperationID: "boom", Handler: func(Ctx, *Request) (*Response, error) {
			return nil, errors.New("pq: relation \"identity.secret_table\" does not exist at /srv/em2/kernel.go:42")
		}})
		r.Route(Route{Method: "GET", Path: "/v1/panic", OperationID: "panic", Handler: func(Ctx, *Request) (*Response, error) {
			panic("secret panic detail")
		}})
		r.Route(Route{Method: "GET", Path: "/v1/human", OperationID: "human", Auth: AuthHuman, Handler: ok})
		r.Route(Route{Method: "GET", Path: "/v1/any", OperationID: "any", Auth: AuthPrincipal, Scope: "feed:read", Handler: ok})
		r.Route(Route{Method: "GET", Path: "/v1/post", OperationID: "post", Auth: AuthPrincipal, Scope: "post:create", Handler: ok})
		r.Route(Route{Method: "GET", Path: "/v1/admin/thing", OperationID: "adminThing", Auth: AuthAdmin, Handler: ok})
		r.Route(Route{Method: "GET", Path: "/v1/limited", OperationID: "limited", RateLimit: &RateLimit{Burst: 2, Per: time.Minute}, Handler: ok})
		r.Route(Route{Method: "GET", Path: "/v1/slow", OperationID: "slow", MinDuration: 80 * time.Millisecond, Handler: ok})
		return nil
	})
	if err := k.Register(m); err != nil {
		t.Fatal(err)
	}
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	return k
}

func do(t *testing.T, k *Kernel, method, path, token, contentType, body string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	k.Handler().ServeHTTP(rec, req)
	return rec.Result()
}

func problemOf(t *testing.T, resp *http.Response) Problem {
	t.Helper()
	if ct := resp.Header.Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("content type = %q, want application/problem+json", ct)
	}
	var p Problem
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPipelineStatusCodes(t *testing.T) {
	k := testKernel(t, Config{})
	const id = "6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f"
	cases := []struct {
		name, method, path, token, ct, body string
		status                              int
		code                                string
	}{
		{"valid body", "POST", "/v1/echo", "", "application/json", `{"name":"ada"}`, 200, ""},
		{"invalid body", "POST", "/v1/echo", "", "application/json", `{"name":""}`, 400, "validation"},
		{"unknown field", "POST", "/v1/echo", "", "application/json", `{"name":"a","x":1}`, 400, "validation"},
		{"wrong content type", "POST", "/v1/echo", "", "text/plain", `{"name":"a"}`, 415, "unsupported-media-type"},
		{"body too large", "POST", "/v1/echo", "", "application/json", `{"name":"` + strings.Repeat("a", 200) + `"}`, 413, "payload-too-large"},
		{"bad path param is not found", "GET", "/v1/things/not-a-uuid", "", "", "", 404, "not-found"},
		{"bad query", "GET", "/v1/things/" + id + "?limit=500", "", "", "", 400, "validation"},
		{"unknown query", "GET", "/v1/things/" + id + "?debug=1", "", "", "", 400, "validation"},
		{"unknown route", "GET", "/v1/nope", "", "", "", 404, "not-found"},
		{"wrong method looks like unknown route", "DELETE", "/v1/echo", "", "", "", 404, "not-found"},
		{"no token", "GET", "/v1/human", "", "", "", 401, "unauthenticated"},
		{"bad token", "GET", "/v1/human", "garbage", "", "", 401, "unauthenticated"},
		{"agent on human route", "GET", "/v1/human", "agent", "", "", 403, "forbidden"},
		{"agent with scope", "GET", "/v1/any", "agent", "", "", 200, ""},
		{"agent without scope", "GET", "/v1/post", "agent", "", "", 403, "forbidden"},
		{"human holds all scopes", "GET", "/v1/post", "human", "", "", 200, ""},
		{"admin route hidden from non-admin", "GET", "/v1/admin/thing", "human", "", "", 404, "not-found"},
		{"admin route for admin", "GET", "/v1/admin/thing", "admin", "", "", 200, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			resp := do(t, k, c.method, c.path, c.token, c.ct, c.body)
			if resp.StatusCode != c.status {
				b, _ := io.ReadAll(resp.Body)
				t.Fatalf("status = %d, want %d; body %s", resp.StatusCode, c.status, b)
			}
			if c.code != "" {
				if p := problemOf(t, resp); p.Type != ProblemBase+c.code || p.Status != c.status || !strings.HasPrefix(p.Instance, "urn:em2:request:") {
					t.Fatalf("problem = %+v", p)
				}
			}
		})
	}
}

func TestInternalErrorsAndPanicsDoNotLeak(t *testing.T) {
	k := testKernel(t, Config{})
	for _, path := range []string{"/v1/boom", "/v1/panic"} {
		resp := do(t, k, "GET", path, "", "", "")
		b, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 500 {
			t.Fatalf("%s: status %d", path, resp.StatusCode)
		}
		for _, leak := range []string{"identity", "secret", "kernel.go", "pq:", "panic", "/srv"} {
			if strings.Contains(string(b), leak) {
				t.Fatalf("%s: response leaks %q: %s", path, leak, b)
			}
		}
		if !strings.Contains(string(b), "An error occurred. Please try again.") {
			t.Fatalf("%s: unexpected body %s", path, b)
		}
	}
}

func TestEveryResponseCarriesHygieneHeaders(t *testing.T) {
	k := testKernel(t, Config{})
	for _, path := range []string{"/healthz", "/v1/nope", "/v1/boom", "/v1/human"} {
		resp := do(t, k, "GET", path, "", "", "")
		h := resp.Header
		if h.Get("Server") != "" || h.Get("X-Powered-By") != "" {
			t.Errorf("%s: banner header present", path)
		}
		for name, want := range map[string]string{"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store"} {
			if h.Get(name) != want {
				t.Errorf("%s: %s = %q, want %q", path, name, h.Get(name), want)
			}
		}
		if len(h.Get("X-Request-Id")) != 24 {
			t.Errorf("%s: missing request id", path)
		}
	}
}

func TestHealthAndOpenAPICarryNoVersion(t *testing.T) {
	k := testKernel(t, Config{})
	b, _ := io.ReadAll(do(t, k, "GET", "/healthz", "", "", "").Body)
	if strings.TrimSpace(string(b)) != `{"status":"ok"}` {
		t.Fatalf("healthz body %s", b)
	}
	resp := do(t, k, "GET", "/v1/openapi.json", "", "", "")
	var doc map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if doc["info"].(map[string]any)["version"] != "v1" {
		t.Fatalf("info.version must be the API version only")
	}
	paths := doc["paths"].(map[string]any)
	if _, ok := paths["/v1/admin/thing"]; ok {
		t.Fatal("public OpenAPI lists an admin route")
	}
	if _, ok := paths["/v1/admin/openapi.json"]; ok {
		t.Fatal("public OpenAPI lists the admin document")
	}
	if _, ok := paths["/v1/echo"].(map[string]any)["post"]; !ok {
		t.Fatal("public OpenAPI misses /v1/echo")
	}
	if _, ok := k.OpenAPI(true)["paths"].(map[string]map[string]any)["/v1/admin/thing"]; !ok {
		t.Fatal("admin OpenAPI misses admin route")
	}
}

func TestRateLimitReturnsRetryAfter(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	k := testKernel(t, Config{Now: func() time.Time { return now }})
	for i := 0; i < 2; i++ {
		if s := do(t, k, "GET", "/v1/limited", "", "", "").StatusCode; s != 200 {
			t.Fatalf("request %d: %d", i, s)
		}
	}
	resp := do(t, k, "GET", "/v1/limited", "", "", "")
	if resp.StatusCode != 429 || resp.Header.Get("Retry-After") != "30" {
		t.Fatalf("status %d retry-after %q", resp.StatusCode, resp.Header.Get("Retry-After"))
	}
	now = now.Add(31 * time.Second)
	if s := do(t, k, "GET", "/v1/limited", "", "", "").StatusCode; s != 200 {
		t.Fatalf("after refill: %d", s)
	}
}

func TestETagAndNotModified(t *testing.T) {
	k := testKernel(t, Config{})
	req := httptest.NewRequest("GET", "/v1/things/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f", nil)
	req.Header.Set("If-None-Match", `"v1"`)
	rec := httptest.NewRecorder()
	k.Handler().ServeHTTP(rec, req)
	if rec.Code != 304 || rec.Body.Len() != 0 {
		t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
	}
}

func TestMinDurationPadsResponses(t *testing.T) {
	k := testKernel(t, Config{})
	start := time.Now()
	do(t, k, "GET", "/v1/slow", "", "", "")
	if d := time.Since(start); d < 80*time.Millisecond {
		t.Fatalf("response took %v, want at least 80ms", d)
	}
}

func TestDrainRefusesNewRequests(t *testing.T) {
	k := testKernel(t, Config{})
	if err := k.Drain(t.Context()); err != nil {
		t.Fatal(err)
	}
	if s := do(t, k, "GET", "/v1/any", "agent", "", "").StatusCode; s != 503 {
		t.Fatalf("status %d", s)
	}
	if k.Ready() {
		t.Fatal("kernel reports ready while draining")
	}
}

func TestDatabaseUseWithoutDatabaseIsInternal(t *testing.T) {
	k := New(Config{})
	_ = k.Register(mod("demo", nil, func(r *Registry) error {
		r.Route(Route{Method: "GET", Path: "/v1/db", OperationID: "db", Handler: func(c Ctx, _ *Request) (*Response, error) {
			_, err := c.DB().Exec(c, "SELECT 1")
			return nil, err
		}})
		return nil
	}))
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	if s := do(t, k, "GET", "/v1/db", "", "", "").StatusCode; s != 500 {
		t.Fatalf("status %d", s)
	}
}

func TestPublishRequiresDeclaredEventAndValidPayload(t *testing.T) {
	k := New(Config{})
	var undeclared, invalid error
	_ = k.Register(mod("demo", nil, func(r *Registry) error {
		r.Emits(EventDef{Name: "demo.thing.happened", Version: 1, Schema: schema.Object(schema.Req("id", schema.UUID()))})
		r.Route(Route{Method: "GET", Path: "/v1/pub", OperationID: "pub", Handler: func(c Ctx, _ *Request) (*Response, error) {
			undeclared = c.Publish("demo.other.happened", map[string]string{})
			invalid = c.Publish("demo.thing.happened", map[string]string{"id": "nope"})
			return nil, nil
		}})
		return nil
	}))
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	do(t, k, "GET", "/v1/pub", "", "", "")
	if undeclared == nil || !strings.Contains(undeclared.Error(), "undeclared") {
		t.Fatalf("undeclared event accepted: %v", undeclared)
	}
	if invalid == nil || !strings.Contains(invalid.Error(), "schema") {
		t.Fatalf("invalid payload accepted: %v", invalid)
	}
}

func TestModulesIntrospection(t *testing.T) {
	k := testKernel(t, Config{})
	mods := k.Modules()
	if len(mods) != 1 || mods[0].Name != "demo" || len(mods[0].Routes) == 0 {
		t.Fatalf("modules = %+v", mods)
	}
}

func TestMetricsEndpoint(t *testing.T) {
	k := testKernel(t, Config{})
	do(t, k, "GET", "/healthz", "", "", "")
	rec := httptest.NewRecorder()
	k.AdminHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(rec.Body.String(), `em2_http_requests_total{route="health",method="GET",status="200"} 1`) {
		t.Fatalf("metrics:\n%s", rec.Body.String())
	}
}

func TestNewIDIsUUIDv4(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id := NewID()
		if !schema.UUID().ValidString(id) || id[14] != '4' || seen[id] {
			t.Fatalf("bad or duplicate id %s", id)
		}
		seen[id] = true
	}
}

// Shared problem values (ErrUnauthenticated, ErrNotFound, ...) must never be
// mutated per request: concurrent callers would race and could read each
// other's request ids.
func TestConcurrentProblemsDoNotShareState(t *testing.T) {
	k := testKernel(t, Config{})
	const n = 50
	ids := make(chan [2]string, n)
	for i := 0; i < n; i++ {
		go func(i int) {
			path := "/v1/human"
			if i%2 == 0 {
				path = "/v1/nope"
			}
			req := httptest.NewRequest("GET", path, nil)
			rec := httptest.NewRecorder()
			k.Handler().ServeHTTP(rec, req)
			var p Problem
			_ = json.Unmarshal(rec.Body.Bytes(), &p)
			ids <- [2]string{rec.Header().Get("X-Request-Id"), p.Instance}
		}(i)
	}
	for i := 0; i < n; i++ {
		got := <-ids
		if "urn:em2:request:"+got[0] != got[1] {
			t.Fatalf("problem instance %q does not match this response's request id %q", got[1], got[0])
		}
	}
	if ErrUnauthenticated.Instance != "" || ErrNotFound.Instance != "" {
		t.Fatal("a shared problem value was mutated")
	}
}
