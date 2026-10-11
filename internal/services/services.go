// Package services declares the interfaces modules provide to each other
// through the kernel registry (kernel.Resolve). It holds interfaces and plain
// data types only, so a module never imports another module's package.
package services

import (
	"context"
	"net/http"
	"time"

	"em2.social/em2/core"
)

// PublicPrincipal is what anyone may know about a principal.
type PublicPrincipal struct {
	ID     string             `json:"id"`
	Handle string             `json:"handle"`
	Kind   core.PrincipalKind `json:"kind"`
}

// Directory resolves principals to their public card. Provided by identity.
type Directory interface {
	Public(ctx context.Context, ids []string) (map[string]PublicPrincipal, error)
}

// Stances reads a principal's current bridge. Provided by ledger. The result
// is the sender's stance: what a message they send starts from (ADR-011).
// It returns nil when the principal has not set a bridge.
type Stances interface {
	Stance(ctx context.Context, principalID string) (*core.EC, error)
}

// ReceiverSettings is what the verdict needs about one receiver. Provided by
// ledger. Threshold and Filter carry the defaults when the receiver has not
// changed them.
type ReceiverSettings struct {
	Bridge       *core.EC
	Threshold    float64
	Filter       bool
	BlocksSender bool // the receiver blocked the sender asked about
}

// Receivers reads receivers' bridges, settings and blocks. Provided by ledger.
type Receivers interface {
	Receivers(ctx context.Context, ids []string, senderID string) (map[string]ReceiverSettings, error)
}

// Endpoint is a principal's registered ingress upstream. Provided by ledger.
type Endpoint struct {
	PrincipalID string
	URL         string
}

// Endpoints looks up ingress upstreams. Provided by ledger.
type Endpoints interface {
	Endpoint(ctx context.Context, principalID string) (*Endpoint, error)
}

// MessageView is a stored message as its readers see it. Provided by ingest.
type MessageView struct {
	ID         string          `json:"id"`
	Plane      core.Plane      `json:"plane"`
	ChannelID  string          `json:"channel_id,omitempty"`
	ReceiverID string          `json:"receiver_id,omitempty"`
	ParentID   string          `json:"parent_id,omitempty"`
	Author     PublicPrincipal `json:"author"`
	At         time.Time       `json:"at"`
	State      *core.EC        `json:"state,omitempty"`
	BodyMD     string          `json:"body_md"`
	BodyHTML   string          `json:"body_html"`
}

// DirectMessage is a message addressed to one principal rather than a
// channel: ingress requests, upstream replies and egress fetches.
type DirectMessage struct {
	ID         string // optional; generated when empty
	Plane      core.Plane
	Sender     core.Principal // authenticated sender; for egress, the fetching agent
	External   string         // egress: the origin URL; the sender then has no stance
	ReceiverID string
	ParentID   string
	BodyMD     string
	Mime       string
	Header     http.Header // request headers kept as claims
}

// Messages reads and accepts messages. Provided by ingest.
type Messages interface {
	Views(ctx context.Context, ids []string) (map[string]MessageView, error)
	// AcceptDirect normalizes and stores a direct message and returns its id.
	// It runs the same pipeline as a bus publish: dossier, assessment, verdict.
	AcceptDirect(ctx context.Context, m DirectMessage) (string, error)
}

// Exchanges records what adapters did with a delivered exchange. Provided by
// verdict.
type Exchanges interface {
	Responded(ctx context.Context, exchangeID string, upstreamStatus int, latency time.Duration) error
}

// Handles resolves a handle to an active principal. Provided by identity.
// It returns nil when no active principal has the handle.
type Handles interface {
	ByHandle(ctx context.Context, handle string) (*PublicPrincipal, error)
}
