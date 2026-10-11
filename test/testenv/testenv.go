// Package testenv starts real EM2 instances for integration and smoke tests:
// a fresh Postgres database per test, real migrations, role isolation on, the
// outbox dispatcher running, and an HTTP test server in front of the kernel.
package testenv

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"em2.social/em2/internal/app"
	"em2.social/em2/kernel"
)

// DatabaseURL returns EM2_TEST_DATABASE_URL or skips the test.
func DatabaseURL(t testing.TB) string {
	t.Helper()
	u := os.Getenv("EM2_TEST_DATABASE_URL")
	if u == "" {
		t.Skip("EM2_TEST_DATABASE_URL not set; run `eval \"$(scripts/test-db.sh start)\"`")
	}
	return u
}

// NewDatabase creates an empty database for one test and drops it afterwards.
func NewDatabase(t testing.TB) string {
	t.Helper()
	base := DatabaseURL(t)
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connect to test database server: %v", err)
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	name := "em2_t_" + hex.EncodeToString(b)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		_ = admin.Close(context.Background())
	})
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	return u.String()
}

// Options adjust an instance.
type Options struct {
	Extra      []kernel.Module // registered next to the real modules
	NoMigrate  bool
	LogHandler slog.Handler
	MaxConns   int32          // database pool size; 0 keeps the pgx default
	Mode       kernel.RunMode // default shadow, as in production
}

// Instance is a running EM2.
type Instance struct {
	T      testing.TB
	URL    string
	Kernel *kernel.Kernel
	Pool   *pgxpool.Pool
	Client *http.Client
}

// TestConfig is the configuration every test instance uses.
func TestConfig(dbURL string) app.Config {
	return app.Config{
		DatabaseURL:      dbURL,
		SigningKey:       bytes.Repeat([]byte{7}, 32),
		KeyPepper:        bytes.Repeat([]byte{9}, 32),
		Mode:             kernel.ModeShadow,
		RoleIsolation:    true,
		FastHashing:      true,
		DispatchInterval: 20 * time.Millisecond,
	}
}

// Start boots an instance on a fresh database.
func Start(t testing.TB, opt Options) *Instance {
	t.Helper()
	cfg := TestConfig(NewDatabase(t))
	cfg.MediaDir = t.TempDir()
	if opt.Mode != "" {
		cfg.Mode = opt.Mode
	}
	ctx := context.Background()
	pcfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if opt.MaxConns > 0 {
		pcfg.MaxConns = opt.MaxConns
	}
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	mods, err := app.Modules(cfg)
	if err != nil {
		t.Fatal(err)
	}
	h := opt.LogHandler
	if h == nil {
		h = slog.NewJSONHandler(io.Discard, nil)
	}
	k := kernel.New(kernel.Config{Pool: pool, Mode: cfg.Mode, Logger: slog.New(h), RoleIsolation: true, DispatchInterval: cfg.DispatchInterval})
	if err := k.Register(append(mods, opt.Extra...)...); err != nil {
		t.Fatal(err)
	}
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	if !opt.NoMigrate {
		if _, err := k.Migrate(ctx); err != nil {
			t.Fatalf("migrate: %v", err)
		}
	}
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { k.Run(runCtx); close(done) }()
	srv := httptest.NewServer(k.Handler())
	t.Cleanup(func() { srv.Close(); cancel(); <-done })
	return &Instance{T: t, URL: srv.URL, Kernel: k, Pool: pool, Client: srv.Client()}
}

// Response is a decoded HTTP response.
type Response struct {
	Status int
	Header http.Header
	Raw    []byte
	JSON   map[string]any
	Took   time.Duration
}

// Str returns a top-level string field.
func (r *Response) Str(key string) string {
	s, _ := r.JSON[key].(string)
	return s
}

// Do sends a request. body may be nil, a string (sent as is) or any value
// (sent as JSON).
func (in *Instance) Do(method, path, token string, body any) *Response {
	in.T.Helper()
	return in.DoWith(method, path, token, body, nil)
}

// DoRaw sends a raw body with the given content type.
func (in *Instance) DoRaw(method, path, token, contentType string, body []byte) *Response {
	in.T.Helper()
	return in.send(method, path, token, bytes.NewReader(body), map[string]string{"Content-Type": contentType})
}

// DoWith is Do with extra request headers.
func (in *Instance) DoWith(method, path, token string, body any, headers map[string]string) *Response {
	in.T.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(b)
	default:
		buf, err := json.Marshal(b)
		if err != nil {
			in.T.Fatal(err)
		}
		rd = bytes.NewReader(buf)
	}
	h := map[string]string{}
	if rd != nil {
		h["Content-Type"] = "application/json"
	}
	for k, v := range headers {
		h[k] = v
	}
	return in.send(method, path, token, rd, h)
}

func (in *Instance) send(method, path, token string, rd io.Reader, headers map[string]string) *Response {
	in.T.Helper()
	req, err := http.NewRequest(method, in.URL+path, rd)
	if err != nil {
		in.T.Fatal(err)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	start := time.Now()
	resp, err := in.Client.Do(req)
	if err != nil {
		in.T.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := &Response{Status: resp.StatusCode, Header: resp.Header, Raw: raw, Took: time.Since(start)}
	_ = json.Unmarshal(raw, &out.JSON)
	return out
}

// Must fails the test unless the response has the wanted status.
func (in *Instance) Must(r *Response, status int) *Response {
	in.T.Helper()
	if r.Status != status {
		in.T.Fatalf("status %d, want %d: %s", r.Status, status, r.Raw)
	}
	return r
}

// Human registers a human and returns the access and refresh tokens and the id.
func (in *Instance) Human(handle string) (access, refresh, id string) {
	in.T.Helper()
	r := in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{
		"email": handle + "@example.org", "password": "correct horse battery staple", "handle": handle}), 201)
	tok := r.JSON["tokens"].(map[string]any)
	p := r.JSON["principal"].(map[string]any)
	return tok["access_token"].(string), tok["refresh_token"].(string), p["id"].(string)
}

// Agent creates an agent for the human and issues a key.
func (in *Instance) Agent(humanToken, handle string, scopes ...string) (agentID, key string) {
	in.T.Helper()
	body := map[string]any{"handle": handle, "name": "Agent " + handle}
	if len(scopes) > 0 {
		body["scopes"] = scopes
	}
	a := in.Must(in.Do("POST", "/v1/me/agents", humanToken, body), 201)
	agentID = a.Str("id")
	k := in.Must(in.Do("POST", "/v1/me/agents/"+agentID+"/keys", humanToken, map[string]any{}), 201)
	return agentID, k.Str("key")
}

// Eventually polls cond until it is true or the timeout passes.
func Eventually(t testing.TB, timeout time.Duration, cond func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cond()
}
