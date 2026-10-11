package kernel

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"em2.social/em2/pkg/schema"
)

// AuthMode says who may call a route.
type AuthMode int

const (
	AuthNone      AuthMode = iota // anyone
	AuthPrincipal                 // any authenticated human or agent
	AuthHuman                     // authenticated humans only
	AuthAdmin                     // humans with the admin role; listed only in the admin OpenAPI document
)

func (a AuthMode) String() string {
	return [...]string{"none", "principal", "human", "admin"}[a]
}

// RateLimit allows Burst requests, refilled evenly over Per.
type RateLimit struct {
	Burst int
	Per   time.Duration
}

// Route is one HTTP operation.
type Route struct {
	Method      string // GET, POST, PUT, PATCH, DELETE
	Path        string // net/http pattern path, e.g. /v1/me/agents/{id}
	OperationID string
	Summary     string
	Tags        []string
	Auth        AuthMode
	Scope       string                    // required agent scope; humans hold all scopes
	Params      map[string]*schema.Schema // path parameters; a mismatch is a 404, never a 400
	Query       *schema.Schema            // object schema of string/integer/boolean properties
	Body        *schema.Schema            // JSON request body; nil means none accepted
	RawBody     []string                  // with Body nil: accept these media types as an unparsed body of at most MaxBody bytes
	MaxBody     int64                     // bytes; default 1 MiB
	Responses   map[int]*schema.Schema    // documented success responses; nil schema means no body
	RateLimit   *RateLimit                // per principal (or per IP when unauthenticated)
	MinDuration time.Duration             // pad the response to at least this long (ADR-011)
	Idempotent  bool                      // require an Idempotency-Key header and replay the first result on retry
	Handler     HandlerFunc

	module string
}

// HandlerFunc handles a validated request.
type HandlerFunc func(ctx Ctx, req *Request) (*Response, error)

// Request is the validated input.
type Request struct {
	Params    map[string]string
	Query     url.Values
	Body      json.RawMessage
	Header    http.Header
	IP        string
	RequestID string
	Raw       *http.Request // for streaming bodies only
}

// Decode unmarshals the (already validated) body.
func (r *Request) Decode(v any) error { return json.Unmarshal(r.Body, v) }

// Response is what a handler returns.
type Response struct {
	Status   int
	Body     any
	Location string
	ETag     string // without quotes; the kernel adds them and handles If-None-Match
	Headers  map[string]string
	// Raw, when non-nil, is written as the body with ContentType instead of
	// encoding Body as JSON (binary downloads).
	Raw         []byte
	ContentType string
}

// JSON builds a response with a JSON body.
func JSON(status int, body any) *Response { return &Response{Status: status, Body: body} }

// NoContent builds a 204.
func NoContent() *Response { return &Response{Status: http.StatusNoContent} }
