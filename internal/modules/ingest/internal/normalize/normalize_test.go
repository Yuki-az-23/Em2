package normalize

import (
	"crypto/sha256"
	"net/http"
	"strings"
	"testing"
	"time"

	"em2.social/em2/core"
)

var (
	sad = core.EC{Emotion: core.Sad, Color: core.Blue}
	joy = core.EC{Emotion: core.Joy, Color: core.Yellow}
)

func input() BusInput {
	h := http.Header{}
	h.Set("User-Agent", "agent/1.0")
	h.Set("EM2-Emotion", "angry")
	h.Set("EM2-Color", "red")
	h.Set("X-Forwarded-For", "10.0.0.1")
	return BusInput{ID: "m1", At: time.Date(2026, 10, 11, 9, 0, 0, 0, time.FixedZone("x", 3600)),
		Sender: core.Principal{ID: "p1", Kind: core.KindAgent}, Stance: &sad, ChannelID: "c1",
		BodyMD: "  hello\r\n\r\n```emotion trust/lime\nx\n```  ", Claim: &joy, Header: h}
}

func TestTrustedFieldsComeFromEM2(t *testing.T) {
	m, _, err := Bus(input())
	if err != nil {
		t.Fatal(err)
	}
	if m.Stance == nil || *m.Stance != sad || m.Sender.Bridge == nil || *m.Sender.Bridge != sad {
		t.Fatalf("stance = %v / %v, want the ledger stance", m.Stance, m.Sender.Bridge)
	}
	if m.Sender.ID != "p1" || m.Plane != core.PlaneBus || m.Direction != core.Inbound || m.At.Location() != time.UTC {
		t.Fatalf("message = %+v", m)
	}
	want := sha256.Sum256([]byte("hello\n\n```emotion trust/lime\nx\n```"))
	if string(m.Content.SHA256) != string(want[:]) || m.Content.Bytes != len("hello\n\n```emotion trust/lime\nx\n```") {
		t.Fatal("content hash is not over the normalized body")
	}
}

func TestClaimsHoldEverythingAsserted(t *testing.T) {
	m, _, _ := Bus(input())
	if m.Claims.EC == nil || *m.Claims.EC != joy {
		t.Fatalf("body claim should win, got %v", m.Claims.EC)
	}
	if m.Claims.UserAgent != "agent/1.0" || m.Claims.Headers["EM2-Emotion"] != "angry" {
		t.Fatalf("claims = %+v", m.Claims)
	}
	if _, ok := m.Claims.Headers["X-Forwarded-For"]; ok {
		t.Fatal("a header outside the allowlist was kept")
	}

	in := input()
	in.Claim = nil
	m, _, _ = Bus(in)
	if m.Claims.EC == nil || *m.Claims.EC != (core.EC{Emotion: core.Angry, Color: core.Red}) {
		t.Fatalf("header claim should come next, got %v", m.Claims.EC)
	}
	in.Header = http.Header{}
	m, _, _ = Bus(in)
	if m.Claims.EC == nil || *m.Claims.EC != (core.EC{Emotion: core.Trust, Color: core.Lime}) {
		t.Fatalf("fence claim should come last, got %v", m.Claims.EC)
	}
	// A claim never touches the stance, even with no stance at all.
	in.Stance = nil
	m, _, _ = Bus(in)
	if m.Stance != nil || m.Sender.Bridge != nil {
		t.Fatal("a claim leaked into the trusted stance")
	}
}

func TestHeaderValuesAreCapped(t *testing.T) {
	in := input()
	in.Header.Set("User-Agent", strings.Repeat("a", 5000))
	m, _, _ := Bus(in)
	if len(m.Claims.UserAgent) != headerCap {
		t.Fatalf("user agent length %d", len(m.Claims.UserAgent))
	}
}

func TestInvalidBodyIsRejected(t *testing.T) {
	in := input()
	in.BodyMD = strings.Repeat("x", 20001)
	if _, _, err := Bus(in); err == nil {
		t.Fatal("oversized body accepted")
	}
}
