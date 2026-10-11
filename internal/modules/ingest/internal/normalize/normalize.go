// Package normalize turns protocol payloads into canonical core.Messages.
// Each plane gets one function. M2 ships the bus; ingress and egress
// normalizers arrive with their adapters in M3.
//
// The trust boundary (ADR-011) is enforced here: identity, stance and content
// hashes come from EM2; everything the sender asserts goes into Claims and
// nowhere else.
package normalize

import (
	"crypto/sha256"
	"net/http"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/pkg/markdown"
)

// BusInput is a message published on the native bus.
type BusInput struct {
	ID        string
	At        time.Time
	Sender    core.Principal // authenticated
	Stance    *core.EC       // from the ledger; nil if unset
	ChannelID string
	ParentID  string
	BodyMD    string
	Claim     *core.EC    // "claims" field of the request body, if any
	Header    http.Header // request headers
}

// headerAllow lists request headers kept as claims, with their value cap.
var headerAllow = []string{"User-Agent", "EM2-Emotion", "EM2-Color", "EM2-Client"}

const headerCap = 256

// Bus normalizes a bus publish. The returned Doc is the parsed body.
func Bus(in BusInput) (core.Message, *markdown.Doc, error) {
	body := strings.TrimSpace(strings.ReplaceAll(in.BodyMD, "\r\n", "\n"))
	doc, err := markdown.Parse(body)
	if err != nil {
		return core.Message{}, nil, err
	}
	sum := sha256.Sum256([]byte(body))
	m := core.Message{
		ID:        in.ID,
		At:        in.At.UTC(),
		Plane:     core.PlaneBus,
		Direction: core.Inbound,
		Sender:    core.Ref{Kind: core.RefPrincipal, ID: in.Sender.ID},
		Receiver:  core.Ref{Kind: core.RefChannel, ID: in.ChannelID},
		ChannelID: in.ChannelID,
		ParentID:  in.ParentID,
		Stance:    in.Stance,
		Content:   core.Content{Mime: "text/markdown", BodyMD: body, SHA256: sum[:], Bytes: len(body)},
	}
	if in.Stance != nil {
		s := *in.Stance
		m.Sender.Bridge = &s
	}

	claims := core.Claims{Headers: map[string]string{}}
	for _, h := range headerAllow {
		if v := in.Header.Get(h); v != "" {
			if len(v) > headerCap {
				v = v[:headerCap]
			}
			claims.Headers[h] = v
		}
	}
	claims.UserAgent = claims.Headers["User-Agent"]
	// Precedence: explicit body claim, then headers, then the first emotion fence.
	switch {
	case in.Claim != nil:
		c := *in.Claim
		claims.EC = &c
	case claims.Headers["EM2-Emotion"] != "" && claims.Headers["EM2-Color"] != "":
		e, err1 := core.ParseEmotion(claims.Headers["EM2-Emotion"])
		c, err2 := core.ParseColor(claims.Headers["EM2-Color"])
		if err1 == nil && err2 == nil {
			claims.EC = &core.EC{Emotion: e, Color: c}
		}
	case len(doc.Claims) > 0:
		c := doc.Claims[0]
		claims.EC = &c
	}
	if len(claims.Headers) == 0 {
		claims.Headers = nil
	}
	m.Claims = claims
	return m, doc, nil
}

// DirectInput is a message addressed to one principal: an ingress request,
// an upstream's reply, or content an agent fetched through egress.
type DirectInput struct {
	ID         string
	At         time.Time
	Plane      core.Plane
	Sender     core.Principal // authenticated sender, or the fetching agent for egress
	Stance     *core.EC       // nil for egress content: its emotion is not known
	External   string         // egress origin URL
	ReceiverID string
	ParentID   string
	BodyMD     string
	Header     http.Header
}

// Direct normalizes a direct message. Header values become claims exactly as
// on the bus.
func Direct(in DirectInput) (core.Message, *markdown.Doc, error) {
	m, doc, err := Bus(BusInput{ID: in.ID, At: in.At, Sender: in.Sender, Stance: in.Stance, ParentID: in.ParentID,
		BodyMD: in.BodyMD, Header: in.Header})
	if err != nil {
		return m, nil, err
	}
	m.Plane = in.Plane
	m.ChannelID = ""
	m.Receiver = core.Ref{Kind: core.RefPrincipal, ID: in.ReceiverID}
	if in.External != "" {
		m.Sender = core.Ref{Kind: core.RefExternal, ID: in.External}
		m.Stance = nil
		m.Provenance.SourceURL = in.External
		m.Claims.Upstream = in.External
	}
	return m, doc, nil
}
