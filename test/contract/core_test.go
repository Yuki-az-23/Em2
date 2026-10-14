// Package contract checks the sealed core contract and the repository-wide
// rules in AGENTS.md. These tests need no database.
package contract

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"em2.social/em2/core"
)

func TestWheelWireNamesAreFixed(t *testing.T) {
	wantE := "joy trust feared surprised sad disgust angry anticipated"
	wantC := "yellow lime green aqua blue pink red orange"
	if got := strings.Join(core.EmotionNames(), " "); got != wantE {
		t.Fatalf("emotions = %s", got)
	}
	if got := strings.Join(core.ColorNames(), " "); got != wantC {
		t.Fatalf("colors = %s", got)
	}
	for i := 0; i < core.WheelSize; i++ {
		e := core.Emotion(i)
		if e.HomeColor() != core.Color(i) {
			t.Fatalf("%s home color is not at the same index", e)
		}
	}
}

func TestParsingHasNoFallback(t *testing.T) {
	// The legacy code silently turned unknown input into Disgust/orange.
	for _, bad := range []string{"", "Joy", "JOY", "joy ", "disgsut", "sad\x00", "fear"} {
		if _, err := core.ParseEmotion(bad); err == nil {
			t.Errorf("ParseEmotion(%q) accepted", bad)
		}
	}
	for _, bad := range []string{"", "Yellow", "purple"} {
		if _, err := core.ParseColor(bad); err == nil {
			t.Errorf("ParseColor(%q) accepted", bad)
		}
	}
	var ec core.EC
	if err := json.Unmarshal([]byte(`{"emotion":"Joy","color":"yellow"}`), &ec); err == nil {
		t.Fatal("JSON decoding accepted a capitalised emotion")
	}
	if err := json.Unmarshal([]byte(`{"emotion":"sad","color":"blue"}`), &ec); err != nil || ec != (core.EC{Emotion: core.Sad, Color: core.Blue}) {
		t.Fatalf("decode = %v %v", ec, err)
	}
	if _, err := json.Marshal(core.EC{Emotion: 9}); err == nil {
		t.Fatal("encoding an out-of-range emotion succeeded")
	}
}

func TestValenceTable(t *testing.T) {
	want := []float64{1, 0.5, -0.5, 0, -1, -0.5, -0.75, 0.25}
	for i, v := range want {
		if got := core.Emotion(i).Valence(); got != v {
			t.Errorf("%s valence = %v, want %v", core.Emotion(i), got, v)
		}
	}
}

// ADR-011: the only untrusted part of a Message is Claims, and nothing named
// like a declared emotion lives in the trusted half.
func TestMessageTrustBoundary(t *testing.T) {
	mt := reflect.TypeOf(core.Message{})
	var untrusted []string
	for i := 0; i < mt.NumField(); i++ {
		f := mt.Field(i)
		if strings.Contains(strings.ToLower(f.Name), "declared") {
			t.Errorf("trusted field %s looks like a sender declaration; put it in Claims", f.Name)
		}
		if f.Type == reflect.TypeOf(core.Claims{}) {
			untrusted = append(untrusted, f.Name)
		}
	}
	if len(untrusted) != 1 || untrusted[0] != "Claims" {
		t.Fatalf("Claims fields = %v", untrusted)
	}
	if _, ok := reflect.TypeOf(core.Claims{}).FieldByName("EC"); !ok {
		t.Fatal("Claims must carry the sender-claimed EC")
	}
	// Ref.Bridge comes from the ledger and must never be decoded from input.
	f, _ := reflect.TypeOf(core.Ref{}).FieldByName("Bridge")
	if f.Tag.Get("json") != "-" {
		t.Fatal("Ref.Bridge must not be (de)serialised")
	}
	var r core.Ref
	_ = json.Unmarshal([]byte(`{"kind":"principal","id":"x","Bridge":{"emotion":"joy","color":"yellow"},"bridge":{"emotion":"joy","color":"yellow"}}`), &r)
	if r.Bridge != nil {
		t.Fatal("Ref.Bridge was filled from JSON input")
	}
}

func TestSenderLearnsOnlyAcceptedOrDenied(t *testing.T) {
	cases := map[core.VerdictKind]core.SenderOutcome{
		core.VerdictPass:  core.OutcomeAccepted,
		core.VerdictShape: core.OutcomeAccepted,
		core.VerdictDefer: core.OutcomeAccepted,
		core.VerdictDeny:  core.OutcomeDenied,
	}
	for k, want := range cases {
		if got := k.SenderView(); got != want {
			t.Errorf("%s -> %s, want %s", k, got, want)
		}
	}
}

func TestExchangeLifecycle(t *testing.T) {
	allowed := map[[2]core.ExchangeState]bool{
		{core.StateReceived, core.StateNormalized}: true,
		{core.StateNormalized, core.StateScored}:   true,
		{core.StateScored, core.StateDecided}:      true,
		{core.StateDecided, core.StateForwarded}:   true,
		{core.StateDecided, core.StateDeferred}:    true,
		{core.StateDecided, core.StateDenied}:      true,
		{core.StateForwarded, core.StateResponded}: true,
		{core.StateDeferred, core.StateReleased}:   true,
		{core.StateDeferred, core.StateExpired}:    true,
		{core.StateReleased, core.StateForwarded}:  true,
	}
	all := []core.ExchangeState{core.StateReceived, core.StateNormalized, core.StateScored, core.StateDecided, core.StateForwarded,
		core.StateResponded, core.StateDeferred, core.StateReleased, core.StateExpired, core.StateDenied}
	for _, from := range all {
		for _, to := range all {
			if got := core.ValidTransition(from, to); got != allowed[[2]core.ExchangeState{from, to}] {
				t.Errorf("%s -> %s: got %v", from, to, got)
			}
		}
	}
	for _, s := range []core.ExchangeState{core.StateResponded, core.StateExpired, core.StateDenied} {
		if !s.Terminal() {
			t.Errorf("%s should be terminal", s)
		}
	}
}

func TestScopes(t *testing.T) {
	agent := &core.Principal{Kind: core.KindAgent, Scopes: []string{"feed:read"}}
	human := &core.Principal{Kind: core.KindHuman}
	if !agent.HasScope("feed:read") || agent.HasScope("post:create") {
		t.Fatal("agent scopes wrong")
	}
	if !human.HasScope("post:create") {
		t.Fatal("humans act for themselves and hold every scope")
	}
	var nobody *core.Principal
	if nobody.HasScope("") || nobody.HasRole("admin") {
		t.Fatal("nil principal holds something")
	}
	for _, s := range core.DefaultAgentScopes {
		found := false
		for _, a := range core.AgentScopes {
			found = found || a == s
		}
		if !found {
			t.Errorf("default scope %s is not in AgentScopes", s)
		}
	}
}
