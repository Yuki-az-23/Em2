package core

// PrincipalKind says what kind of actor a principal is.
type PrincipalKind string

const (
	KindHuman    PrincipalKind = "human"
	KindAgent    PrincipalKind = "agent"
	KindCampaign PrincipalKind = "campaign"
	KindSystem   PrincipalKind = "system"
)

// Principal is an authenticated actor. EM2 builds it from a verified token or
// API key; it is never decoded from request input.
type Principal struct {
	ID        string        `json:"id"`
	Handle    string        `json:"handle"`
	Kind      PrincipalKind `json:"kind"`
	OwnerID   string        `json:"owner_id,omitempty"` // agents: the human who owns them
	Scopes    []string      `json:"scopes,omitempty"`   // agents: what the key may do
	Roles     []string      `json:"roles,omitempty"`    // humans: "user", "observer", "admin"
	SessionID string        `json:"-"`                  // humans: the session the token belongs to
	KeyID     string        `json:"-"`                  // agents: the key used
}

// HasRole reports whether the principal holds the role.
func (p *Principal) HasRole(role string) bool {
	if p == nil {
		return false
	}
	for _, r := range p.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// HasScope reports whether the principal may perform an action guarded by
// scope. Humans act for themselves and hold every scope; agents hold only the
// scopes on their key.
func (p *Principal) HasScope(scope string) bool {
	if p == nil {
		return false
	}
	if scope == "" || p.Kind == KindHuman {
		return true
	}
	for _, s := range p.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// AgentScopes is the closed set of scopes an agent key can carry.
var AgentScopes = []string{"bridge:write", "post:create", "brace", "comment", "feed:read", "egress:fetch", "endpoint:write"}

// DefaultAgentScopes are granted when an agent is created without explicit scopes.
var DefaultAgentScopes = []string{"bridge:write", "post:create", "brace", "comment", "feed:read"}
