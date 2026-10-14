package integration

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"em2.social/em2/internal/modules/identity"
	"em2.social/em2/test/testenv"
)

func TestRegisterLoginRefreshLogout(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	access, refresh, id := in.Human("alice")

	me := in.Must(in.Do("GET", "/v1/me", access, nil), 200)
	if me.Str("id") != id || me.Str("handle") != "alice" || me.Str("kind") != "human" || me.Str("email") != "alice@example.org" {
		t.Fatalf("me = %s", me.Raw)
	}

	login := in.Must(in.Do("POST", "/v1/auth/login", "", map[string]string{"email": "ALICE@example.org", "password": "correct horse battery staple"}), 200)
	if login.Str("token_type") != "Bearer" || login.Str("access_token") == "" {
		t.Fatalf("login = %s", login.Raw)
	}

	// Rotation: the new refresh token works once; the old one is now spent.
	rot := in.Must(in.Do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": refresh}), 200)
	refresh2 := rot.Str("refresh_token")
	if refresh2 == refresh {
		t.Fatal("refresh token was not rotated")
	}
	in.Must(in.Do("GET", "/v1/me", rot.Str("access_token"), nil), 200)

	// Reuse of the spent token revokes the whole family, including refresh2.
	in.Must(in.Do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": refresh}), 401)
	in.Must(in.Do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": refresh2}), 401)
	in.Must(in.Do("GET", "/v1/me", rot.Str("access_token"), nil), 401)

	// The separate login session is unaffected; logout revokes it immediately.
	tok := login.Str("access_token")
	in.Must(in.Do("GET", "/v1/me", tok, nil), 200)
	in.Must(in.Do("POST", "/v1/auth/logout", tok, nil), 204)
	in.Must(in.Do("GET", "/v1/me", tok, nil), 401)
	in.Must(in.Do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": login.Str("refresh_token")}), 401)
}

func TestSessionsListAndRevoke(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	access, _, _ := in.Human("sam")
	second := in.Must(in.Do("POST", "/v1/auth/login", "", map[string]string{"email": "sam@example.org", "password": "correct horse battery staple"}), 200)
	list := in.Must(in.Do("GET", "/v1/me/sessions", access, nil), 200)
	items := list.JSON["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 sessions, got %s", list.Raw)
	}
	var other string
	for _, it := range items {
		s := it.(map[string]any)
		if !s["current"].(bool) {
			other = s["id"].(string)
		}
	}
	in.Must(in.Do("DELETE", "/v1/me/sessions/"+other, access, nil), 204)
	in.Must(in.Do("GET", "/v1/me", second.Str("access_token"), nil), 401)
	in.Must(in.Do("DELETE", "/v1/me/sessions/"+other, access, nil), 404)

	// Another human cannot see or revoke sam's sessions.
	bob, _, _ := in.Human("bob")
	in.Must(in.Do("DELETE", "/v1/me/sessions/"+other, bob, nil), 404)
}

// ADR-011: a failed login does not say whether the email exists, by status,
// body or timing.
func TestLoginFailureRevealsNothing(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	in.Human("carol")
	unknown := in.Must(in.Do("POST", "/v1/auth/login", "", map[string]string{"email": "nobody@example.org", "password": "correct horse battery staple"}), 401)
	wrong := in.Must(in.Do("POST", "/v1/auth/login", "", map[string]string{"email": "carol@example.org", "password": "wrong password value"}), 401)
	strip := func(r *testenv.Response) string {
		delete(r.JSON, "instance")
		return string(must(jsonMarshal(r.JSON)))
	}
	if a, b := strip(unknown), strip(wrong); a != b {
		t.Fatalf("bodies differ:\n%s\n%s", a, b)
	}
	for _, r := range []*testenv.Response{unknown, wrong} {
		if r.Took < 250*time.Millisecond {
			t.Fatalf("login failure answered in %v, before the 250ms pad", r.Took)
		}
	}
}

func TestRegisterConflictsAreGeneric(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	in.Human("dora")
	sameEmail := in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{"email": "DORA@example.org", "password": "correct horse battery staple", "handle": "dora2"}), 409)
	sameHandle := in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{"email": "other@example.org", "password": "correct horse battery staple", "handle": "dora"}), 409)
	if sameEmail.JSON["detail"] != sameHandle.JSON["detail"] {
		t.Fatalf("conflicts are distinguishable: %v vs %v", sameEmail.JSON["detail"], sameHandle.JSON["detail"])
	}
}

func TestValidationErrorsPointAtFields(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	r := in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{"email": "x", "password": "short", "handle": "No"}), 400)
	errs := r.JSON["errors"].([]any)
	got := map[string]bool{}
	for _, e := range errs {
		got[e.(map[string]any)["pointer"].(string)] = true
	}
	for _, p := range []string{"/email", "/password", "/handle"} {
		if !got[p] {
			t.Errorf("no error for %s in %s", p, r.Raw)
		}
	}
	if bytes.Contains(r.Raw, []byte("short")) {
		t.Fatal("validation error echoes the input")
	}
}

func TestAgentKeyLifecycle(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	owner, _, ownerID := in.Human("erin")
	agentID, key := in.Agent(owner, "erin_bot", "feed:read", "post:create")

	me := in.Must(in.Do("GET", "/v1/me", key, nil), 200)
	if me.Str("id") != agentID || me.Str("kind") != "agent" || me.Str("owner_id") != ownerID {
		t.Fatalf("agent me = %s", me.Raw)
	}
	if _, has := me.JSON["email"]; has {
		t.Fatal("agent view leaks the owner's email")
	}

	// Agents cannot act as their owner.
	in.Must(in.Do("GET", "/v1/me/agents", key, nil), 403)
	in.Must(in.Do("POST", "/v1/me/agents", key, map[string]string{"handle": "spawn", "name": "x"}), 403)

	// The key is stored only as a peppered hash and a lookup prefix.
	var found bool
	if err := in.Pool.QueryRow(context.Background(), `SELECT EXISTS (SELECT 1 FROM identity.agent_keys WHERE agent_id = $1
		AND position($2 in lookup || encode(key_hash, 'escape')) > 0)`, agentID, key).Scan(&found); err != nil {
		t.Fatal(err)
	}
	if found {
		t.Fatal("agent key stored in clear")
	}

	detail := in.Must(in.Do("GET", "/v1/me/agents/"+agentID, owner, nil), 200)
	keys := detail.JSON["keys"].([]any)
	if len(keys) != 1 || strings.Contains(string(detail.Raw), key) {
		t.Fatalf("agent detail = %s", detail.Raw)
	}
	keyID := keys[0].(map[string]any)["id"].(string)

	// Another human sees nothing.
	frank, _, _ := in.Human("frank")
	in.Must(in.Do("GET", "/v1/me/agents/"+agentID, frank, nil), 404)
	in.Must(in.Do("DELETE", "/v1/me/agents/"+agentID+"/keys/"+keyID, frank, nil), 404)

	// Scope changes apply on the next request.
	in.Must(in.Do("PATCH", "/v1/me/agents/"+agentID, owner, map[string]any{"scopes": []string{"feed:read"}}), 200)
	me = in.Must(in.Do("GET", "/v1/me", key, nil), 200)
	if s := me.JSON["scopes"].([]any); len(s) != 1 || s[0] != "feed:read" {
		t.Fatalf("scopes = %v", s)
	}

	// Revocation is immediate; tampered keys fail the same way.
	in.Must(in.Do("DELETE", "/v1/me/agents/"+agentID+"/keys/"+keyID, owner, nil), 204)
	in.Must(in.Do("GET", "/v1/me", key, nil), 401)
	in.Must(in.Do("GET", "/v1/me", key[:len(key)-2]+"xx", nil), 401)
}

func TestAgentAndKeyLimits(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	owner, _, _ := in.Human("gina")
	agentID, _ := in.Agent(owner, "gina_bot")
	for i := 0; i < 4; i++ {
		in.Must(in.Do("POST", "/v1/me/agents/"+agentID+"/keys", owner, map[string]any{"expires_in_days": 30}), 201)
	}
	in.Must(in.Do("POST", "/v1/me/agents/"+agentID+"/keys", owner, map[string]any{}), 409)
	in.Must(in.Do("POST", "/v1/me/agents", owner, map[string]string{"handle": "gina_bot", "name": "dup"}), 409)
	in.Must(in.Do("POST", "/v1/me/agents", owner, map[string]any{"handle": "gina_bot2", "name": "x", "scopes": []string{"root"}}), 400)
}

func TestDeleteMeErasesAndRevokesEverything(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	access, refresh, id := in.Human("hana")
	_, key := in.Agent(access, "hana_bot")
	in.Must(in.Do("DELETE", "/v1/me", access, nil), 204)

	in.Must(in.Do("GET", "/v1/me", access, nil), 401)
	in.Must(in.Do("GET", "/v1/me", key, nil), 401)
	in.Must(in.Do("POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": refresh}), 401)
	in.Must(in.Do("POST", "/v1/auth/login", "", map[string]string{"email": "hana@example.org", "password": "correct horse battery staple"}), 401)

	var email string
	if err := in.Pool.QueryRow(context.Background(), `SELECT email FROM identity.humans WHERE principal_id = $1`, id).Scan(&email); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(email, "hana") {
		t.Fatalf("email not erased: %s", email)
	}
	// The handle stays reserved, so nobody can take it over.
	in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{"email": "new@example.org", "password": "correct horse battery staple", "handle": "hana"}), 409)
	// The email address is free again.
	in.Must(in.Do("POST", "/v1/auth/register", "", map[string]string{"email": "hana@example.org", "password": "correct horse battery staple", "handle": "hana_new"}), 201)
}

func TestAdminRoutesAreHiddenUntilGranted(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	access, _, _ := in.Human("ivan")
	in.Must(in.Do("GET", "/v1/admin/modules", access, nil), 404)
	in.Must(in.Do("GET", "/v1/admin/openapi.json", access, nil), 404)
	if err := identity.GrantRole(context.Background(), in.Pool, "ivan", "admin"); err != nil {
		t.Fatal(err)
	}
	mods := in.Must(in.Do("GET", "/v1/admin/modules", access, nil), 200)
	if !strings.Contains(string(mods.Raw), `"name":"identity"`) || !strings.Contains(string(mods.Raw), `"pending_migrations":[]`) {
		t.Fatalf("modules = %s", mods.Raw)
	}
	if err := identity.GrantRole(context.Background(), in.Pool, "nobody", "admin"); err == nil {
		t.Fatal("granting a role to an unknown handle succeeded")
	}
	if err := identity.GrantRole(context.Background(), in.Pool, "ivan", "root"); err == nil {
		t.Fatal("unknown role accepted")
	}
}
