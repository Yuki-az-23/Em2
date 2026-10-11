package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"em2.social/em2/kernel"
	"em2.social/em2/test/testenv"
)

// upstream is a fake agent endpoint that records what EM2 forwards.
type upstream struct {
	*httptest.Server
	mu       sync.Mutex
	requests []recorded
	status   int
	reply    string
}

type recorded struct {
	header http.Header
	body   string
}

func newUpstream(t *testing.T, status int, reply string) *upstream {
	u := &upstream{status: status, reply: reply}
	u.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		u.mu.Lock()
		u.requests = append(u.requests, recorded{header: r.Header.Clone(), body: string(b)})
		u.mu.Unlock()
		w.Header().Set("Server", "secret-upstream/9.1")
		w.Header().Set("X-Powered-By", "internal-framework")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(u.status)
		_, _ = w.Write([]byte(u.reply))
	}))
	t.Cleanup(u.Close)
	return u
}

func (u *upstream) count() int {
	u.mu.Lock()
	defer u.mu.Unlock()
	return len(u.requests)
}

func (u *upstream) last() recorded {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.requests[len(u.requests)-1]
}

func sendIngress(in *testenv.Instance, token, handle, body string) *testenv.Response {
	in.T.Helper()
	keySeq++
	return in.DoWith("POST", "/ingress/"+handle, token, body, map[string]string{
		"Content-Type": "application/json", "Idempotency-Key": fmt.Sprintf("ing-%d-%d", time.Now().UnixNano(), keySeq)})
}

func TestIngressForwardsDeliveredRequestsAndRepliesAsMessages(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	owner, _, _ := in.Human("owner")
	svcID, svc := in.Agent(owner, "svc", "bridge:write", "endpoint:write", "feed:read", "post:create")
	_, far := in.Agent(owner, "far", "bridge:write", "endpoint:write", "feed:read")
	caller, _, _ := in.Human("caller")
	outsider, _, _ := in.Human("outsider")
	setBridge(in, svc, "joy", "yellow")
	setBridge(in, far, "sad", "blue")
	setBridge(in, caller, "trust", "lime")
	setBridge(in, outsider, "trust", "lime")

	good := newUpstream(t, 200, `{"answer":"hello caller"}`)
	farUp := newUpstream(t, 200, `{"answer":"late"}`)
	in.Must(in.Do("PUT", "/v1/me/endpoint", svc, map[string]string{"url": "ftp://x.example/"}), 400)
	in.Must(in.Do("PUT", "/v1/me/endpoint", svc, map[string]string{"url": good.URL + "/hook"}), 200)
	in.Must(in.Do("PUT", "/v1/me/endpoint", far, map[string]string{"url": farUp.URL}), 200)
	if e := in.Must(in.Do("GET", "/v1/me/endpoint", svc, nil), 200); e.Str("url") != good.URL+"/hook" {
		t.Fatalf("endpoint: %s", e.Raw)
	}

	payload := `{"task":"summarize","items":[1,2,3]}`
	r1 := in.Must(sendIngress(in, caller, "svc", payload), 202)
	id := r1.Str("id")
	r2 := in.Must(sendIngress(in, caller, "far", payload), 202)
	r3 := in.Must(sendIngress(in, caller, "nobody_here", payload), 202)
	norm := func(r *testenv.Response) string { return strings.ReplaceAll(string(r.Raw), r.Str("id"), "ID") }
	if norm(r1) != norm(r2) || norm(r1) != norm(r3) {
		t.Fatalf("sender responses differ:\n%s\n%s\n%s", r1.Raw, r2.Raw, r3.Raw)
	}
	for _, r := range []*testenv.Response{r1, r2, r3} {
		if r.Took < 140*time.Millisecond || r.Header.Get("Server") != "" {
			t.Fatalf("sender response not padded or carries a banner: %v %v", r.Took, r.Header)
		}
	}

	if !testenv.Eventually(t, 5*time.Second, func() bool { return good.count() == 1 }) {
		t.Fatal("the delivered request was not forwarded")
	}
	got := good.last()
	if got.body != payload || got.header.Get("Content-Type") != "application/json" {
		t.Fatalf("forwarded body/type: %q %q", got.body, got.header.Get("Content-Type"))
	}
	for k, want := range map[string]string{"EM2-Verdict": "pass", "EM2-Score": "0.7500", "EM2-Message-Id": id, "EM2-Sender": "caller",
		"EM2-Rule-Version": "em2-2.0"} {
		if got.header.Get(k) != want {
			t.Errorf("%s = %q, want %q", k, got.header.Get(k), want)
		}
	}
	if got.header.Get("Authorization") != "" || got.header.Get("Idempotency-Key") != "" {
		t.Fatal("the sender's credentials were forwarded")
	}

	// The upstream's answer reaches the caller as a reply, without its banners.
	var reply *feedItem
	testenv.Eventually(t, 5*time.Second, func() bool {
		for _, it := range items(in, "/v1/me/feed", caller) {
			if it.Message.ParentID == id {
				it := it
				reply = &it
				return true
			}
		}
		return false
	})
	if reply == nil {
		t.Fatal("no reply in the caller's feed")
	}
	m := in.Must(in.Do("GET", "/v1/messages/"+reply.Message.ID, caller, nil), 200)
	if !strings.Contains(m.Str("body_md"), "hello caller") || strings.Contains(string(m.Raw), "secret-upstream") ||
		strings.Contains(string(m.Raw), "internal-framework") {
		t.Fatalf("reply: %s", m.Raw)
	}
	if m.Str("plane") != "ingress" || m.Str("receiver_id") == "" {
		t.Fatalf("reply message: %s", m.Raw)
	}
	// Direct messages are readable by their two ends only.
	in.Must(in.Do("GET", "/v1/messages/"+id, outsider, nil), 404)
	in.Must(in.Do("GET", "/v1/messages/"+id, caller, nil), 200)
	in.Must(in.Do("GET", "/v1/messages/"+id, svc, nil), 200)
	if it := waitItem(in, "/v1/me/feed", svc, id); it == nil || it.Verdict.Kind != "pass" {
		t.Fatalf("request in the receiver's feed: %+v", it)
	}
	var state string
	_ = in.Pool.QueryRow(context.Background(), `SELECT state FROM verdict.exchanges WHERE message_id = $1 AND receiver_id = $2`, id, svcID).Scan(&state)
	if state != "responded" {
		t.Fatalf("exchange state = %q, want responded", state)
	}

	// The far agent's request is deferred and not forwarded until released.
	settle(in)
	time.Sleep(200 * time.Millisecond)
	if farUp.count() != 0 {
		t.Fatal("a deferred request reached the upstream")
	}
	setBridge(in, far, "trust", "lime")
	if !testenv.Eventually(t, 5*time.Second, func() bool { return farUp.count() == 1 }) {
		t.Fatal("the released request was not forwarded")
	}
	if farUp.last().header.Get("EM2-Verdict") != "pass" {
		t.Fatalf("released verdict header: %v", farUp.last().header)
	}
}

func TestIngressNeverRelaysUpstreamErrors(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	owner, _, _ := in.Human("owner")
	_, svc := in.Agent(owner, "broken", "bridge:write", "endpoint:write")
	caller, _, _ := in.Human("caller")
	setBridge(in, svc, "joy", "yellow")
	setBridge(in, caller, "joy", "yellow")
	bad := newUpstream(t, 500, `{"error":"panic at db.go:42 password=hunter2"}`)
	in.Must(in.Do("PUT", "/v1/me/endpoint", svc, map[string]string{"url": bad.URL}), 200)

	id := in.Must(sendIngress(in, caller, "broken", `{"q":1}`), 202).Str("id")
	if !testenv.Eventually(t, 5*time.Second, func() bool { return bad.count() == 1 }) {
		t.Fatal("not forwarded")
	}
	var errText string
	testenv.Eventually(t, 5*time.Second, func() bool {
		_ = in.Pool.QueryRow(context.Background(), `SELECT COALESCE(error, '') FROM ingress.forwards WHERE message_id = $1`, id).Scan(&errText)
		return errText != ""
	})
	if !strings.Contains(errText, "upstream status 500") {
		t.Fatalf("internal record: %q", errText)
	}
	settle(in)
	feed := in.Must(in.Do("GET", "/v1/me/feed", caller, nil), 200)
	if strings.Contains(string(feed.Raw), "hunter2") || strings.Contains(string(feed.Raw), "panic") {
		t.Fatalf("upstream error reached the sender: %s", feed.Raw)
	}
	if len(items(in, "/v1/me/feed", caller)) != 0 {
		t.Fatal("a failed upstream produced a reply")
	}
}

func TestEgressFetchStoresContentWithUnknownState(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	owner, _, _ := in.Human("owner")
	_, bot := in.Agent(owner, "reader", "egress:fetch", "feed:read")
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || strings.Contains(r.Header.Get("User-Agent"), "EM2") {
			w.WriteHeader(400)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("EM2-Emotion", "joy")
		w.Header().Set("EM2-Color", "yellow")
		_, _ = w.Write([]byte(`<html><head><script>steal()</script></head><body><h1>Big Sale</h1><p>Only today &amp; only for you.</p></body></html>`))
	}))
	defer site.Close()
	r := in.Must(in.Do("POST", "/v1/egress/fetch", bot, map[string]string{"url": site.URL + "/offer"}), 200)
	md := r.Str("body_md")
	if r.JSON["status"] != 200.0 || !strings.Contains(md, "Big Sale") || !strings.Contains(md, "Only today & only for you.") || strings.Contains(md, "steal") {
		t.Fatalf("fetch: %s", r.Raw)
	}
	it := waitItem(in, "/v1/me/feed", bot, r.Str("id"))
	if it == nil || it.Verdict.Kind != "shape" || it.Verdict.Score != nil || it.Message.State != nil {
		t.Fatalf("egress message in feed: %+v", it)
	}
	if st := in.Must(in.Do("GET", "/v1/messages/"+r.Str("id")+"/bridge", bot, nil), 200); st.JSON["state"] != nil {
		t.Fatalf("egress state: %s", st.Raw)
	}
	in.Must(in.Do("POST", "/v1/egress/fetch", bot, map[string]string{"url": "ftp://example.org/x"}), 400)
	_, noScope := in.Agent(owner, "noscope", "feed:read")
	in.Must(in.Do("POST", "/v1/egress/fetch", noScope, map[string]string{"url": site.URL}), 403)
}

func TestEgressRefusesInternalAddresses(t *testing.T) {
	in := testenv.Start(t, testenv.Options{StrictNet: true})
	owner, _, _ := in.Human("owner")
	_, bot := in.Agent(owner, "prober", "egress:fetch")
	internal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("internal")) }))
	defer internal.Close()
	for _, u := range []string{internal.URL, "http://localhost:" + strings.Split(internal.URL, ":")[2], "http://169.254.169.254/latest/meta-data/",
		"http://[::1]/", "http://10.0.0.1/", "http://0x7f000001/"} {
		r := in.Do("POST", "/v1/egress/fetch", bot, map[string]string{"url": u})
		if r.Status != 403 && r.Status != 502 {
			t.Errorf("%s: status %d: %s", u, r.Status, r.Raw)
		}
		var p map[string]any
		_ = json.Unmarshal(r.Raw, &p)
		if strings.Contains(string(r.Raw), "internal") && p["code"] != "upstream-unavailable" {
			t.Errorf("%s leaked: %s", u, r.Raw)
		}
	}
	// The ingress upstream is guarded the same way.
	_, svc := in.Agent(owner, "svc", "bridge:write", "endpoint:write")
	caller, _, _ := in.Human("caller")
	setBridge(in, svc, "joy", "yellow")
	setBridge(in, caller, "joy", "yellow")
	in.Must(in.Do("PUT", "/v1/me/endpoint", svc, map[string]string{"url": internal.URL}), 200)
	id := in.Must(sendIngress(in, caller, "svc", `{"x":1}`), 202).Str("id")
	var errText string
	testenv.Eventually(t, 5*time.Second, func() bool {
		_ = in.Pool.QueryRow(context.Background(), `SELECT COALESCE(error, '') FROM ingress.forwards WHERE message_id = $1`, id).Scan(&errText)
		return errText != ""
	})
	if errText != "upstream address not allowed" {
		t.Fatalf("ingress to loopback: %q", errText)
	}
}
