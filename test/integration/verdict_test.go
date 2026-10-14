package integration

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"em2.social/em2/kernel"
	"em2.social/em2/test/testenv"
)

type feedItem struct {
	Message struct {
		ID       string            `json:"id"`
		ParentID string            `json:"parent_id"`
		State    map[string]string `json:"state"`
	} `json:"message"`
	Verdict struct {
		Kind       string   `json:"kind"`
		Score      *float64 `json:"score"`
		Threshold  float64  `json:"threshold"`
		Risk       float64  `json:"risk"`
		Reason     string   `json:"reason"`
		Shadow     bool     `json:"shadow"`
		ReleasedAt *string  `json:"released_at"`
	} `json:"verdict"`
}

func items(in *testenv.Instance, path, token string) []feedItem {
	in.T.Helper()
	r := in.Must(in.Do("GET", path, token, nil), 200)
	var body struct {
		Items []feedItem `json:"items"`
	}
	if err := json.Unmarshal(r.Raw, &body); err != nil {
		in.T.Fatal(err)
	}
	return body.Items
}

// waitItem polls a feed-like list until it holds the message.
func waitItem(in *testenv.Instance, path, token, messageID string) *feedItem {
	in.T.Helper()
	var found *feedItem
	testenv.Eventually(in.T, 5*time.Second, func() bool {
		for _, it := range items(in, path, token) {
			if it.Message.ID == messageID {
				it := it
				found = &it
				return true
			}
		}
		return false
	})
	return found
}

// settle waits until the outbox is drained, so absences can be asserted.
func settle(in *testenv.Instance) {
	in.T.Helper()
	ok := testenv.Eventually(in.T, 5*time.Second, func() bool {
		var n int
		_ = in.Pool.QueryRow(context.Background(), `SELECT count(*) FROM kernel.outbox WHERE dispatched_at IS NULL`).Scan(&n)
		return n == 0
	})
	if !ok {
		in.T.Fatal("outbox did not drain")
	}
}

func subscribe(in *testenv.Instance, token, channelID string) {
	in.T.Helper()
	in.Must(in.Do("PUT", "/v1/me/subscriptions/"+channelID, token, nil), 204)
}

func has(list []feedItem, id string) bool {
	for _, it := range list {
		if it.Message.ID == id {
			return true
		}
	}
	return false
}

func TestVerdictPerReceiverInEnforceMode(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	author, _, authorID := in.Human("author")
	fits, _, _ := in.Human("fits")
	far, _, _ := in.Human("far")
	blocker, _, _ := in.Human("blocker")
	blank, _, _ := in.Human("blank")
	setBridge(in, author, "joy", "yellow")
	setBridge(in, fits, "trust", "lime")
	setBridge(in, far, "sad", "blue")
	setBridge(in, blocker, "joy", "yellow")
	ch := channel(in, author, "verdicts")
	for _, tok := range []string{fits, far, blocker, blank, author} {
		subscribe(in, tok, ch)
	}
	in.Must(in.Do("PUT", "/v1/me/blocks/"+authorID, blocker, nil), 204)

	id := in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "A calm note about the garden."}, ""), 202).Str("id")

	it := waitItem(in, "/v1/me/feed", fits, id)
	if it == nil || it.Verdict.Kind != "pass" || it.Verdict.Score == nil || *it.Verdict.Score != 0.75 || it.Verdict.Shadow || it.Verdict.Reason == "" {
		t.Fatalf("fits: %+v", it)
	}
	if it.Message.State["emotion"] != "joy" {
		t.Fatalf("feed message state = %v", it.Message.State)
	}
	if it := waitItem(in, "/v1/me/feed", blank, id); it == nil || it.Verdict.Kind != "pass" || it.Verdict.Score != nil {
		t.Fatalf("no bridge: %+v", it)
	}
	d := waitItem(in, "/v1/me/deferred", far, id)
	if d == nil || d.Verdict.Kind != "defer" || *d.Verdict.Score != 0 {
		t.Fatalf("far: %+v", d)
	}
	settle(in)
	if has(items(in, "/v1/me/feed", far), id) {
		t.Fatal("a deferred message reached the feed")
	}
	if has(items(in, "/v1/me/feed", blocker), id) || has(items(in, "/v1/me/deferred", blocker), id) {
		t.Fatal("a blocked sender reached the blocker")
	}
	if len(items(in, "/v1/me/feed", author)) != 0 {
		t.Fatal("the author received their own message")
	}

	// Changing the far receiver's bridge releases the deferred message.
	setBridge(in, far, "joy", "orange")
	r := waitItem(in, "/v1/me/feed", far, id)
	if r == nil || r.Verdict.Kind != "pass" || r.Verdict.ReleasedAt == nil {
		t.Fatalf("release after bridge change: %+v", r)
	}
	if has(items(in, "/v1/me/deferred", far), id) {
		t.Fatal("released message still listed as deferred")
	}
}

func TestFilterOffReleasesDeferred(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	author, _, _ := in.Human("author")
	far, _, _ := in.Human("far")
	setBridge(in, author, "joy", "yellow")
	setBridge(in, far, "sad", "blue")
	ch := channel(in, author, "filtering")
	subscribe(in, far, ch)
	id := in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "Bright news."}, ""), 202).Str("id")
	if waitItem(in, "/v1/me/deferred", far, id) == nil {
		t.Fatal("not deferred")
	}
	s := in.Must(in.Do("GET", "/v1/me/settings", far, nil), 200)
	if s.JSON["threshold"] != 0.5 || s.JSON["threshold_is_default"] != true || s.JSON["filter"] != true {
		t.Fatalf("default settings: %s", s.Raw)
	}
	in.Must(in.Do("PATCH", "/v1/me/settings", far, map[string]any{"threshold": 1.5}), 400)
	s = in.Must(in.Do("PATCH", "/v1/me/settings", far, map[string]any{"filter": false}), 200)
	if s.JSON["filter"] != false {
		t.Fatalf("settings: %s", s.Raw)
	}
	r := waitItem(in, "/v1/me/feed", far, id)
	if r == nil || r.Verdict.Kind != "pass" || r.Verdict.ReleasedAt == nil {
		t.Fatalf("release after filter off: %+v", r)
	}
}

func TestShadowModeDeliversEverythingWithTheRealVerdict(t *testing.T) {
	in := testenv.Start(t, testenv.Options{}) // shadow is the default
	author, _, authorID := in.Human("author")
	far, _, _ := in.Human("far")
	blocker, _, _ := in.Human("blocker")
	setBridge(in, author, "joy", "yellow")
	setBridge(in, far, "sad", "blue")
	setBridge(in, blocker, "joy", "yellow")
	ch := channel(in, author, "shadowed")
	subscribe(in, far, ch)
	subscribe(in, blocker, ch)
	in.Must(in.Do("PUT", "/v1/me/blocks/"+authorID, blocker, nil), 204)
	id := in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "Shadowed."}, ""), 202).Str("id")
	if it := waitItem(in, "/v1/me/feed", far, id); it == nil || it.Verdict.Kind != "defer" || !it.Verdict.Shadow {
		t.Fatalf("shadow defer: %+v", it)
	}
	if it := waitItem(in, "/v1/me/feed", blocker, id); it == nil || it.Verdict.Kind != "deny" || !it.Verdict.Shadow {
		t.Fatalf("shadow deny: %+v", it)
	}
}

func TestThreeRepliesMoveTheMessageAndReleaseADeferredReceiver(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	author, _, _ := in.Human("author")
	setBridge(in, author, "joy", "yellow")
	ch := channel(in, author, "pressure")
	var repliers []string
	for _, h := range []string{"pia", "pal", "pom"} {
		tok, _, _ := in.Human(h)
		setBridge(in, tok, "trust", "lime")
		subscribe(in, tok, ch)
		repliers = append(repliers, tok)
	}
	waiting, _, _ := in.Human("waiting")
	setBridge(in, waiting, "surprised", "aqua") // 0.25 against joy/yellow, 0.50 against trust/lime
	subscribe(in, waiting, ch)
	outsider, _, _ := in.Human("outsider")
	setBridge(in, outsider, "trust", "lime") // not subscribed: no pass exchange, no pressure

	id := in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "How was your day?"}, ""), 202).Str("id")
	for _, tok := range repliers {
		if waitItem(in, "/v1/me/feed", tok, id) == nil {
			t.Fatal("not delivered to a replier")
		}
	}
	if waitItem(in, "/v1/me/deferred", waiting, id) == nil {
		t.Fatal("not deferred for the far receiver")
	}

	reply := func(tok, body string) {
		in.Must(publish(in, tok, map[string]any{"channel_id": ch, "parent_id": id, "body_md": body}, ""), 202)
	}
	reply(outsider, "I was not offered this.")
	reply(author, "Answering myself.")
	reply(repliers[0], "Good, thanks.")
	reply(repliers[1], "Quiet and fine.")
	reply(repliers[0], "Still good.") // the same actor again is capped
	settle(in)

	p := in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge/pressure", repliers[0], nil), 200)
	pools := p.JSON["pools"].([]any)
	if len(pools) != 1 || pools[0].(map[string]any)["pressure"] != 2.0 || pools[0].(map[string]any)["contributors"] != 2.0 || p.JSON["theta"] != 3.0 {
		t.Fatalf("pressure: %s", p.Raw)
	}
	if strings.Contains(string(p.Raw), "actor") || strings.Contains(string(p.Raw), "pia") {
		t.Fatalf("pressure names its contributors: %s", p.Raw)
	}
	in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge/pressure", outsider, nil), 404)
	in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge/pressure", author, nil), 404)
	if st := in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge", outsider, nil), 200); st.JSON["version"] != 1.0 {
		t.Fatalf("state before the third reply: %s", st.Raw)
	}

	reply(repliers[2], "Lovely.")
	ok := testenv.Eventually(t, 5*time.Second, func() bool {
		st := in.Do("GET", "/v1/messages/"+id+"/bridge", outsider, nil)
		return st.JSON["version"] == 2.0
	})
	if !ok {
		t.Fatal("three replies did not move the message")
	}
	st := in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge", outsider, nil), 200)
	if s := st.JSON["state"].(map[string]any); s["emotion"] != "trust" || s["color"] != "lime" || st.JSON["transitions"] != 1.0 {
		t.Fatalf("state after: %s", st.Raw)
	}
	tr := in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge/transitions", outsider, nil), 200)
	list := tr.JSON["items"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["contributors"] != 3.0 || list[0].(map[string]any)["trigger_id"] != nil {
		t.Fatalf("transitions: %s", tr.Raw)
	}
	// The released receiver now has the message, and readers see the new state.
	r := waitItem(in, "/v1/me/feed", waiting, id)
	if r == nil || r.Verdict.ReleasedAt == nil || r.Verdict.Kind != "pass" || *r.Verdict.Score != 0.5 {
		t.Fatalf("release after transition: %+v", r)
	}
	ok = testenv.Eventually(t, 5*time.Second, func() bool {
		m := in.Do("GET", "/v1/messages/"+id, outsider, nil)
		s, _ := m.JSON["state"].(map[string]any)
		return s != nil && s["emotion"] == "trust"
	})
	if !ok {
		t.Fatal("GET /v1/messages does not show the new state")
	}
}

func TestBraceAndUnbrace(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	author, _, _ := in.Human("author")
	fan, _, _ := in.Human("fan")
	setBridge(in, author, "joy", "yellow")
	setBridge(in, fan, "anticipated", "orange")
	ch := channel(in, author, "braces")
	subscribe(in, fan, ch)
	id := in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "Brace me."}, ""), 202).Str("id")
	if waitItem(in, "/v1/me/feed", fan, id) == nil {
		t.Fatal("not delivered")
	}
	pressure := func() float64 {
		p := in.Must(in.Do("GET", "/v1/messages/"+id+"/bridge/pressure", fan, nil), 200)
		pools := p.JSON["pools"].([]any)
		if len(pools) == 0 {
			return 0
		}
		return pools[0].(map[string]any)["pressure"].(float64)
	}
	in.Must(in.Do("PUT", "/v1/messages/"+id+"/braces/me", fan, nil), 204)
	in.Must(in.Do("PUT", "/v1/messages/"+id+"/braces/me", fan, nil), 204) // idempotent
	if p := pressure(); p != 0.5 {
		t.Fatalf("after brace: %v", p)
	}
	in.Must(in.Do("DELETE", "/v1/messages/"+id+"/braces/me", fan, nil), 204)
	in.Must(in.Do("DELETE", "/v1/messages/"+id+"/braces/me", fan, nil), 204)
	if p := pressure(); p != 0 {
		t.Fatalf("after unbrace: %v", p)
	}
	in.Must(in.Do("PUT", "/v1/messages/00000000-0000-4000-8000-000000000000/braces/me", fan, nil), 404)
}

func TestFloodIsShapedForReceiversAndSenderSeesNoDifference(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	owner, _, _ := in.Human("owner")
	reader, _, _ := in.Human("reader")
	setBridge(in, reader, "joy", "yellow")
	_, bot := in.Agent(owner, "flooder")
	setBridge(in, bot, "joy", "yellow")
	ch := channel(in, owner, "market")
	subscribe(in, reader, ch)
	var first []byte
	var ids []string
	for i := 0; i < 10; i++ {
		r := in.Must(publish(in, bot, map[string]any{"channel_id": ch, "body_md": "BUY NOW https://a.example https://b.example https://c.example",
			"claims": map[string]string{"emotion": "joy", "color": "yellow"}}, ""), 202)
		id := r.Str("id")
		ids = append(ids, id)
		norm := []byte(strings.ReplaceAll(string(r.Raw), id, "ID"))
		if first == nil {
			first = norm
		} else if string(first) != string(norm) {
			t.Fatalf("sender responses differ: %s vs %s", first, norm)
		}
		settle(in)
	}
	last := waitItem(in, "/v1/me/feed", reader, ids[len(ids)-1])
	if last == nil || last.Verdict.Kind != "shape" || last.Verdict.Risk < 0.6 {
		t.Fatalf("last flood copy: %+v", last)
	}
	firstItem := waitItem(in, "/v1/me/feed", reader, ids[0])
	if firstItem == nil || firstItem.Verdict.Kind != "pass" {
		t.Fatalf("first copy: %+v", firstItem)
	}
}
