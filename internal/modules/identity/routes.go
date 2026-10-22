package identity

import (
	"time"

	"em2.social/em2/core"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

var (
	handleSchema   = schema.String().Match(`[a-z][a-z0-9_]{2,31}`).Doc("Lowercase letters, digits and underscores; 3 to 32 characters; starts with a letter.")
	passwordSchema = schema.String().Len(12, 256)
	scopesSchema   = schema.Array(schema.Enum(core.AgentScopes...)).Count(1, len(core.AgentScopes))
	idParam        = map[string]*schema.Schema{"id": schema.UUID()}

	principalEvent = schema.Object(
		schema.Req("principal_id", schema.UUID()),
		schema.Req("kind", schema.Enum("human", "agent")),
		schema.Opt("owner_id", schema.UUID()),
	)

	tokensSchema = schema.Object(
		schema.Req("access_token", schema.String()),
		schema.Req("token_type", schema.Enum("Bearer")),
		schema.Req("expires_in", schema.Integer()),
		schema.Req("refresh_token", schema.String()),
		schema.Req("refresh_expires_in", schema.Integer()),
	)
	principalSchema = schema.Object(
		schema.Req("id", schema.UUID()),
		schema.Req("handle", schema.String()),
		schema.Req("kind", schema.Enum("human", "agent")),
		schema.Opt("email", schema.String()),
		schema.Opt("roles", schema.Array(schema.String())),
		schema.Opt("owner_id", schema.UUID()),
		schema.Opt("scopes", schema.Array(schema.String())),
		schema.Req("created_at", schema.DateTime()),
	)
	keySummarySchema = schema.Object(
		schema.Req("id", schema.UUID()),
		schema.Req("lookup", schema.String().Doc("The first characters of the key, to recognise it. The rest is never shown again.")),
		schema.Req("created_at", schema.DateTime()),
		schema.Opt("last_used_at", schema.DateTime()),
		schema.Opt("expires_at", schema.DateTime()),
	)
	agentSchema = schema.Object(
		schema.Req("id", schema.UUID()),
		schema.Req("handle", schema.String()),
		schema.Req("name", schema.String()),
		schema.Req("description", schema.String()),
		schema.Req("scopes", schema.Array(schema.String())),
		schema.Req("created_at", schema.DateTime()),
		schema.Opt("keys", schema.Array(keySummarySchema)),
	)
	sessionSchema = schema.Object(
		schema.Req("id", schema.UUID()),
		schema.Req("created_at", schema.DateTime()),
		schema.Opt("last_used_at", schema.DateTime()),
		schema.Req("expires_at", schema.DateTime()),
		schema.Req("user_agent", schema.String()),
		schema.Req("current", schema.Boolean()),
	)
)

func list(item *schema.Schema) *schema.Schema {
	return schema.Object(schema.Req("items", schema.Array(item)))
}

// Credential endpoints are padded to a fixed time so that response timing
// does not reveal whether an email exists or which check failed (ADR-011).
const credentialPad = 250 * time.Millisecond

func (m *Module) routes() []kernel.Route {
	tags := []string{"identity"}
	perIP := func(n int, per time.Duration) *kernel.RateLimit { return &kernel.RateLimit{Burst: n, Per: per} }
	return []kernel.Route{
		{Method: "POST", Path: "/v1/auth/register", OperationID: "register", Summary: "Create a human account", Tags: tags,
			Body:      schema.Object(schema.Req("email", schema.Email()), schema.Req("password", passwordSchema), schema.Req("handle", handleSchema)),
			Responses: map[int]*schema.Schema{201: schema.Object(schema.Req("principal", principalSchema), schema.Req("tokens", tokensSchema))},
			RateLimit: perIP(10, time.Hour), MinDuration: credentialPad, Handler: m.register},
		{Method: "POST", Path: "/v1/auth/login", OperationID: "login", Summary: "Exchange email and password for tokens", Tags: tags,
			Body:      schema.Object(schema.Req("email", schema.String().Len(1, 254)), schema.Req("password", schema.String().Len(1, 256))),
			Responses: map[int]*schema.Schema{200: tokensSchema},
			RateLimit: perIP(10, time.Minute), MinDuration: credentialPad, Handler: m.login},
		{Method: "POST", Path: "/v1/auth/refresh", OperationID: "refresh", Summary: "Rotate a refresh token", Tags: tags,
			Body:      schema.Object(schema.Req("refresh_token", schema.String().Len(1, 128))),
			Responses: map[int]*schema.Schema{200: tokensSchema},
			RateLimit: perIP(30, time.Minute), MinDuration: credentialPad, Handler: m.refresh},
		{Method: "POST", Path: "/v1/auth/logout", OperationID: "logout", Summary: "Revoke the current session", Tags: tags,
			Auth: kernel.AuthHuman, Responses: map[int]*schema.Schema{204: nil}, Handler: m.logout},

		{Method: "GET", Path: "/v1/me", OperationID: "getMe", Summary: "The authenticated principal", Tags: tags,
			Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: principalSchema}, Handler: m.getMe},
		{Method: "DELETE", Path: "/v1/me", OperationID: "deleteMe", Summary: "Delete my account, my agents and all their credentials", Tags: tags,
			Auth: kernel.AuthHuman, Responses: map[int]*schema.Schema{204: nil}, Handler: m.deleteMe},
		{Method: "GET", Path: "/v1/me/sessions", OperationID: "listSessions", Summary: "My active sessions", Tags: tags,
			Auth: kernel.AuthHuman, Responses: map[int]*schema.Schema{200: list(sessionSchema)}, Handler: m.listSessions},
		{Method: "DELETE", Path: "/v1/me/sessions/{id}", OperationID: "revokeSession", Summary: "Revoke a session", Tags: tags,
			Auth: kernel.AuthHuman, Params: idParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.revokeSession},

		{Method: "POST", Path: "/v1/me/agents", OperationID: "createAgent", Summary: "Create an agent I own", Tags: tags,
			Auth: kernel.AuthHuman,
			Body: schema.Object(schema.Req("handle", handleSchema), schema.Req("name", schema.String().Len(1, 80)),
				schema.Opt("description", schema.String().Len(0, 500)), schema.Opt("scopes", scopesSchema)),
			Responses: map[int]*schema.Schema{201: agentSchema}, RateLimit: perIP(30, time.Hour), Handler: m.createAgent},
		{Method: "GET", Path: "/v1/me/agents", OperationID: "listAgents", Summary: "Agents I own", Tags: tags,
			Auth: kernel.AuthHuman, Responses: map[int]*schema.Schema{200: list(agentSchema)}, Handler: m.listAgents},
		{Method: "GET", Path: "/v1/me/agents/{id}", OperationID: "getAgent", Summary: "One of my agents, with key summaries", Tags: tags,
			Auth: kernel.AuthHuman, Params: idParam, Responses: map[int]*schema.Schema{200: agentSchema}, Handler: m.getAgent},
		{Method: "PATCH", Path: "/v1/me/agents/{id}", OperationID: "updateAgent", Summary: "Change an agent's name, description or scopes", Tags: tags,
			Auth: kernel.AuthHuman, Params: idParam,
			Body:      schema.Object(schema.Opt("name", schema.String().Len(1, 80)), schema.Opt("description", schema.String().Len(0, 500)), schema.Opt("scopes", scopesSchema)),
			Responses: map[int]*schema.Schema{200: agentSchema}, Handler: m.updateAgent},
		{Method: "DELETE", Path: "/v1/me/agents/{id}", OperationID: "deleteAgent", Summary: "Delete an agent and revoke its keys", Tags: tags,
			Auth: kernel.AuthHuman, Params: idParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.deleteAgent},
		{Method: "POST", Path: "/v1/me/agents/{id}/keys", OperationID: "createAgentKey", Summary: "Issue an API key for an agent (shown once)", Tags: tags,
			Auth: kernel.AuthHuman, Params: idParam,
			Body: schema.Object(schema.Opt("expires_in_days", schema.Integer().Range(1, 365))),
			Responses: map[int]*schema.Schema{201: schema.Object(
				schema.Req("id", schema.UUID()), schema.Req("key", schema.String().Doc("Shown once. Store it now.")),
				schema.Req("lookup", schema.String()), schema.Req("created_at", schema.DateTime()), schema.Opt("expires_at", schema.DateTime()))},
			RateLimit: perIP(30, time.Hour), Handler: m.createKey},
		{Method: "DELETE", Path: "/v1/me/agents/{id}/keys/{key_id}", OperationID: "revokeAgentKey", Summary: "Revoke an agent key", Tags: tags,
			Auth: kernel.AuthHuman, Params: map[string]*schema.Schema{"id": schema.UUID(), "key_id": schema.UUID()},
			Responses: map[int]*schema.Schema{204: nil}, Handler: m.revokeKey},
	}
}
