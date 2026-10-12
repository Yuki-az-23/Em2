package dossier

import (
	"strings"
	"testing"
	"time"

	"em2.social/em2/core"
)

var now = time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)

func rules(t *testing.T) *Rules {
	t.Helper()
	r, err := Builtin("dossier-1")
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func copies(n int, sender func(i int) string, ago time.Duration) []Copy {
	out := make([]Copy, n)
	for i := range out {
		out[i] = Copy{SenderID: sender(i), At: now.Add(-ago)}
	}
	return out
}

func signal(d core.Dossier, name string) core.Signal {
	for _, s := range d.Signals {
		if s.Name == name {
			return s
		}
	}
	return core.Signal{}
}

func TestOrdinaryMessageHasNoRisk(t *testing.T) {
	d := Build(Stats{Window: copies(1, func(int) string { return "a" }, time.Minute), Now: now}, rules(t))
	if d.Risk != 0 {
		t.Fatalf("risk = %v, signals %+v", d.Risk, d.Signals)
	}
	if len(d.Signals) != 5 {
		t.Fatalf("want all 5 signals reported, got %d", len(d.Signals))
	}
}

func TestOneSenderFloodingIsHighRisk(t *testing.T) {
	d := Build(Stats{Window: copies(12, func(int) string { return "spammer" }, 10*time.Minute), Now: now}, rules(t))
	if signal(d, "repetition").Value != 1 || signal(d, "burst").Value != 1 || signal(d, "sender_concentration").Value != 1 {
		t.Fatalf("signals %+v", d.Signals)
	}
	if d.Risk < 0.74 {
		t.Fatalf("risk = %v", d.Risk)
	}
}

func TestOrganicSpreadIsLowerThanAFlood(t *testing.T) {
	r := rules(t)
	organic := Build(Stats{Window: copies(6, func(i int) string { return string(rune('a' + i)) }, 20*time.Hour), Now: now}, r)
	flood := Build(Stats{Window: copies(6, func(int) string { return "one" }, 5*time.Minute), Now: now}, r)
	if !(organic.Risk < flood.Risk) {
		t.Fatalf("organic %v, flood %v", organic.Risk, flood.Risk)
	}
	if signal(organic, "burst").Value != 0 || signal(organic, "sender_concentration").Value > 0.2 {
		t.Fatalf("organic signals %+v", organic.Signals)
	}
}

func TestClaimDriftUsesMedian(t *testing.T) {
	joy := &core.EC{Emotion: core.Joy, Color: core.Yellow}
	sad := &core.EC{Emotion: core.Sad, Color: core.Blue}
	// Three senders whose stance is sad claim the content is joy; one honest.
	w := []Copy{
		{SenderID: "a", At: now, Stance: sad, Claim: joy},
		{SenderID: "b", At: now, Stance: sad, Claim: joy},
		{SenderID: "c", At: now, Stance: sad, Claim: joy},
		{SenderID: "d", At: now, Stance: joy, Claim: joy},
	}
	d := Build(Stats{Window: w, Now: now}, rules(t))
	if d.Drift != 1 || signal(d, "claim_drift").Value != 1 {
		t.Fatalf("drift = %v", d.Drift)
	}
	// No claims: no drift, whatever the stance.
	d = Build(Stats{Window: []Copy{{SenderID: "a", At: now, Stance: sad}}, Now: now}, rules(t))
	if d.Drift != 0 {
		t.Fatalf("drift without claims = %v", d.Drift)
	}
}

func TestLinkFanout(t *testing.T) {
	d := Build(Stats{Window: copies(1, func(int) string { return "a" }, 0), Links: []string{"https://a", "https://b", "https://c", "https://d", "https://e", "https://f"}, Now: now}, rules(t))
	if signal(d, "link_fanout").Value != 1 {
		t.Fatalf("fanout = %+v", signal(d, "link_fanout"))
	}
}

func TestRiskIsBoundedAndEvidenceExplains(t *testing.T) {
	d := Build(Stats{Window: copies(100, func(int) string { return "x" }, 0), Links: make([]string, 50), Now: now}, rules(t))
	if d.Risk < 0 || d.Risk > 1 {
		t.Fatalf("risk out of range: %v", d.Risk)
	}
	for _, s := range d.Signals {
		if s.Evidence == "" || strings.Contains(s.Evidence, "%!") {
			t.Fatalf("bad evidence for %s: %q", s.Name, s.Evidence)
		}
	}
}

func TestRulesValidation(t *testing.T) {
	bad := []string{
		`{}`,
		`{"version":"x","window_hours":24,"signals":{}}`,
		`{"version":"x","window_hours":24,"signals":{"repetition":{"weight":0.5},"burst":{"weight":0.5},"sender_concentration":{"weight":0.5},"link_fanout":{"weight":0},"claim_drift":{"weight":0}}}`,
		`{"version":"x","window_hours":0,"signals":{"repetition":{"weight":1},"burst":{"weight":0},"sender_concentration":{"weight":0},"link_fanout":{"weight":0},"claim_drift":{"weight":0}}}`,
	}
	for _, b := range bad {
		if _, err := Load([]byte(b)); err == nil {
			t.Errorf("accepted %s", b)
		}
	}
	if _, err := Builtin("nope"); err == nil {
		t.Fatal("unknown builtin accepted")
	}
}

func TestBridgingVectorCountsFarDeliveries(t *testing.T) {
	r, err := Builtin("dossier-2")
	if err != nil {
		t.Fatal(err)
	}
	one := copies(1, func(int) string { return "a" }, time.Minute)
	d := Build(Stats{Window: one, Now: now, Reach: Reach{Deliveries: 2, Far: 2}}, r)
	if signal(d, "bridging_vector").Value != 0 || d.Bridging != 1 || len(d.Signals) != 6 {
		t.Fatalf("below min deliveries: %+v", d)
	}
	d = Build(Stats{Window: one, Now: now, Reach: Reach{Deliveries: 10, Far: 8}}, r)
	if v := signal(d, "bridging_vector").Value; v != 0.8 || d.Risk != 0.16 {
		t.Fatalf("bridging %v risk %v", v, d.Risk)
	}
	// dossier-1 has no bridging_vector and ignores reach.
	if d := Build(Stats{Window: one, Now: now, Reach: Reach{Deliveries: 10, Far: 10}}, rules(t)); d.Risk != 0 || len(d.Signals) != 5 {
		t.Fatalf("dossier-1 with reach: %+v", d)
	}
	if _, err := Load([]byte(`{"version":"x","window_hours":1,"signals":{"repetition":{"weight":0.2},"burst":{"weight":0.2},"sender_concentration":{"weight":0.2},"link_fanout":{"weight":0.2},"claim_drift":{"weight":0.1},"mystery":{"weight":0.1}}}`)); err == nil {
		t.Fatal("unknown signal accepted")
	}
}
