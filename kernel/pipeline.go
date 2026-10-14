package kernel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"regexp"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/pkg/schema"
)

const defaultMaxBody = 1 << 20

var (
	pathParamRe = regexp.MustCompile(`\{([a-z_][a-z0-9_]*)\}`)
	methods     = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true}
)

// setBaseHeaders applies the headers every response carries. Go's server
// adds no Server header; nothing here names the software or its version.
func setBaseHeaders(w http.ResponseWriter, requestID string) {
	h := w.Header()
	h.Set("X-Request-Id", requestID)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
	h.Set("Cache-Control", "no-store")
}

func (k *Kernel) buildMux() (err error) {
	mux := http.NewServeMux()
	seen := map[string]bool{}
	defer func() {
		// ServeMux panics on conflicting patterns; report it as a boot error.
		if r := recover(); r != nil {
			err = fmt.Errorf("route conflict: %v", r)
		}
	}()
	for _, rt := range k.routes {
		if !methods[rt.Method] {
			return fmt.Errorf("%s: route %s has invalid method %q", rt.module, rt.OperationID, rt.Method)
		}
		if !strings.HasPrefix(rt.Path, "/") || rt.OperationID == "" || rt.Handler == nil {
			return fmt.Errorf("%s: route %q needs a path, an operation id and a handler", rt.module, rt.Path)
		}
		key := rt.Method + " " + rt.Path
		if rt.Idempotent && (rt.Auth == AuthNone || rt.Method != "POST") {
			return fmt.Errorf("%s: idempotent route %s must be an authenticated POST", rt.module, key)
		}
		if seen[key] {
			return fmt.Errorf("%s: duplicate route %s", rt.module, key)
		}
		seen[key] = true
		for _, m := range pathParamRe.FindAllStringSubmatch(rt.Path, -1) {
			if rt.Params == nil || rt.Params[m[1]] == nil {
				return fmt.Errorf("%s: route %s does not declare path parameter %s", rt.module, key, m[1])
			}
		}
		mux.Handle(key, k.wrap(rt))
	}
	// Anything else, including a known path with the wrong method, is the same
	// generic 404, so the route table cannot be mapped by probing.
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newRequestID()
		setBaseHeaders(w, id)
		writeProblem(w, ErrNotFound.WithDetail(""), id)
		k.metrics.observe("unmatched", r.Method, http.StatusNotFound, 0)
	}))
	k.mux = mux
	return nil
}

type recorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (r *recorder) WriteHeader(code int) {
	if !r.wrote {
		r.status, r.wrote = code, true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.status, r.wrote = http.StatusOK, true
	}
	return r.ResponseWriter.Write(b)
}

func (k *Kernel) clientIP(r *http.Request) string {
	if k.cfg.TrustProxy {
		if k.cfg.ClientIPHeader != "" {
			if ip := strings.TrimSpace(r.Header.Get(k.cfg.ClientIPHeader)); net.ParseIP(ip) != nil {
				return ip
			}
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[len(parts)-1]); net.ParseIP(ip) != nil {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// wrap builds the request pipeline for one route:
// headers → drain check → auth → scope → rate limit → params → query → body
// → handler in a scoped transaction → commit → padded response.
func (k *Kernel) wrap(rt *Route) http.Handler {
	maxBody := rt.MaxBody
	if maxBody <= 0 {
		maxBody = defaultMaxBody
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		id := newRequestID()
		rec := &recorder{ResponseWriter: w, status: http.StatusOK}
		setBaseHeaders(rec, id)
		var principal *core.Principal
		k.inflight.Add(1)
		defer func() {
			if p := recover(); p != nil {
				k.log.Error("panic in handler", "request_id", id, "route", rt.OperationID, "panic", fmt.Sprint(p), "stack", string(debug.Stack()))
				if !rec.wrote {
					writeProblem(rec, ErrInternal.WithDetail(""), id)
				}
			}
			k.inflight.Done()
			dur := time.Since(start)
			k.metrics.observe(rt.OperationID, rt.Method, rec.status, dur)
			kind := ""
			if principal != nil {
				kind = string(principal.Kind)
			}
			k.log.Info("http", "request_id", id, "method", r.Method, "route", rt.OperationID, "status", rec.status,
				"duration_ms", dur.Milliseconds(), "principal_kind", kind)
		}()

		fail := func(p *Problem) {
			k.pad(r.Context(), start, rt.MinDuration)
			writeProblem(rec, p, id)
		}
		if k.draining.Load() {
			fail(ErrUnavailable.WithDetail(""))
			return
		}
		ip := k.clientIP(r)

		// Authentication. Every failure is the same generic 401.
		if rt.Auth != AuthNone {
			cred := bearer(r)
			if cred == "" || k.auth == nil {
				fail(ErrUnauthenticated)
				return
			}
			p, err := k.authenticate(r.Context(), cred, id)
			if err != nil || p == nil {
				if err != nil {
					if _, internal := asProblem(err); internal {
						k.log.Error("authenticator error", "request_id", id, "error", err)
					}
				}
				fail(ErrUnauthenticated)
				return
			}
			principal = p
			switch {
			case rt.Auth == AuthAdmin && !(p.Kind == core.KindHuman && p.HasRole("admin")):
				// Admin routes are invisible to everyone else.
				fail(ErrNotFound)
				return
			case rt.Auth == AuthHuman && p.Kind != core.KindHuman:
				fail(ErrForbidden)
				return
			case !p.HasScope(rt.Scope):
				fail(ErrForbidden)
				return
			}
		}

		if rt.RateLimit != nil {
			key := rt.OperationID + "|ip:" + ip
			if principal != nil {
				key = rt.OperationID + "|p:" + principal.ID
			}
			if ok, retry := k.limiter.allow(key, *rt.RateLimit); !ok {
				k.metrics.rateLimited.Add(1)
				p := *ErrRateLimited
				p.RetryAfter = retry
				fail(&p)
				return
			}
		}

		params := map[string]string{}
		for name, s := range rt.Params {
			v := r.PathValue(name)
			if !s.ValidString(v) {
				fail(ErrNotFound)
				return
			}
			params[name] = v
		}

		query := r.URL.Query()
		if rt.Query != nil {
			if errs := validateQuery(rt.Query, query); len(errs) > 0 {
				fail(Validation(errs))
				return
			}
		} else if len(query) > 0 {
			fail(BadRequest("This operation takes no query parameters."))
			return
		}

		var body []byte
		if rt.Body != nil {
			mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mt != "application/json" {
				fail(ErrUnsupportedMedia)
				return
			}
			body, err = io.ReadAll(http.MaxBytesReader(rec, r.Body, maxBody))
			if err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					fail(ErrPayloadTooLarge)
				} else {
					fail(BadRequest("The request body could not be read."))
				}
				return
			}
			if errs := rt.Body.ValidateJSON(body); len(errs) > 0 {
				fail(Validation(errs))
				return
			}
		} else if len(rt.RawBody) > 0 {
			mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || !slices.Contains(rt.RawBody, mt) {
				fail(ErrUnsupportedMedia.WithDetail("Send one of: " + strings.Join(rt.RawBody, ", ") + "."))
				return
			}
			body, err = io.ReadAll(http.MaxBytesReader(rec, r.Body, maxBody))
			if err != nil {
				var mbe *http.MaxBytesError
				if errors.As(err, &mbe) {
					fail(ErrPayloadTooLarge)
				} else {
					fail(BadRequest("The request body could not be read."))
				}
				return
			}
		}

		var idem *idemRequest
		if rt.Idempotent {
			key := r.Header.Get("Idempotency-Key")
			if !idemKeyRe.MatchString(key) {
				fail(BadRequest("This operation needs an Idempotency-Key header: 1 to 128 letters, digits, '-' or '_'."))
				return
			}
			idem = &idemRequest{principal: principal.ID, route: rt.OperationID, key: key, hash: requestHash(r, body)}
			prev, err := k.idemLookup(r.Context(), idem)
			if err != nil {
				k.log.Error("idempotency lookup failed", "request_id", id, "error", err)
				fail(ErrInternal.WithDetail(""))
				return
			}
			if prev != nil {
				k.pad(r.Context(), start, rt.MinDuration)
				k.writeStored(rec, prev, idem)
				return
			}
		}

		req := &Request{Params: params, Query: query, Body: body, Header: r.Header, IP: ip, RequestID: id, Raw: r}
		c := k.newCtx(r.Context(), rt.module, principal, id)
		resp, err := rt.Handler(c, req)
		var ac committed
		if errors.As(err, &ac) {
			if _, cErr := c.tx.finish(true); cErr != nil {
				k.log.Error("commit failed", "request_id", id, "route", rt.OperationID, "error", cErr)
				fail(ErrInternal.WithDetail(""))
				return
			}
			p := *ac.p
			fail(&p)
			return
		}
		if err != nil {
			if _, rbErr := c.tx.finish(false); rbErr != nil {
				k.log.Error("rollback failed", "request_id", id, "error", rbErr)
			}
			p, internal := asProblem(err)
			if internal {
				k.log.Error("request failed", "request_id", id, "route", rt.OperationID, "error", err)
			}
			fail(p)
			return
		}
		if resp == nil {
			resp = NoContent()
		}
		if idem != nil {
			stored, err := k.idemRecord(c, idem, resp)
			if err != nil {
				_, _ = c.tx.finish(false)
				k.log.Error("idempotency record failed", "request_id", id, "error", err)
				fail(ErrInternal.WithDetail(""))
				return
			}
			if !stored {
				// A concurrent request with the same key finished first: drop
				// ours and replay theirs.
				_, _ = c.tx.finish(false)
				prev, err := k.idemLookup(r.Context(), idem)
				if err != nil || prev == nil {
					fail(ErrConflict.WithDetail("A request with this Idempotency-Key is in progress."))
					return
				}
				k.pad(r.Context(), start, rt.MinDuration)
				k.writeStored(rec, prev, idem)
				return
			}
		}
		committed, err := c.tx.finish(true)
		if err != nil {
			k.log.Error("commit failed", "request_id", id, "route", rt.OperationID, "error", err)
			fail(ErrInternal.WithDetail(""))
			return
		}
		if committed && len(c.published) > 0 {
			k.metrics.published.Add(uint64(len(c.published)))
			k.nudge()
		}
		k.pad(r.Context(), start, rt.MinDuration)
		k.writeResponse(rec, r, resp)
	})
}

// pad sleeps until at least min has passed since start, so response time does
// not reveal which branch a request took (ADR-011).
func (k *Kernel) pad(ctx context.Context, start time.Time, min time.Duration) {
	if min <= 0 {
		return
	}
	if d := min - time.Since(start); d > 0 {
		t := time.NewTimer(d)
		defer t.Stop()
		select {
		case <-t.C:
		case <-ctx.Done():
		}
	}
}

func (k *Kernel) writeResponse(w http.ResponseWriter, r *http.Request, resp *Response) {
	h := w.Header()
	for name, v := range resp.Headers {
		h.Set(name, v)
	}
	if resp.Location != "" {
		h.Set("Location", resp.Location)
	}
	status := resp.Status
	if status == 0 {
		status = http.StatusOK
	}
	if resp.ETag != "" {
		tag := `"` + resp.ETag + `"`
		h.Set("ETag", tag)
		if r.Method == http.MethodGet && etagMatch(r.Header.Get("If-None-Match"), tag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	if resp.Raw != nil {
		h.Set("Content-Type", resp.ContentType)
		w.WriteHeader(status)
		_, _ = w.Write(resp.Raw)
		return
	}
	if resp.Body == nil || status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	b, err := json.Marshal(resp.Body)
	if err != nil {
		k.log.Error("encode response", "error", err)
		writeProblem(w, ErrInternal.WithDetail(""), h.Get("X-Request-Id"))
		return
	}
	h.Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(append(b, '\n'))
}

func etagMatch(header, tag string) bool {
	for _, t := range strings.Split(header, ",") {
		t = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), "W/"))
		if t == tag || t == "*" {
			return true
		}
	}
	return false
}

// validateQuery converts query values to the property types of s and validates.
func validateQuery(s *schema.Schema, q map[string][]string) schema.Errors {
	m := map[string]any{}
	var errs schema.Errors
	for name, vals := range q {
		ptr := "/" + name
		if len(vals) != 1 {
			errs = append(errs, schema.FieldError{Pointer: ptr, Detail: "must be given once"})
			continue
		}
		prop := s.Properties[name]
		if prop == nil {
			m[name] = vals[0] // the closed-object check reports it
			continue
		}
		switch prop.Type {
		case "integer", "number":
			if _, err := strconv.ParseFloat(vals[0], 64); err != nil {
				errs = append(errs, schema.FieldError{Pointer: ptr, Detail: "must be a " + prop.Type})
				continue
			}
			m[name] = json.Number(vals[0])
		case "boolean":
			b, err := strconv.ParseBool(vals[0])
			if err != nil {
				errs = append(errs, schema.FieldError{Pointer: ptr, Detail: "must be true or false"})
				continue
			}
			m[name] = b
		default:
			m[name] = vals[0]
		}
	}
	return append(errs, s.Validate(m)...)
}

// authenticate runs the registered authenticator in its module's transaction.
func (k *Kernel) authenticate(ctx context.Context, cred, requestID string) (*core.Principal, error) {
	var p *core.Principal
	err := k.runInTx(ctx, k.authModule, nil, requestID, func(c *execCtx) error {
		var err error
		p, err = k.auth(c, cred)
		return err
	})
	return p, err
}
