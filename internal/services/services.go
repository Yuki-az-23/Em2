// Package services declares the interfaces modules provide to each other
// through the kernel registry (kernel.Resolve). It holds interfaces and plain
// data types only, so a module never imports another module's package.
package services

import (
	"context"

	"em2.social/em2/core"
)

// PublicPrincipal is what anyone may know about a principal.
type PublicPrincipal struct {
	ID     string             `json:"id"`
	Handle string             `json:"handle"`
	Kind   core.PrincipalKind `json:"kind"`
}

// Directory resolves principals to their public card. Provided by identity.
type Directory interface {
	Public(ctx context.Context, ids []string) (map[string]PublicPrincipal, error)
}

// Stances reads a principal's current bridge. Provided by ledger. The result
// is the sender's stance: what a message they send starts from (ADR-011).
// It returns nil when the principal has not set a bridge.
type Stances interface {
	Stance(ctx context.Context, principalID string) (*core.EC, error)
}
