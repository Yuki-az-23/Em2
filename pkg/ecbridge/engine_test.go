package ecbridge

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"em2.social/em2/core"
)

func rules(t *testing.T) *Ruleset {
	t.Helper()
	r, err := BuiltinRuleset(DefaultRuleset)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func ec(e core.Emotion, c core.Color) core.EC { return core.EC{Emotion: e, Color: c} }

func TestGoldenTablesMatchTheCode(t *testing.T) {
	r := rules(t)
	for _, name := range GoldenFiles {
		want, err := CheckedInGolden(name)
		if err != nil {
			t.Fatal(err)
		}
		got, err := Golden(name, r)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want) {
			t.Errorf("%s differs from the code; run `go run ./cmd/em2 golden` and review the diff", name)
		}
	}
}

func TestCompatProperties(t *testing.T) {
	r := rules(t)
	all := allEC()
	for _, u := range all {
		for _, p := range all {
			f := Compat(u, p, r.WEmotion)
			if f < 0 || f > 1 {
				t.Fatalf("Compat(%v,%v) = %v", u, p, f)
			}
			if (f == 1) != (u == p) {
				t.Fatalf("Compat(%v,%v) = %v; 1 only for identical states", u, p, f)
			}
			if f != Compat(p, u, r.WEmotion) {
				t.Fatalf("Compat is not symmetric for %v %v", u, p)
			}
		}
	}
	if Compat(ec(core.Joy, core.Yellow), ec(core.Sad, core.Blue), r.WEmotion) != 0 {
		t.Fatal("opposite states must score 0")
	}
	if got := Compat(ec(core.Joy, core.Yellow), ec(core.Trust, core.Lime), r.WEmotion); got != 0.75 {
		t.Fatalf("one step on both wheels = %v, want 0.75", got)
	}
}

func TestStepNeverIncreasesDistance(t *testing.T) {
	for a := uint8(0); a < core.WheelSize; a++ {
		for b := uint8(0); b < core.WheelSize; b++ {
			s := Step(a, b)
			if a == b && s != a {
				t.Fatalf("Step(%d,%d) moved", a, b)
			}
			if a != b && (Dist(s, b) != Dist(a, b)-1 || Dist(a, s) != 1) {
				t.Fatalf("Step(%d,%d) = %d", a, b, s)
			}
		}
	}
	if Step(0, 4) != 1 || Step(4, 0) != 5 {
		t.Fatal("opposite positions must move clockwise")
	}
}

func TestTargetIsRotationInvariant(t *testing.T) {
	rot := func(x core.EC, k int) core.EC {
		return ec(core.Emotion((int(x.Emotion)+k)%8), core.Color((int(x.Color)+k)%8))
	}
	for _, a := range allEC() {
		for _, p := range allEC() {
			for k := 1; k < 8; k++ {
				if rot(Target(a, p), k) != Target(rot(a, k), rot(p, k)) {
					t.Fatalf("Target not rotation invariant at %v %v %d", a, p, k)
				}
			}
		}
	}
}

func TestLoadRulesetRejectsBadRules(t *testing.T) {
	for _, bad := range []string{
		`{}`,
		`{"version":"x","w_emotion":2,"threshold":0.5,"theta":3,"half_life_hours":1,"max_per_actor":1,"risk_shape":0.6,"risk_deny":0.9,"defer_ttl_hours":1,"weights":{"reply":1,"brace":0.5,"forward":0.7,"unbrace":-0.5}}`,
		`{"version":"x","w_emotion":0.6,"threshold":0.5,"theta":3,"half_life_hours":1,"max_per_actor":1,"risk_shape":0.95,"risk_deny":0.9,"defer_ttl_hours":1,"weights":{"reply":1,"brace":0.5,"forward":0.7,"unbrace":-0.5}}`,
		`{"version":"x","w_emotion":0.6,"threshold":0.5,"theta":3,"half_life_hours":1,"max_per_actor":1,"risk_shape":0.6,"risk_deny":0.9,"defer_ttl_hours":1,"weights":{"reply":1,"brace":0.5,"forward":0.7,"unbrace":-0.4}}`,
		`{"version":"x","w_emotion":0.6,"threshold":0.5,"theta":3,"half_life_hours":1,"max_per_actor":1,"risk_shape":0.6,"risk_deny":0.9,"defer_ttl_hours":1,"weights":{"reply":1}}`,
	} {
		if _, err := LoadRuleset([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}

var t0 = time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)

func reply(actor string, stance core.EC, at time.Time) Interaction {
	return Interaction{Actor: actor, Stance: &stance, Kind: KindReply, At: at}
}

func TestOneReplyNeverFlipsThreeDistinctRepliesDo(t *testing.T) {
	r := rules(t)
	st := PressureState{Author: "author", Current: ec(core.Joy, core.Yellow)}
	toward := ec(core.Trust, core.Lime) // target is trust/lime itself
	st, o := ApplyPressure(st, reply("a", toward, t0), r)
	if o.Committed || o.Effect != "added" || o.Pressure != 1 {
		t.Fatalf("first reply: %+v", o)
	}
	// The same actor replying again is capped.
	st, o = ApplyPressure(st, reply("a", toward, t0.Add(time.Minute)), r)
	if o.Effect != "capped" || o.Committed {
		t.Fatalf("repeat reply: %+v", o)
	}
	st, o = ApplyPressure(st, reply("b", toward, t0.Add(2*time.Minute)), r)
	if o.Committed {
		t.Fatalf("two replies committed: %+v", o)
	}
	st, o = ApplyPressure(st, reply("c", toward, t0.Add(3*time.Minute)), r)
	if !o.Committed || o.Contributors != 3 || st.Current != toward || len(st.Pools) != 0 {
		t.Fatalf("third reply: %+v state %+v", o, st)
	}
}

func TestAuthorStanceAndResonanceAddNothing(t *testing.T) {
	r := rules(t)
	st := PressureState{Author: "author", Current: ec(core.Joy, core.Yellow)}
	if _, o := ApplyPressure(st, reply("author", ec(core.Sad, core.Blue), t0), r); o.Effect != "author" {
		t.Fatalf("author: %+v", o)
	}
	if _, o := ApplyPressure(st, Interaction{Actor: "x", Kind: KindReply, At: t0}, r); o.Effect != "no_stance" {
		t.Fatalf("no stance: %+v", o)
	}
	if _, o := ApplyPressure(st, reply("x", ec(core.Joy, core.Yellow), t0), r); o.Effect != "resonance" {
		t.Fatalf("resonance: %+v", o)
	}
	if _, o := ApplyPressure(st, Interaction{Actor: "x", Kind: "like", At: t0}, r); o.Effect != "unknown_kind" {
		t.Fatalf("unknown kind: %+v", o)
	}
}

func TestAgentsCountHalf(t *testing.T) {
	r := rules(t)
	st := PressureState{Author: "author", Current: ec(core.Joy, core.Yellow)}
	toward := ec(core.Sad, core.Blue)
	var o Outcome
	for i, a := range []string{"a1", "a2", "a3", "a4", "a5"} {
		in := reply(a, toward, t0.Add(time.Duration(i)*time.Minute))
		in.Agent = true
		st, o = ApplyPressure(st, in, r)
		if o.Committed {
			t.Fatalf("five agents committed")
		}
	}
	in := reply("a6", toward, t0.Add(6*time.Minute))
	in.Agent = true
	if _, o = ApplyPressure(st, in, r); !o.Committed || o.Target != ec(core.Trust, core.Lime) {
		t.Fatalf("six agents: %+v", o)
	}
}

func TestUnbraceRevertsExactlyWhatTheBraceAdded(t *testing.T) {
	r := rules(t)
	st := PressureState{Author: "author", Current: ec(core.Joy, core.Yellow)}
	toward := ec(core.Angry, core.Red)
	st, b := ApplyPressure(st, Interaction{Actor: "a", Stance: &toward, Kind: KindBrace, At: t0}, r)
	if b.Added != 0.5 {
		t.Fatalf("brace added %v", b.Added)
	}
	st, o := ApplyPressure(st, Interaction{Actor: "a", Kind: KindUnbrace, At: t0.Add(time.Minute), Revert: b.Added, RevertTarget: b.Target}, r)
	if o.Added != -0.5 || st.Pools[0].Pressure != 0 {
		t.Fatalf("unbrace: %+v %+v", o, st)
	}
	// An unbrace with nothing to revert is a no-op.
	if _, o := ApplyPressure(st, Interaction{Actor: "z", Kind: KindUnbrace, At: t0, RevertTarget: b.Target}, r); o.Added != 0 {
		t.Fatalf("empty unbrace: %+v", o)
	}
}

func TestPressureDecaysByHalfLife(t *testing.T) {
	r := rules(t)
	st := PressureState{Author: "author", Current: ec(core.Joy, core.Yellow)}
	toward := ec(core.Trust, core.Lime)
	st, _ = ApplyPressure(st, reply("a", toward, t0), r)
	st, _ = ApplyPressure(st, reply("b", toward, t0), r)
	// 24 hours later the two replies weigh 1.0 together; a third does not commit.
	st, o := ApplyPressure(st, reply("c", toward, t0.Add(24*time.Hour)), r)
	if o.Committed || o.Pressure != 2 {
		t.Fatalf("after one half-life: %+v", o)
	}
	// Within the same hour no decay applies.
	_, o = ApplyPressure(st, reply("d", toward, t0.Add(24*time.Hour+59*time.Minute)), r)
	if !o.Committed {
		t.Fatalf("fourth reply in the same hour: %+v", o)
	}
}

func TestDecisionTable(t *testing.T) {
	r := rules(t)
	joy := ec(core.Joy, core.Yellow)
	sad := ec(core.Sad, core.Blue)
	near := ec(core.Trust, core.Lime)
	cases := []struct {
		name  string
		state *core.EC
		risk  float64
		rcv   Receiver
		want  core.VerdictKind
	}{
		{"fit", &joy, 0, Receiver{Bridge: &near, Threshold: 0.5, Filter: true}, core.VerdictPass},
		{"far", &joy, 0, Receiver{Bridge: &sad, Threshold: 0.5, Filter: true}, core.VerdictDefer},
		{"far filter off", &joy, 0, Receiver{Bridge: &sad, Threshold: 0.5}, core.VerdictPass},
		{"blocked", &joy, 0, Receiver{Bridge: &near, Threshold: 0.5, Filter: true, BlocksSender: true}, core.VerdictDeny},
		{"flood", &joy, 0.95, Receiver{Bridge: &near, Threshold: 0.5, Filter: true}, core.VerdictDeny},
		{"risky fit", &joy, 0.7, Receiver{Bridge: &near, Threshold: 0.5, Filter: true}, core.VerdictShape},
		{"risky far defers", &joy, 0.7, Receiver{Bridge: &sad, Threshold: 0.5, Filter: true}, core.VerdictDefer},
		{"unknown state", nil, 0, Receiver{Bridge: &near, Threshold: 0.5, Filter: true}, core.VerdictShape},
		{"no bridge", &joy, 0, Receiver{Threshold: 0.5, Filter: true}, core.VerdictPass},
		{"no bridge risky", &joy, 0.6, Receiver{Threshold: 0.5, Filter: true}, core.VerdictShape},
		{"exact threshold passes", &joy, 0, Receiver{Bridge: &near, Threshold: 0.75, Filter: true}, core.VerdictPass},
	}
	for _, c := range cases {
		d := Decide(c.state, c.risk, c.rcv, r)
		if d.Kind != c.want || d.Reason == "" {
			t.Errorf("%s: %+v, want %s", c.name, d, c.want)
		}
	}
	d := Decide(&joy, 0, Receiver{Bridge: &sad, Threshold: 0.5, Filter: true}, r)
	if d.Score == nil || *d.Score != 0 || !strings.Contains(d.Reason, "below your threshold 0.50") {
		t.Fatalf("defer explanation: %+v", d)
	}
}
