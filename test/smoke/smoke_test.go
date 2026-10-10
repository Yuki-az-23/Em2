// Package smoke runs the release smoke check: the critical path a deployment
// must pass. It runs in-process against EM2_TEST_DATABASE_URL, or against a
// deployed instance when EM2_SMOKE_URL is set.
package smoke

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"testing"

	"em2.social/em2/test/testenv"
)

func instance(t *testing.T) *testenv.Instance {
	if u := os.Getenv("EM2_SMOKE_URL"); u != "" {
		return &testenv.Instance{T: t, URL: u, Client: http.DefaultClient}
	}
	return testenv.Start(t, testenv.Options{})
}

func TestCriticalPath(t *testing.T) {
	in := instance(t)
	in.Must(in.Do("GET", "/healthz", "", nil), 200)
	in.Must(in.Do("GET", "/readyz", "", nil), 200)
	doc := in.Must(in.Do("GET", "/v1/openapi.json", "", nil), 200)
	if doc.Str("openapi") != "3.1.0" {
		t.Fatalf("openapi = %s", doc.Str("openapi"))
	}

	b := make([]byte, 4)
	_, _ = rand.Read(b)
	handle := "smoke_" + hex.EncodeToString(b)
	access, _, _ := in.Human(handle)
	in.Must(in.Do("GET", "/v1/me", access, nil), 200)

	_, key := in.Agent(access, handle+"_a", "feed:read")
	me := in.Must(in.Do("GET", "/v1/me", key, nil), 200)
	if me.Str("kind") != "agent" {
		t.Fatalf("agent me = %s", me.Raw)
	}
	in.Must(in.Do("GET", "/v1/nowhere", "", nil), 404)
	in.Must(in.Do("DELETE", "/v1/me", access, nil), 204)
}
