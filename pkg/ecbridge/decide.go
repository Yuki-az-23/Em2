package ecbridge

import (
	"fmt"

	"em2.social/em2/core"
)

// Receiver is what the decision needs to know about one receiver.
type Receiver struct {
	Bridge       *core.EC // nil: no bridge set, nothing to score against
	Threshold    float64  // τ
	Filter       bool     // false: the receiver asked not to be filtered
	BlocksSender bool
}

// Decision is a verdict before it is stored. Score is nil when it could not
// be computed (no receiver bridge, or the message state is unknown).
type Decision struct {
	Kind   core.VerdictKind
	Score  *float64
	Reason string
}

// Decide applies the decision table (BLUEPRINT B6). Its inputs are the
// message's current state (nil when not assessed), the dossier risk and the
// receiver. Claims are never an input (ADR-011).
//
//	sender blocked, or risk ≥ risk_deny             → deny
//	score < τ and the receiver filters              → defer
//	risk ≥ risk_shape, or the state is unknown      → shape
//	otherwise                                       → pass
func Decide(state *core.EC, risk float64, rcv Receiver, r *Ruleset) Decision {
	var score *float64
	if state != nil && rcv.Bridge != nil {
		f := Compat(*rcv.Bridge, *state, r.WEmotion)
		score = &f
	}
	switch {
	case rcv.BlocksSender:
		return Decision{core.VerdictDeny, score, "You blocked the sender."}
	case risk >= r.RiskDeny:
		return Decision{core.VerdictDeny, score, fmt.Sprintf("The content's risk %.2f is at or above the deny limit %.2f.", risk, r.RiskDeny)}
	case score != nil && *score < rcv.Threshold && rcv.Filter:
		return Decision{core.VerdictDefer, score, Explain(*rcv.Bridge, *state, rcv.Threshold, r.WEmotion)}
	case state == nil:
		return Decision{core.VerdictShape, score, "The content's emotion has not been assessed yet."}
	case risk >= r.RiskShape:
		return Decision{core.VerdictShape, score, fmt.Sprintf("The content's risk %.2f is at or above the shaping limit %.2f.", risk, r.RiskShape)}
	case rcv.Bridge == nil:
		return Decision{core.VerdictPass, score, "You have no bridge set, so nothing was filtered."}
	case !rcv.Filter:
		return Decision{core.VerdictPass, score, "Your filter is off. " + Explain(*rcv.Bridge, *state, rcv.Threshold, r.WEmotion)}
	}
	return Decision{core.VerdictPass, score, Explain(*rcv.Bridge, *state, rcv.Threshold, r.WEmotion)}
}

// Explain says in one sentence why a message fits a receiver or not.
func Explain(u, p core.EC, tau, wE float64) string {
	f := Compat(u, p, wE)
	cmp := "at or above"
	if f < tau {
		cmp = "below"
	}
	return fmt.Sprintf("Your bridge %s/%s is %s from the message's emotion %s and %s from its color %s; compatibility %.2f is %s your threshold %.2f.",
		u.Emotion, u.Color, steps(Dist(uint8(u.Emotion), uint8(p.Emotion))), p.Emotion,
		steps(Dist(uint8(u.Color), uint8(p.Color))), p.Color, f, cmp, tau)
}

func steps(n int) string {
	if n == 1 {
		return "1 step"
	}
	return fmt.Sprintf("%d steps", n)
}
