package kernel

import (
	"context"
	"net/http"
	"sync"
	"time"

	"em2.social/em2/pkg/schema"
)

// readiness caches the database and migration check for a few seconds so a
// busy probe cannot become load.
type readiness struct {
	mu    sync.Mutex
	at    time.Time
	ready bool
}

func (k *Kernel) registerBuiltins() {
	reg := func(rt Route) { rt.module = "kernel"; k.routes = append(k.routes, &rt) }
	var rd readiness

	// Liveness and readiness carry no versions or internal detail (ADR-011).
	reg(Route{Method: "GET", Path: "/healthz", OperationID: "health", Summary: "Process is alive", Tags: []string{"ops"},
		Responses: map[int]*schema.Schema{200: nil},
		Handler: func(Ctx, *Request) (*Response, error) {
			return JSON(http.StatusOK, map[string]string{"status": "ok"}), nil
		}})
	reg(Route{Method: "GET", Path: "/readyz", OperationID: "ready", Summary: "Ready to serve traffic", Tags: []string{"ops"},
		Responses: map[int]*schema.Schema{200: nil, 503: nil},
		Handler: func(c Ctx, _ *Request) (*Response, error) {
			if k.isReady(c, &rd) {
				return JSON(http.StatusOK, map[string]string{"status": "ready"}), nil
			}
			return JSON(http.StatusServiceUnavailable, map[string]string{"status": "not ready"}), nil
		}})
	reg(Route{Method: "GET", Path: "/v1/openapi.json", OperationID: "getOpenAPI", Summary: "Public API description", Tags: []string{"meta"},
		Responses: map[int]*schema.Schema{200: nil},
		Handler: func(Ctx, *Request) (*Response, error) {
			return &Response{Status: http.StatusOK, Body: k.OpenAPI(false), Headers: map[string]string{"Cache-Control": "public, max-age=300"}}, nil
		}})
	reg(Route{Method: "GET", Path: "/v1/admin/openapi.json", OperationID: "getAdminOpenAPI", Summary: "Full API description", Tags: []string{"admin"},
		Auth: AuthAdmin, Responses: map[int]*schema.Schema{200: nil},
		Handler: func(Ctx, *Request) (*Response, error) { return JSON(http.StatusOK, k.OpenAPI(true)), nil }})
	reg(Route{Method: "GET", Path: "/v1/admin/modules", OperationID: "listModules", Summary: "Registered modules, routes, events and jobs", Tags: []string{"admin"},
		Auth: AuthAdmin, Responses: map[int]*schema.Schema{200: nil},
		Handler: func(c Ctx, _ *Request) (*Response, error) {
			pending, err := k.PendingMigrations(c)
			if err != nil && err != ErrNoDatabase {
				return nil, err
			}
			return JSON(http.StatusOK, map[string]any{"mode": k.cfg.Mode, "modules": k.Modules(), "pending_migrations": nonNil(pending)}), nil
		}})
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func (k *Kernel) isReady(ctx context.Context, rd *readiness) bool {
	if !k.Ready() {
		return false
	}
	if k.cfg.Pool == nil {
		return true
	}
	rd.mu.Lock()
	defer rd.mu.Unlock()
	if time.Since(rd.at) < 5*time.Second {
		return rd.ready
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	ok := k.cfg.Pool.Ping(ctx) == nil
	if ok {
		pending, err := k.PendingMigrations(ctx)
		ok = err == nil && len(pending) == 0
	}
	rd.at, rd.ready = time.Now(), ok
	return ok
}
