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
// Every operation that takes a JSON body must declare a closed schema for it.
// Opaque bodies (media uploads, proxied ingress payloads) declare only their
// media types; the kernel bounds their size and the handler checks content.
func TestEveryBodyIsValidatedAgainstAClosedSchema(t *testing.T) {
	for key, op := range operations(openapi(t, true)) {
		rb, ok := op["requestBody"].(map[string]any)
		if !ok {
			continue
		}
		for mt, c := range rb["content"].(map[string]any) {
			sch, ok := c.(map[string]any)["schema"]
			if !ok {
				if key != "POST /ingress/{handle}" {
					t.Errorf("%s takes an opaque %s body", key, mt)
				}
				continue
			}
			b, _ := json.Marshal(sch)
			if !strings.Contains(string(b), `"additionalProperties":false`) {
				t.Errorf("%s accepts unknown body properties", key)
			}
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

// ADR-011 and the legacy PUT /post/:postId: publishing answers the sender
// with the message id only. No score, risk, dossier, state or claim may be
// added to that response.
func TestPublishAnswersOnlyWithAnID(t *testing.T) {
	op := operations(openapi(t, false))["POST /v1/messages"]
	if op == nil {
		t.Fatal("POST /v1/messages missing")
	}
	resp := op["responses"].(map[string]any)
	if _, ok := resp["202"]; !ok || len(resp) != 2 { // 202 plus the default problem
		t.Fatalf("publish responses = %v", resp)
	}
	b, _ := json.Marshal(resp["202"])
	var schema struct {
		Content map[string]struct {
			Schema struct {
				Properties map[string]any `json:"properties"`
			} `json:"schema"`
		} `json:"content"`
	}
	_ = json.Unmarshal(b, &schema)
	props := schema.Content["application/json"].Schema.Properties
	if len(props) != 1 || props["id"] == nil {
		t.Fatalf("publish 202 carries %v; senders learn only the id", props)
	}
}

// Legacy: unknown emotions silently became Disgust/orange. Message claims and
// bridges must use the exact wheel names or be refused.
func TestEmotionInputsAreClosedEnums(t *testing.T) {
	doc := openapi(t, false)
	b, _ := json.Marshal(doc["paths"].(map[string]map[string]any)["/v1/me/bridge"]["put"])
	for _, want := range []string{`"joy"`, `"anticipated"`, `"yellow"`, `"orange"`} {
		if !strings.Contains(string(b), want) {
			t.Fatalf("PUT /v1/me/bridge does not enumerate %s", want)
		}
	}
}
