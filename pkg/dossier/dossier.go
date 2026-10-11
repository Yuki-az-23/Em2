// Package dossier computes the evidence EM2 keeps about one piece of content
// (BLUEPRINT B5, docs/contracts/dossier.md). It is pure: callers gather the
// statistics, this package turns them into named, weighted signals and a risk.
//
// v1 signals: repetition, burst, sender_concentration, link_fanout and
// claim_drift. bridging_vector, probe and liberty_pressure need verdict and
// ledger data and arrive in M3 and M4.
package dossier

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/pkg/ecbridge"
)

//go:embed rules/*.json
var builtin embed.FS

type signalRule struct {
	Weight     float64 `json:"weight"`
	SaturateAt float64 `json:"saturate_at"`
	MinCopies  int     `json:"min_copies"`
}

// Rules are the versioned weights and thresholds.
type Rules struct {
	Version     string                `json:"version"`
	WindowHours int                   `json:"window_hours"`
	Signals     map[string]signalRule `json:"signals"`
}

var signalNames = []string{"repetition", "burst", "sender_concentration", "link_fanout", "claim_drift"}

// Load parses and checks a rules file.
func Load(b []byte) (*Rules, error) {
	var r Rules
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	if r.Version == "" || r.WindowHours <= 0 {
		return nil, errors.New("dossier: rules need a version and a positive window")
	}
	total := 0.0
	for _, n := range signalNames {
		s, ok := r.Signals[n]
		if !ok || s.Weight < 0 {
			return nil, fmt.Errorf("dossier: rules miss signal %s", n)
		}
		total += s.Weight
	}
	if math.Abs(total-1) > 1e-9 {
		return nil, fmt.Errorf("dossier: weights sum to %v, want 1", total)
	}
	return &r, nil
}

// Builtin returns the rules shipped with EM2.
func Builtin(version string) (*Rules, error) {
	b, err := builtin.ReadFile("rules/" + version + ".json")
	if err != nil {
		return nil, fmt.Errorf("dossier: no builtin rules %s", version)
	}
	return Load(b)
}

// Copy is one sighting of the content within the window.
type Copy struct {
	SenderID string
	At       time.Time
	Stance   *core.EC // sender's ledger bridge; nil if unauthenticated
	Claim    *core.EC // what the sender claimed; nil if nothing
}

// Stats is everything the builder needs.
type Stats struct {
	ContentHash []byte
	FirstSeen   time.Time
	SeenTotal   int      // all time
	Window      []Copy   // sightings within the rules window, any order
	Links       []string // distinct external links in the content
	Now         time.Time
}

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }

// Build computes the dossier.
func Build(st Stats, r *Rules) core.Dossier {
	d := core.Dossier{ContentHash: st.ContentHash, FirstSeen: st.FirstSeen, SeenCount: st.SeenTotal, Links: st.Links, Version: r.Version, Signals: []core.Signal{}}
	n := len(st.Window)
	perSender := map[string]int{}
	lastHour := 0
	var drifts []float64
	for _, c := range st.Window {
		perSender[c.SenderID]++
		if st.Now.Sub(c.At) <= time.Hour {
			lastHour++
		}
		if c.Claim != nil && c.Stance != nil {
			drifts = append(drifts, ecbridge.ECDist(*c.Claim, *c.Stance))
		}
	}
	d.Senders = len(perSender)
	d.Velocity = float64(lastHour)
	if n > 0 {
		d.Burstiness = float64(lastHour) / float64(n)
	}
	top := 0
	for _, k := range perSender {
		top = max(top, k)
	}
	if n > 0 {
		d.SenderConc = float64(top) / float64(n)
	}
	if len(drifts) > 0 {
		sort.Float64s(drifts)
		d.Drift = drifts[len(drifts)/2] // median: one honest sender does not mask a campaign
	}

	add := func(name string, value float64, evidence string) {
		rule := r.Signals[name]
		value = clamp01(value)
		d.Signals = append(d.Signals, core.Signal{Name: name, Value: value, Weight: rule.Weight, Evidence: evidence})
		d.Risk += rule.Weight * value
	}
	sat := func(name string) float64 { return math.Max(1, r.Signals[name].SaturateAt) }

	add("repetition", float64(n-1)/(sat("repetition")-1),
		fmt.Sprintf("seen %d times in %dh", n, r.WindowHours))
	add("burst", float64(lastHour-1)/(sat("burst")-1),
		fmt.Sprintf("%d sightings in the last hour", lastHour))
	conc := 0.0
	if n >= r.Signals["sender_concentration"].MinCopies {
		conc = d.SenderConc
	}
	add("sender_concentration", conc,
		fmt.Sprintf("top sender sent %d of %d copies", top, n))
	add("link_fanout", float64(len(st.Links)-1)/(sat("link_fanout")-1),
		fmt.Sprintf("%d distinct external links", len(st.Links)))
	add("claim_drift", d.Drift,
		fmt.Sprintf("claimed emotion/color is %.2f of the wheel from the senders' stance", d.Drift))
	d.Risk = clamp01(math.Round(d.Risk*1000) / 1000)
	return d
}
