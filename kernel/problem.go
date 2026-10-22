package kernel

import (
	"encoding/json"
	"errors"
	"net/http"

	"em2.social/em2/pkg/schema"
)

// ProblemBase is the type URI prefix for problem+json responses.
const ProblemBase = "https://em2.social/problems/"

// Problem is an RFC 9457 problem. Every public error EM2 returns is one.
// Title and Detail must be safe to show to anyone: they never contain error
// strings, SQL, stack traces, versions or another principal's data (ADR-011).
type Problem struct {
	Code   string              `json:"-"`
	Type   string              `json:"type"`
	Title  string              `json:"title"`
	Status int                 `json:"status"`
	Detail string              `json:"detail,omitempty"`
	Errors []schema.FieldError `json:"errors,omitempty"`
	// Instance is the request id, so a caller can quote it and an operator can
	// find the internal log line.
	Instance string `json:"instance,omitempty"`
	// RetryAfter, in seconds, is sent as a header for rate-limited responses.
	RetryAfter int `json:"-"`
}

func (p *Problem) Error() string { return p.Code + ": " + p.Title }

func newProblem(status int, code, title string) *Problem {
	return &Problem{Code: code, Type: ProblemBase + code, Title: title, Status: status}
}

// WithDetail returns a copy with a safe, human-readable detail.
func (p *Problem) WithDetail(d string) *Problem { c := *p; c.Detail = d; return &c }

// Standard problems. Handlers return these (optionally WithDetail).
var (
	ErrUnauthenticated    = newProblem(http.StatusUnauthorized, "unauthenticated", "Authentication required")
	ErrForbidden          = newProblem(http.StatusForbidden, "forbidden", "Not allowed")
	ErrNotFound           = newProblem(http.StatusNotFound, "not-found", "Not found")
	ErrConflict           = newProblem(http.StatusConflict, "conflict", "Conflict")
	ErrPreconditionFailed = newProblem(http.StatusPreconditionFailed, "precondition-failed", "Precondition failed")
	ErrRateLimited        = newProblem(http.StatusTooManyRequests, "rate-limited", "Too many requests")
	ErrPayloadTooLarge    = newProblem(http.StatusRequestEntityTooLarge, "payload-too-large", "Request body too large")
	ErrUnsupportedMedia   = newProblem(http.StatusUnsupportedMediaType, "unsupported-media-type", "Request body must be application/json")
	ErrDenied             = newProblem(http.StatusForbidden, "denied", "Denied")
	ErrUnavailable        = newProblem(http.StatusServiceUnavailable, "unavailable", "Service unavailable")
	ErrUpstream           = newProblem(http.StatusBadGateway, "upstream-unavailable", "The remote server could not be reached")
	ErrInternal           = newProblem(http.StatusInternalServerError, "internal", "An error occurred. Please try again.")
)

// Validation builds a 400 from schema errors.
func Validation(errs schema.Errors) *Problem {
	p := newProblem(http.StatusBadRequest, "validation", "Invalid request")
	p.Errors = errs
	return p
}

// BadRequest is a 400 with a safe detail.
func BadRequest(detail string) *Problem {
	return newProblem(http.StatusBadRequest, "validation", "Invalid request").WithDetail(detail)
}

// committed wraps a problem whose transaction must still commit, for example
// recording a security event (revoking a token family) while refusing the request.
type committed struct{ p *Problem }

func (c committed) Error() string { return c.p.Error() }
func (c committed) Unwrap() error { return c.p }

// AfterCommit returns an error that makes the kernel commit the handler's
// transaction and then respond with p.
func AfterCommit(p *Problem) error { return committed{p} }

// asProblem returns the problem for err. Anything that is not a *Problem is an
// internal error: its text is never shown to the caller.
func asProblem(err error) (p *Problem, internal bool) {
	var pr *Problem
	if errors.As(err, &pr) {
		c := *pr
		return &c, false
	}
	c := *ErrInternal
	return &c, true
}

// writeProblem writes a copy of p stamped with the request id. It never
// mutates p, because callers pass shared values such as ErrNotFound.
func writeProblem(w http.ResponseWriter, shared *Problem, requestID string) {
	c := *shared
	p := &c
	p.Instance = "urn:em2:request:" + requestID
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	if p.RetryAfter > 0 {
		w.Header().Set("Retry-After", itoa(p.RetryAfter))
	}
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}
