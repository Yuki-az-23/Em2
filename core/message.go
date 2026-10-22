package core

import "time"

// Plane is the data plane that carried a message.
type Plane string

const (
	PlaneBus     Plane = "bus"
	PlaneIngress Plane = "ingress"
	PlaneEgress  Plane = "egress"
)

// Direction is relative to the receiving principal.
type Direction string

const (
	Inbound  Direction = "inbound"
	Outbound Direction = "outbound"
)

// RefKind says what a Ref points at.
type RefKind string

const (
	RefPrincipal RefKind = "principal"
	RefChannel   RefKind = "channel"
	RefExternal  RefKind = "external"
)

// Ref points at a sender or receiver. Bridge is filled from the ledger only,
// never from input (ADR-011).
type Ref struct {
	Kind   RefKind `json:"kind"`
	ID     string  `json:"id"`
	Bridge *EC     `json:"-"`
}

// Content is the body of a message. BodyMD is Markdown (ADR-007); large or
// binary bodies are stored and referenced by BodyRef.
type Content struct {
	Mime    string `json:"mime"`
	BodyMD  string `json:"body_md,omitempty"`
	BodyRef string `json:"body_ref,omitempty"`
	SHA256  []byte `json:"sha256"`
	Bytes   int    `json:"bytes"`
	Lang    string `json:"lang,omitempty"`
}

// Provenance records where content came from, as observed by EM2.
type Provenance struct {
	SourceURL    string   `json:"source_url,omitempty"`
	UpstreamHost string   `json:"upstream_host,omitempty"`
	Hops         []string `json:"hops,omitempty"`
}

// Claims is everything a sender or upstream asserted about a message. It is
// UNTRUSTED. Verdicts, ECBridge and the feed must never read it; only the
// dossier builder compares it with what EM2 observed, and the journal records
// it. See ADR-011 and docs/contracts/message.md.
type Claims struct {
	EC        *EC               `json:"ec,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	UserAgent string            `json:"user_agent,omitempty"`
	Upstream  string            `json:"upstream,omitempty"`
}

// Message is the canonical unit of communication. Every adapter normalizes
// its protocol payload into a Message before the rest of EM2 sees it.
//
// Every field except Claims is trusted: filled by EM2 from authentication,
// the ledger and its own computation.
type Message struct {
	ID         string     `json:"id"`
	At         time.Time  `json:"at"`
	Plane      Plane      `json:"plane"`
	Direction  Direction  `json:"direction"`
	Sender     Ref        `json:"sender"`
	Receiver   Ref        `json:"receiver"`
	ChannelID  string     `json:"channel_id,omitempty"`
	ParentID   string     `json:"parent_id,omitempty"`
	Stance     *EC        `json:"stance,omitempty"` // sender's ledger bridge at send time; nil if unauthenticated
	Content    Content    `json:"content"`
	Provenance Provenance `json:"provenance"`
	Claims     Claims     `json:"claims"`
}
