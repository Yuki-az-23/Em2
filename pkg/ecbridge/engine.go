package ecbridge

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"em2.social/em2/core"
)

//go:embed rulesets/*.json
var rulesets embed.FS

// DefaultRuleset is the ruleset EM2 runs unless configured otherwise.
const DefaultRuleset = "em2-2.1"

// Ruleset holds every ECBridge and verdict tunable (BLUEPRINT B6, B7). It is
// public: knowing the rules does not reveal any principal's bridge.
type Ruleset struct {
	Version       string             `json:"version"`
	WEmotion      float64            `json:"w_emotion"`       // weight of the emotion distance in the score
	Threshold     float64            `json:"threshold"`       // default receiver threshold τ
	Theta         float64            `json:"theta"`           // pressure that commits a transition
	HalfLifeHours float64            `json:"half_life_hours"` // pressure decay
	Weights       map[string]float64 `json:"weights"`         // per interaction kind
	AgentFactor   float64            `json:"agent_factor"`    // agents' interactions count this much
	MaxPerActor   float64            `json:"max_per_actor"`   // cap on one actor's contribution to one target
	ExcludeAuthor bool               `json:"exclude_author"`
	RiskShape     float64            `json:"risk_shape"`
	RiskDeny      float64            `json:"risk_deny"`
	DeferTTLHours float64            `json:"defer_ttl_hours"`
	// Probe detection (from em2-2.1; zero disables it): ProbeVariants
	// distinct contents from one sender to one receiver within
	// ProbeWindowMinutes, each scoring within ProbeBand of the receiver's
	// threshold, are a probe of that threshold and are denied.
	ProbeVariants      int     `json:"probe_variants,omitempty"`
	ProbeBand          float64 `json:"probe_band,omitempty"`
	ProbeWindowMinutes float64 `json:"probe_window_minutes,omitempty"`
	// ShapeIntervalSeconds limits shaped deliveries to one per interval per
	// sender and receiver (from em2-2.1; zero disables it).
	ShapeIntervalSeconds float64 `json:"shape_interval_seconds,omitempty"`
}

// Interaction kinds.
const (
	KindReply   = "reply"
	KindBrace   = "brace"
	KindForward = "forward"
	KindUnbrace = "unbrace"
)

// LoadRuleset parses and checks a ruleset.
func LoadRuleset(b []byte) (*Ruleset, error) {
	var r Ruleset
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	in01 := func(v float64) bool { return v >= 0 && v <= 1 }
	switch {
	case r.Version == "":
		return nil, errors.New("ecbridge: ruleset needs a version")
	case !in01(r.WEmotion), !in01(r.Threshold), !in01(r.AgentFactor), !in01(r.RiskShape), !in01(r.RiskDeny):
		return nil, errors.New("ecbridge: w_emotion, threshold, agent_factor and risk limits must be within [0, 1]")
	case r.RiskShape > r.RiskDeny:
		return nil, errors.New("ecbridge: risk_shape must not exceed risk_deny")
	case r.Theta <= 0, r.HalfLifeHours <= 0, r.MaxPerActor <= 0, r.DeferTTLHours <= 0:
		return nil, errors.New("ecbridge: theta, half_life_hours, max_per_actor and defer_ttl_hours must be positive")
	case r.ProbeVariants < 0, r.ProbeBand < 0, r.ProbeWindowMinutes < 0, r.ShapeIntervalSeconds < 0:
		return nil, errors.New("ecbridge: probe and shape settings must not be negative")
	case r.ProbeVariants > 0 && (r.ProbeVariants < 2 || r.ProbeBand <= 0 || r.ProbeWindowMinutes <= 0):
		return nil, errors.New("ecbridge: probe detection needs probe_variants ≥ 2, a positive probe_band and probe_window_minutes")
	}
	for _, k := range []string{KindReply, KindBrace, KindForward, KindUnbrace} {
		if _, ok := r.Weights[k]; !ok {
			return nil, fmt.Errorf("ecbridge: ruleset misses the weight of %s", k)
		}
	}
	if r.Weights[KindUnbrace] != -r.Weights[KindBrace] {
		return nil, errors.New("ecbridge: unbrace must exactly revert brace")
	}
	return &r, nil
}

// BuiltinRuleset returns a ruleset shipped with EM2.
func BuiltinRuleset(version string) (*Ruleset, error) {
	b, err := rulesets.ReadFile("rulesets/" + version + ".json")
	if err != nil {
		return nil, fmt.Errorf("ecbridge: no builtin ruleset %s", version)
	}
	return LoadRuleset(b)
}

// ProbeWindow is how far back near-threshold variants are counted.
func (r *Ruleset) ProbeWindow() time.Duration {
	return time.Duration(r.ProbeWindowMinutes * float64(time.Minute))
}

// ShapeInterval is the minimum time between two shaped deliveries from one
// sender to one receiver; zero means no limit.
func (r *Ruleset) ShapeInterval() time.Duration {
	return time.Duration(r.ShapeIntervalSeconds * float64(time.Second))
}

// NearThreshold reports whether a score is close enough to a threshold to
// count as a probe variant.
func (r *Ruleset) NearThreshold(score, threshold float64) bool {
	return r.ProbeVariants > 0 && math.Abs(score-threshold) <= r.ProbeBand+1e-9
}

// DeferTTL is how long a deferred delivery waits before it expires.
func (r *Ruleset) DeferTTL() time.Duration {
	return time.Duration(r.DeferTTLHours * float64(time.Hour))
}

// Compat is the compatibility of a receiver's bridge u with a message state p:
// f = 1 − (wE·dist(uE,pE) + (1−wE)·dist(uC,pC)) / 4, in [0, 1].
func Compat(u, p core.EC, wE float64) float64 {
	dE := float64(Dist(uint8(u.Emotion), uint8(p.Emotion)))
	dC := float64(Dist(uint8(u.Color), uint8(p.Color)))
	f := 1 - (wE*dE+(1-wE)*dC)/4
	return math.Round(f*1e6) / 1e6
}

// Step moves one wheel position from `from` toward `toward` along the shorter
// arc. Opposite positions move clockwise (index + 1); equal positions stay.
func Step(from, toward uint8) uint8 {
	d := (int(toward) - int(from) + core.WheelSize) % core.WheelSize
	switch {
	case d == 0:
		return from
	case d <= core.WheelSize/2:
		return uint8((int(from) + 1) % core.WheelSize)
	default:
		return uint8((int(from) + core.WheelSize - 1) % core.WheelSize)
	}
}

// Target is where an interaction by an actor with stance a pulls a message in
// state p: one step toward the actor on each wheel.
func Target(a, p core.EC) core.EC {
	return core.EC{
		Emotion: core.Emotion(Step(uint8(p.Emotion), uint8(a.Emotion))),
		Color:   core.Color(Step(uint8(p.Color), uint8(a.Color))),
	}
}

// Pool is the pressure pulling a message toward one target state.
type Pool struct {
	Target       core.EC            `json:"target"`
	Pressure     float64            `json:"pressure"`
	Anchor       time.Time          `json:"anchor"`       // decay is applied in whole hours from here
	Contributors map[string]float64 `json:"contributors"` // actor id → weight contributed (before decay)
}

// PressureState is a message's state and the pressure on it.
type PressureState struct {
	Author  string  `json:"author"`
	Current core.EC `json:"current"`
	Pools   []Pool  `json:"pools"`
}

// Interaction is one actor acting on a message.
type Interaction struct {
	Actor  string
	Agent  bool
	Stance *core.EC // the actor's bridge; nil means none
	Kind   string
	At     time.Time
	// Revert and RevertTarget undo an earlier contribution exactly: an
	// unbrace passes the pressure its brace added and the target it pulled
	// toward. A zero Revert makes the unbrace a no-op.
	Revert       float64
	RevertTarget core.EC
}

// Outcome reports what an interaction did.
type Outcome struct {
	Effect       string  // added, author, no_stance, resonance, capped, unknown_kind
	Target       core.EC // the target the interaction pulled toward
	Added        float64 // change in pressure (negative for unbrace)
	Pressure     float64 // pool pressure after the interaction
	Committed    bool    // the pool reached θ and the state moved
	From         core.EC
	Contributors int // actors with a positive contribution to the committed pool
}

// decay brings a pool forward to `at`, in whole hours, so that interactions
// close together in time add up exactly.
func decay(p *Pool, at time.Time, halfLifeHours float64) {
	if p.Anchor.IsZero() || !at.After(p.Anchor) {
		if p.Anchor.IsZero() {
			p.Anchor = at
		}
		return
	}
	hours := math.Floor(at.Sub(p.Anchor).Hours())
	if hours < 1 {
		return
	}
	p.Pressure *= math.Pow(0.5, hours/halfLifeHours)
	p.Anchor = p.Anchor.Add(time.Duration(hours) * time.Hour)
}

// ApplyPressure applies one interaction. It returns the new state; the input
// is not modified. When a pool reaches θ the state moves to its target and
// all pools are cleared, because targets are relative to the state.
func ApplyPressure(st PressureState, in Interaction, r *Ruleset) (PressureState, Outcome) {
	out := PressureState{Author: st.Author, Current: st.Current, Pools: make([]Pool, len(st.Pools))}
	for i, p := range st.Pools {
		c := make(map[string]float64, len(p.Contributors))
		for k, v := range p.Contributors {
			c[k] = v
		}
		p.Contributors = c
		out.Pools[i] = p
	}
	res := Outcome{From: st.Current}
	w, ok := r.Weights[in.Kind]
	switch {
	case !ok:
		res.Effect = "unknown_kind"
		return out, res
	case r.ExcludeAuthor && in.Actor == st.Author:
		res.Effect = "author"
		return out, res
	case in.Stance == nil && in.Kind != KindUnbrace:
		res.Effect = "no_stance"
		return out, res
	}
	if in.Kind == KindUnbrace {
		res.Target, w = in.RevertTarget, -in.Revert
	} else {
		res.Target = Target(*in.Stance, st.Current)
		if res.Target == st.Current {
			res.Effect = "resonance"
			return out, res
		}
		if in.Agent {
			w *= r.AgentFactor
		}
	}
	idx := -1
	for i := range out.Pools {
		if out.Pools[i].Target == res.Target {
			idx = i
			break
		}
	}
	if idx < 0 {
		if w <= 0 {
			res.Effect = "capped"
			return out, res
		}
		out.Pools = append(out.Pools, Pool{Target: res.Target, Anchor: in.At, Contributors: map[string]float64{}})
		idx = len(out.Pools) - 1
	}
	p := &out.Pools[idx]
	decay(p, in.At, r.HalfLifeHours)
	prev := p.Contributors[in.Actor]
	next := math.Min(math.Max(prev+w, 0), r.MaxPerActor)
	delta := next - prev
	if delta == 0 {
		res.Effect = "capped"
		res.Pressure = p.Pressure
		return out, res
	}
	if next == 0 {
		delete(p.Contributors, in.Actor)
	} else {
		p.Contributors[in.Actor] = next
	}
	p.Pressure = math.Max(p.Pressure+delta, 0)
	p.Pressure = math.Round(p.Pressure*1e9) / 1e9
	res.Effect, res.Added, res.Pressure = "added", delta, p.Pressure
	if p.Pressure >= r.Theta {
		res.Committed = true
		for _, v := range p.Contributors {
			if v > 0 {
				res.Contributors++
			}
		}
		out.Current = p.Target
		out.Pools = nil
	}
	sort.Slice(out.Pools, func(i, j int) bool { return out.Pools[i].Pressure > out.Pools[j].Pressure })
	return out, res
}
