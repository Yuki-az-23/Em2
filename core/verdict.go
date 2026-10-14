package core

import "time"

// VerdictKind is the delivery decision for one message to one receiver.
type VerdictKind string

const (
	VerdictPass  VerdictKind = "pass"
	VerdictShape VerdictKind = "shape"
	VerdictDefer VerdictKind = "defer"
	VerdictDeny  VerdictKind = "deny"
)

// Verdict belongs to the receiver. Its details are shown to the receiver and
// the journal only; a sender learns only accepted (pass, shape, defer) or
// denied (ADR-011).
type Verdict struct {
	MessageID   string      `json:"message_id"`
	Receiver    Ref         `json:"receiver"`
	Score       float64     `json:"score"`
	Threshold   float64     `json:"threshold"`
	Risk        float64     `json:"risk"`
	Kind        VerdictKind `json:"kind"`
	Reason      string      `json:"reason"`
	RuleVersion string      `json:"rule_version"`
	DecidedAt   time.Time   `json:"decided_at"`
}

// SenderOutcome is the only thing a sender is told about a verdict.
type SenderOutcome string

const (
	OutcomeAccepted SenderOutcome = "accepted"
	OutcomeDenied   SenderOutcome = "denied"
)

// SenderView maps a verdict kind to what the sender may learn.
func (k VerdictKind) SenderView() SenderOutcome {
	if k == VerdictDeny {
		return OutcomeDenied
	}
	return OutcomeAccepted
}

// ExchangeState is the lifecycle of one delivery attempt.
type ExchangeState string

const (
	StateReceived   ExchangeState = "received"
	StateNormalized ExchangeState = "normalized"
	StateScored     ExchangeState = "scored"
	StateDecided    ExchangeState = "decided"
	StateForwarded  ExchangeState = "forwarded"
	StateResponded  ExchangeState = "responded"
	StateDeferred   ExchangeState = "deferred"
	StateReleased   ExchangeState = "released"
	StateExpired    ExchangeState = "expired"
	StateDenied     ExchangeState = "denied"
)

var exchangeEdges = map[ExchangeState][]ExchangeState{
	StateReceived:   {StateNormalized},
	StateNormalized: {StateScored},
	StateScored:     {StateDecided},
	StateDecided:    {StateForwarded, StateDeferred, StateDenied},
	StateForwarded:  {StateResponded},
	StateDeferred:   {StateReleased, StateExpired},
	StateReleased:   {StateForwarded},
}

// ValidTransition reports whether an exchange may move from one state to another.
func ValidTransition(from, to ExchangeState) bool {
	for _, s := range exchangeEdges[from] {
		if s == to {
			return true
		}
	}
	return false
}

// Terminal reports whether no further transition is allowed.
func (s ExchangeState) Terminal() bool { return len(exchangeEdges[s]) == 0 }

// Transition is a committed change of a message's emotional state.
type Transition struct {
	MessageID    string    `json:"message_id"`
	From         EC        `json:"from"`
	To           EC        `json:"to"`
	Pressure     float64   `json:"pressure"`
	Threshold    float64   `json:"threshold"`
	Contributors int       `json:"contributors"`
	Trigger      Ref       `json:"trigger"`
	TriggerKind  string    `json:"trigger_kind"`
	RuleVersion  string    `json:"rule_version"`
	At           time.Time `json:"at"`
}
