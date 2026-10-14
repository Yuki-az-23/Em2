package integration

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"em2.social/em2/internal/modules/identity"
	"em2.social/em2/test/testenv"
)

func setBridge(in *testenv.Instance, token, emotion, color string) {
	in.T.Helper()
	in.Must(in.Do("PUT", "/v1/me/bridge", token, map[string]string{"emotion": emotion, "color": color}), 200)
}

func channel(in *testenv.Instance, token, handle string) string {
	in.T.Helper()
	return in.Must(in.Do("POST", "/v1/channels", token, map[string]string{"handle": handle, "title": "Channel " + handle}), 201).Str("id")
}

var keySeq int

// publish sends a message with a fresh Idempotency-Key unless one is given.
func publish(in *testenv.Instance, token string, body map[string]any, key string) *testenv.Response {
	in.T.Helper()
	if key == "" {
		keySeq++
		key = fmt.Sprintf("k-%d-%d", time.Now().UnixNano(), keySeq)
	}
	return in.DoWith("POST", "/v1/messages", token, body, map[string]string{"Idempotency-Key": key})
}

func hashOf(body string) string {
	s := sha256.Sum256([]byte(strings.TrimSpace(body)))
	return hex.EncodeToString(s[:])
}

func TestBridgeSetGetHistoryAndErasure(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("lena")
	in.Must(in.Do("GET", "/v1/me/bridge", tok, nil), 404)
	in.Must(in.Do("PUT", "/v1/me/bridge", tok, map[string]string{"emotion": "Joy", "color": "yellow"}), 400)
	setBridge(in, tok, "sad", "blue")
	setBridge(in, tok, "trust", "lime")
	b := in.Must(in.Do("GET", "/v1/me/bridge", tok, nil), 200)
	if b.Str("emotion") != "trust" || b.Str("color") != "lime" || b.Str("source") != "self" {
		t.Fatalf("bridge = %s", b.Raw)
	}
	h := in.Must(in.Do("GET", "/v1/me/bridge/history", tok, nil), 200)
	items := h.JSON["items"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["emotion"] != "trust" || items[1].(map[string]any)["ended_at"] == nil {
		t.Fatalf("history = %s", h.Raw)
	}

	// An agent's bridge needs the bridge:write scope and is recorded as "agent".
	_, key := in.Agent(tok, "lena_bot", "feed:read")
	in.Must(in.Do("PUT", "/v1/me/bridge", key, map[string]string{"emotion": "joy", "color": "yellow"}), 403)
	_, key2 := in.Agent(tok, "lena_bot2", "bridge:write")
	setBridge(in, key2, "joy", "yellow")
	if s := in.Must(in.Do("GET", "/v1/me/bridge", key2, nil), 200).Str("source"); s != "agent" {
		t.Fatalf("agent bridge source = %s", s)
	}

	// Deleting the account erases bridges through the identity event.
	in.Must(in.Do("DELETE", "/v1/me", tok, nil), 204)
	ok := testenv.Eventually(t, 5*time.Second, func() bool {
		var n int
		_ = in.Pool.QueryRow(context.Background(), `SELECT count(*) FROM ledger.bridge_history`).Scan(&n)
		return n == 0
	})
	if !ok {
		t.Fatal("bridge history not erased after account deletion")
	}
}

func TestPublishNeedsBridgeChannelAndScope(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("moe")
	ch := channel(in, tok, "general")
	r := in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "hi"}, ""), 409)
	if !strings.Contains(r.Str("detail"), "PUT /v1/me/bridge") {
		t.Fatalf("detail = %s", r.Raw)
	}
	setBridge(in, tok, "joy", "yellow")
	in.Must(publish(in, tok, map[string]any{"channel_id": "6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f", "body_md": "hi"}, ""), 404)
	in.Must(in.Do("POST", "/v1/messages", tok, map[string]any{"channel_id": ch, "body_md": "hi"}), 400) // no Idempotency-Key
	_, key := in.Agent(tok, "moe_bot", "feed:read")
	in.Must(publish(in, key, map[string]any{"channel_id": ch, "body_md": "hi"}, ""), 403)
	in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "hi", "claims": map[string]string{"emotion": "JOY", "color": "x"}}, ""), 400)
	in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "hi", "parent_id": "6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f"}, ""), 404)
}

// ADR-011: whatever the content and its risk, the sender gets the same answer.
func TestPublishResponseIsUniform(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("nia")
	setBridge(in, tok, "sad", "blue")
	ch := channel(in, tok, "uniform")

	shape := func(r *testenv.Response) string {
		id := r.Str("id")
		h := []string{}
		for _, k := range []string{"Content-Type", "Cache-Control", "Location"} {
			h = append(h, k+"="+strings.ReplaceAll(r.Header.Get(k), id, "ID"))
		}
		return fmt.Sprintf("%d %s %v", r.Status, strings.ReplaceAll(string(r.Raw), id, "ID"), h)
	}
	ordinary := in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "A calm note."}, ""), 202)
	var flood *testenv.Response
	for i := 0; i < 12; i++ {
		flood = in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "BUY NOW [x](https://a.example) [y](https://b.example) [z](https://c.example)",
			"claims": map[string]string{"emotion": "joy", "color": "yellow"}}, ""), 202)
	}
	if shape(ordinary) != shape(flood) {
		t.Fatalf("responses differ:\n%s\n%s", shape(ordinary), shape(flood))
	}
	if len(ordinary.JSON) != 1 {
		t.Fatalf("sender response carries more than the id: %s", ordinary.Raw)
	}
	for _, r := range []*testenv.Response{ordinary, flood} {
		if r.Took < 150*time.Millisecond {
			t.Fatalf("publish answered in %v, before the 150ms pad", r.Took)
		}
	}
}

func TestIdempotentPublish(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("omar")
	setBridge(in, tok, "joy", "yellow")
	ch := channel(in, tok, "idem")
	body := map[string]any{"channel_id": ch, "body_md": "once"}
	first := in.Must(publish(in, tok, body, "same-key"), 202)
	again := in.Must(publish(in, tok, body, "same-key"), 202)
	if first.Str("id") != again.Str("id") || again.Header.Get("Idempotent-Replayed") != "true" {
		t.Fatalf("replay = %s (%v)", again.Raw, again.Header)
	}
	var n int
	_ = in.Pool.QueryRow(context.Background(), `SELECT count(*) FROM ingest.messages WHERE body_md = 'once'`).Scan(&n)
	if n != 1 {
		t.Fatalf("%d rows for one idempotent message", n)
	}
	in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "different"}, "same-key"), 409)
	// Keys are per principal: another sender may use the same key.
	other, _, _ := in.Human("omar2")
	setBridge(in, other, "joy", "yellow")
	in.Must(publish(in, other, body, "same-key"), 202)
}

func TestMessagesReadBackWithStateAuthorAndSafeHTML(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("pia")
	setBridge(in, tok, "surprised", "aqua")
	ch := channel(in, tok, "readback")
	body := "# Hi\n\nSee [docs](https://example.org) <script>alert(1)</script>\n\n```emotion joy/yellow\nhappy\n```"
	id := in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": body}, ""), 202).Str("id")
	m := in.Must(in.Do("GET", "/v1/messages/"+id, tok, nil), 200)
	state := m.JSON["state"].(map[string]any)
	author := m.JSON["author"].(map[string]any)
	// The state is the sender's stance, not the joy/yellow the fence claims.
	if state["emotion"] != "surprised" || state["color"] != "aqua" || author["handle"] != "pia" {
		t.Fatalf("message = %s", m.Raw)
	}
	html := m.Str("body_html")
	if strings.Contains(html, "<script") || !strings.Contains(html, "&lt;script&gt;") || !strings.Contains(html, `data-emotion="joy"`) {
		t.Fatalf("html = %s", html)
	}
	if _, leaked := m.JSON["claims"]; leaked {
		t.Fatal("message view exposes claims")
	}
	// The claim is stored, untrusted, for the dossier.
	var claims string
	_ = in.Pool.QueryRow(context.Background(), `SELECT claims::text FROM ingest.messages WHERE id = $1`, id).Scan(&claims)
	if !strings.Contains(claims, `"emotion": "joy"`) {
		t.Fatalf("claims = %s", claims)
	}
	reply := in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "reply", "parent_id": id}, ""), 202).Str("id")
	if p := in.Must(in.Do("GET", "/v1/messages/"+reply, tok, nil), 200).Str("parent_id"); p != id {
		t.Fatalf("parent = %s", p)
	}
}

func TestChannelPagination(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("quin")
	setBridge(in, tok, "joy", "yellow")
	ch := channel(in, tok, "paged")
	for i := 0; i < 5; i++ {
		in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": fmt.Sprintf("msg %d", i)}, ""), 202)
	}
	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		path := "/v1/channels/" + ch + "/messages?limit=2"
		if cursor != "" {
			path += "&cursor=" + cursor
		}
		r := in.Must(in.Do("GET", path, tok, nil), 200)
		for _, it := range r.JSON["items"].([]any) {
			seen[it.(map[string]any)["body_md"].(string)] = true
		}
		pages++
		cursor = r.Str("next_cursor")
		if cursor == "" {
			break
		}
	}
	if len(seen) != 5 || pages != 3 {
		t.Fatalf("saw %d messages over %d pages", len(seen), pages)
	}
	in.Must(in.Do("GET", "/v1/channels/"+ch+"/messages?cursor=!!", tok, nil), 400)
	in.Must(in.Do("POST", "/v1/channels", tok, map[string]string{"handle": "paged", "title": "dup"}), 409)
	list := in.Must(in.Do("GET", "/v1/channels", tok, nil), 200)
	if len(list.JSON["items"].([]any)) != 1 {
		t.Fatalf("channels = %s", list.Raw)
	}
}

func TestDossierBuiltFromOutboxAndVisibleOnlyToAuthorsAndObservers(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("rui")
	setBridge(in, tok, "sad", "blue")
	ch := channel(in, tok, "dossier")
	spam := "Act now [a](https://a.example) [b](https://b.example) [c](https://c.example)"
	for i := 0; i < 10; i++ {
		in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": spam, "claims": map[string]string{"emotion": "joy", "color": "yellow"}}, ""), 202)
	}
	path := "/v1/dossiers/" + hashOf(spam)
	var d *testenv.Response
	ok := testenv.Eventually(t, 10*time.Second, func() bool {
		d = in.Do("GET", path, tok, nil)
		n, _ := d.JSON["seen_count"].(float64)
		return d.Status == 200 && n == 10
	})
	if !ok {
		t.Fatalf("dossier not built: %d %s", d.Status, d.Raw)
	}
	risk := d.JSON["risk"].(float64)
	drift := d.JSON["drift"].(float64)
	if risk < 0.6 || drift != 1 || len(d.JSON["signals"].([]any)) != 6 || d.JSON["version"] != "dossier-2" {
		t.Fatalf("dossier = %s", d.Raw)
	}

	// Another principal sees nothing (same 404 as unknown content) ...
	sam, _, _ := in.Human("sam_other")
	in.Must(in.Do("GET", path, sam, nil), 404)
	in.Must(in.Do("GET", "/v1/dossiers/"+strings.Repeat("0", 64), sam, nil), 404)
	// ... until granted the observer role.
	if err := identity.GrantRole(context.Background(), in.Pool, "sam_other", "observer"); err != nil {
		t.Fatal(err)
	}
	in.Must(in.Do("GET", path, sam, nil), 200)
}

func TestMediaUploadAndDownload(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	tok, _, _ := in.Human("tess")
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 64)...)
	up := in.Must(in.DoRaw("POST", "/v1/media", tok, "image/png", png), 201)
	url := up.Str("url")
	if !strings.HasPrefix(url, "/v1/media/") || up.JSON["bytes"].(float64) != float64(len(png)) {
		t.Fatalf("upload = %s", up.Raw)
	}

	resp, err := http.Get(in.URL + url)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !bytes.Equal(got, png) || resp.Header.Get("Content-Type") != "image/png" || resp.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("download %d %q %v", resp.StatusCode, resp.Header.Get("Content-Type"), len(got))
	}

	// A file whose bytes do not match its declared type is refused.
	in.Must(in.DoRaw("POST", "/v1/media", tok, "image/png", []byte("<svg onload=alert(1)>")), 400)
	in.Must(in.DoRaw("POST", "/v1/media", tok, "image/svg+xml", []byte("<svg/>")), 415)
	in.Must(in.DoRaw("POST", "/v1/media", tok, "image/png", append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 5<<20)...)), 413)
	in.Must(in.Do("GET", "/v1/media/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f", "", nil), 404)

	// An image can be referenced from a message body.
	setBridge(in, tok, "joy", "yellow")
	ch := channel(in, tok, "media")
	id := in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": "![pic](" + url + ")"}, ""), 202).Str("id")
	if html := in.Must(in.Do("GET", "/v1/messages/"+id, tok, nil), 200).Str("body_html"); !strings.Contains(html, `<img src="`+url+`"`) {
		t.Fatalf("html = %s", html)
	}
}
