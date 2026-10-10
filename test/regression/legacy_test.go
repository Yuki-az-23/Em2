// Package regression guards against defects found in earlier EM2 versions
// (docs/legacy/README.md, BLUEPRINT Part A). Each test names the legacy defect
// it prevents from returning.
package regression

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"em2.social/em2/internal/app"
	"em2.social/em2/kernel"
	"em2.social/em2/test/testenv"
)

func openapi(t *testing.T, admin bool) map[string]any {
	t.Helper()
	k, _, err := app.Open(context.Background(), testenv.TestConfig(""), nil)
	if err != nil {
		t.Fatal(err)
	}
	return k.OpenAPI(admin)
}

func operations(doc map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for path, item := range doc["paths"].(map[string]map[string]any) {
		for method, op := range item {
			out[strings.ToUpper(method)+" "+path] = op.(map[string]any)
		}
	}
	return out
}

// Legacy: PUT /post/:postId let anyone set a post's emotion/color directly.
func TestNoOperationSetsEmotionalStateDirectly(t *testing.T) {
	for key := range operations(openapi(t, true)) {
		method, path, _ := strings.Cut(key, " ")
		if (method == "PUT" || method == "PATCH" || method == "POST") && strings.Contains(path, "/messages/") && strings.HasSuffix(path, "/bridge") {
			t.Errorf("%s would let a caller set a message's emotional state", key)
		}
	}
}

// Legacy: follow, brace and comment took the actor's id from the request body,
// so anyone could act as anyone. The actor must always come from the credential.
func TestNoRequestBodyNamesTheActor(t *testing.T) {
	actorFields := []string{"user_id", "userId", "actor_id", "principal_id", "follower_id", "owner_id", "postedBy"}
	for key, op := range operations(openapi(t, true)) {
		rb, ok := op["requestBody"]
		if !ok {
			continue
		}
		b, _ := json.Marshal(rb)
		for _, f := range actorFields {
			if strings.Contains(string(b), `"`+f+`"`) {
				t.Errorf("%s accepts %q in its body; take the actor from the credential", key, f)
			}
		}
	}
}

// Legacy: GET /users returned every user's email without authentication.
func TestNoUnauthenticatedOperationReturnsEmail(t *testing.T) {
	for key, op := range operations(openapi(t, true)) {
		if _, secured := op["security"]; secured {
			continue
		}
		if key == "POST /v1/auth/register" {
			continue // echoes the caller's own address back to the caller
		}
		b, _ := json.Marshal(op["responses"])
		if strings.Contains(string(b), `"email"`) {
			t.Errorf("%s is unauthenticated and returns an email field", key)
		}
	}
}

// Legacy: JWTs never expired and there was no logout on the server.
func TestTokensExpireAndLogoutExists(t *testing.T) {
	ops := operations(openapi(t, false))
	for _, want := range []string{"POST /v1/auth/logout", "POST /v1/auth/refresh", "DELETE /v1/me/sessions/{id}"} {
		if _, ok := ops[want]; !ok {
			t.Errorf("missing %s", want)
		}
	}
	login := ops["POST /v1/auth/login"]
	b, _ := json.Marshal(login["responses"])
	if !strings.Contains(string(b), `"expires_in"`) {
		t.Error("login response does not state token expiry")
	}
}

// Legacy: validators ran after controllers, so input was never validated.
// Every operation that takes a body must declare a closed schema for it.
func TestEveryBodyIsValidatedAgainstAClosedSchema(t *testing.T) {
	for key, op := range operations(openapi(t, true)) {
		rb, ok := op["requestBody"].(map[string]any)
		if !ok {
			continue
		}
		b, _ := json.Marshal(rb)
		if !strings.Contains(string(b), `"additionalProperties":false`) {
			t.Errorf("%s accepts unknown body properties", key)
		}
	}
}

// Legacy: unknown emotions fell back silently to Disgust/orange. Unknown input
// must be refused instead; the kernel has no default emotional state.
func TestKernelHasNoDefaultEmotion(t *testing.T) {
	k := kernel.New(kernel.Config{})
	if err := k.Boot(); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(k.OpenAPI(true))
	for _, s := range []string{"disgust", "Disgust", "orange"} {
		if strings.Contains(string(b), `"default":"`+s) {
			t.Errorf("a schema defaults to %q", s)
		}
	}
}
