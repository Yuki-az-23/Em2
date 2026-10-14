package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"em2.social/em2/internal/modules/identity"
	"em2.social/em2/internal/modules/ledger"
	"em2.social/em2/kernel"
	"em2.social/em2/test/testenv"
)

func quota(r *testenv.Response, kind string) (limit, used float64) {
	q := r.JSON["quotas"].(map[string]any)[kind].(map[string]any)
	return q["limit"].(float64), q["used"].(float64)
}

func TestQuotasAnswer429AndAreShownInTheLedger(t *testing.T) {
	in := testenv.Start(t, testenv.Options{MessagesPerHour: 3, EgressPerDay: 1})
	tok, _, _ := in.Human("quinn")
	setBridge(in, tok, "joy", "yellow")
	ch := channel(in, tok, "quota-room")
	for i := 0; i < 3; i++ {
		in.Must(publish(in, tok, map[string]any{"channel_id": ch, "body_md": fmt.Sprintf("note %d", i)}, ""), 202)
	}
	r := publish(in, tok, map[string]any{"channel_id": ch, "body_md": "one too many"}, "")
	if r.Status != 429 || !strings.Contains(r.Str("detail"), "quota") {
		t.Fatalf("over quota: %d %s", r.Status, r.Raw)
	}
	// Ingress counts against the same quota, even to an unknown handle.
	if r := sendIngress(in, tok, "nobody_at_all", `{"x":1}`); r.Status != 429 {
		t.Fatalf("ingress over quota: %d %s", r.Status, r.Raw)
	}
	l := in.Must(in.Do("GET", "/v1/me/ledger", tok, nil), 200)
	if lim, used := quota(l, "messages"); lim != 3 || used != 3 {
		t.Fatalf("messages quota: %s", l.Raw)
	}
	if _, ok := l.JSON["reputation"]; ok {
		t.Fatal("a principal sees their own reputation; it would reveal receivers' denies")
	}
	if l.JSON["bridge"].(map[string]any)["emotion"] != "joy" || l.JSON["settings"].(map[string]any)["card"] != "emotion" {
		t.Fatalf("ledger: %s", l.Raw)
	}

	_, bot := in.Agent(tok, "fetcher", "egress:fetch")
	site := httptest.NewServer(nil)
	defer site.Close()
	in.Do("POST", "/v1/egress/fetch", bot, map[string]string{"url": site.URL})
	if r := in.Do("POST", "/v1/egress/fetch", bot, map[string]string{"url": site.URL}); r.Status != 429 {
		t.Fatalf("egress over quota: %d %s", r.Status, r.Raw)
	}
}

func TestProbingAReceiverIsDeniedAndPenalized(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	target, _, _ := in.Human("target")
	prober, _, proberID := in.Human("prober")
	watcher, _, _ := in.Human("watcher")
	if err := identity.GrantRole(context.Background(), in.Pool, "watcher", "observer"); err != nil {
		t.Fatal(err)
	}
	setBridge(in, target, "joy", "yellow")
	setBridge(in, prober, "feared", "green") // two steps on both wheels: score 0.50, right at the threshold
	ch := channel(in, prober, "probe-room")
	subscribe(in, target, ch)
	var ids []string
	var first string
	for i := 1; i <= 6; i++ {
		r := in.Must(publish(in, prober, map[string]any{"channel_id": ch, "body_md": fmt.Sprintf("Variant %d of the same pitch.", i)}, ""), 202)
		ids = append(ids, r.Str("id"))
		norm := strings.ReplaceAll(string(r.Raw), r.Str("id"), "ID")
		if first == "" {
			first = norm
		} else if norm != first {
			t.Fatalf("the prober can tell the responses apart: %s vs %s", first, norm)
		}
		settle(in)
	}
	feed := items(in, "/v1/me/feed", target)
	if len(feed) != 4 {
		t.Fatalf("target's feed holds %d variants, want the first 4", len(feed))
	}
	for _, id := range ids[4:] {
		if has(feed, id) || has(items(in, "/v1/me/deferred", target), id) {
			t.Fatalf("probe variant %s reached the target", id)
		}
	}
	var reason string
	_ = in.Pool.QueryRow(context.Background(), `SELECT reason FROM verdict.exchanges WHERE message_id = $1`, ids[4]).Scan(&reason)
	if !strings.Contains(reason, "probes your threshold") {
		t.Fatalf("fifth variant reason: %q", reason)
	}

	ok := testenv.Eventually(t, 5*time.Second, func() bool {
		l := in.Do("GET", "/v1/principals/"+proberID+"/ledger", watcher, nil)
		rep, _ := l.JSON["reputation"].(map[string]any)
		return rep != nil && rep["probes"] == 1.0 && rep["denies"] == 2.0 && rep["passes"] == 4.0
	})
	if !ok {
		t.Fatalf("observer ledger: %s", in.Do("GET", "/v1/principals/"+proberID+"/ledger", watcher, nil).Raw)
	}
	l := in.Must(in.Do("GET", "/v1/principals/"+proberID+"/ledger", watcher, nil), 200)
	pens := l.JSON["penalties"].([]any)
	if len(pens) != 1 || pens[0].(map[string]any)["reason"] != "probe" || pens[0].(map[string]any)["factor"] != 0.25 {
		t.Fatalf("penalties: %s", l.Raw)
	}
	if lim, _ := quota(in.Must(in.Do("GET", "/v1/me/ledger", prober, nil), 200), "messages"); lim != 30 {
		t.Fatalf("prober's message quota = %v, want 30 (120 × 0.25)", lim)
	}
	// Only observers see another principal's ledger.
	in.Must(in.Do("GET", "/v1/principals/"+proberID+"/ledger", target, nil), 404)
}

func TestReconciliationRepairsInjectedDrift(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce, ReconcileEvery: 100 * time.Millisecond})
	author, _, authorID := in.Human("author")
	reader, _, _ := in.Human("reader")
	blocker, _, _ := in.Human("blocker")
	setBridge(in, author, "joy", "yellow")
	setBridge(in, reader, "joy", "yellow")
	setBridge(in, blocker, "joy", "yellow")
	ch := channel(in, author, "recon")
	subscribe(in, reader, ch)
	subscribe(in, blocker, ch)
	in.Must(in.Do("PUT", "/v1/me/blocks/"+authorID, blocker, nil), 204)
	in.Must(publish(in, author, map[string]any{"channel_id": ch, "body_md": "Counted."}, ""), 202)
	settle(in)

	read := func() (p, d int) {
		_ = in.Pool.QueryRow(context.Background(), `SELECT passes, denies FROM ledger.reputation WHERE principal_id = $1`, authorID).Scan(&p, &d)
		return
	}
	if !testenv.Eventually(t, 5*time.Second, func() bool { p, d := read(); return p == 1 && d == 1 }) {
		p, d := read()
		t.Fatalf("reputation after one pass and one deny: %d %d", p, d)
	}
	if _, err := in.Pool.Exec(context.Background(), `UPDATE ledger.reputation SET passes = 99 WHERE principal_id = $1`, authorID); err != nil {
		t.Fatal(err)
	}
	if !testenv.Eventually(t, 5*time.Second, func() bool { p, _ := read(); return p == 1 }) {
		t.Fatal("injected drift was not repaired")
	}
	var repaired int
	_ = in.Pool.QueryRow(context.Background(), `SELECT COALESCE(sum(repaired), 0) FROM ledger.reconciliations`).Scan(&repaired)
	if repaired < 1 {
		t.Fatalf("reconciliations recorded %d repairs", repaired)
	}
	rec := httptest.NewRecorder()
	in.Kernel.AdminHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(rec.Body.String(), "\nem2_ledger_drift_total ") || strings.Contains(rec.Body.String(), "\nem2_ledger_drift_total 0\n") {
		t.Fatalf("metric missing or zero:\n%s", rec.Body.String())
	}
}

func TestSnapshotsFollowTheContract(t *testing.T) {
	in := testenv.Start(t, testenv.Options{SnapshotEvery: 100 * time.Millisecond})
	tok, _, id := in.Human("snap")
	setBridge(in, tok, "trust", "lime")
	var body []byte
	testenv.Eventually(t, 5*time.Second, func() bool {
		_ = in.Pool.QueryRow(context.Background(), `SELECT body FROM ledger.snapshots WHERE principal_id = $1 ORDER BY at DESC LIMIT 1`, id).Scan(&body)
		return body != nil
	})
	if body == nil {
		t.Fatal("no snapshot stored")
	}
	if errs := ledger.ObserverLedgerView.ValidateJSON(body); len(errs) > 0 {
		t.Fatalf("stored snapshot breaks the contract: %v\n%s", errs, body)
	}
	var snap map[string]any
	_ = json.Unmarshal(body, &snap)
	if snap["bridge"].(map[string]any)["emotion"] != "trust" {
		t.Fatalf("snapshot: %s", body)
	}
}

func TestPublicCardShowsOnlyACoarseState(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	me, _, myID := in.Human("cardholder")
	other, _, _ := in.Human("visitor")
	setBridge(in, me, "sad", "blue")
	c := in.Must(in.Do("GET", "/v1/principals/"+myID, other, nil), 200)
	if c.Str("handle") != "cardholder" || c.Str("emotion") != "sad" {
		t.Fatalf("card: %s", c.Raw)
	}
	for _, leak := range []string{"blue", "threshold", "color", "set_at", "email"} {
		if strings.Contains(string(c.Raw), leak) {
			t.Fatalf("card leaks %s: %s", leak, c.Raw)
		}
	}
	in.Must(in.Do("PATCH", "/v1/me/settings", me, map[string]any{"card": "hidden"}), 200)
	if c := in.Must(in.Do("GET", "/v1/principals/"+myID, other, nil), 200); c.JSON["emotion"] != nil {
		t.Fatalf("hidden card: %s", c.Raw)
	}
	in.Must(in.Do("GET", "/v1/principals/00000000-0000-4000-8000-000000000000", other, nil), 404)
}

func TestShapedMessagesAreLimitedPerSender(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce, ExpireEvery: 100 * time.Millisecond})
	owner, _, _ := in.Human("owner")
	reader, _, _ := in.Human("reader")
	setBridge(in, reader, "joy", "yellow")
	_, bot := in.Agent(owner, "flooder")
	setBridge(in, bot, "joy", "yellow")
	ch := channel(in, owner, "shaped")
	subscribe(in, reader, ch)
	var ids []string
	for i := 0; i < 10; i++ {
		r := in.Must(publish(in, bot, map[string]any{"channel_id": ch, "body_md": "BUY NOW https://a.example https://b.example https://c.example",
			"claims": map[string]string{"emotion": "sad", "color": "blue"}}, ""), 202)
		ids = append(ids, r.Str("id"))
		settle(in)
	}
	var held []feedItem
	for _, it := range items(in, "/v1/me/deferred", reader) {
		if strings.Contains(it.Verdict.Reason, "limited to one every 60 seconds") {
			held = append(held, it)
		}
	}
	shaped := 0
	for _, it := range items(in, "/v1/me/feed", reader) {
		if it.Verdict.Kind == "shape" {
			shaped++
		}
	}
	if shaped != 1 || len(held) == 0 {
		t.Fatalf("shaped delivered %d, held %d", shaped, len(held))
	}
	// When the interval is over, the next held message is delivered.
	if _, err := in.Pool.Exec(context.Background(), `UPDATE verdict.exchanges SET delivered_at = delivered_at - interval '2 minutes'
		WHERE kind = 'shape' AND delivered_at IS NOT NULL`); err != nil {
		t.Fatal(err)
	}
	if _, err := in.Pool.Exec(context.Background(), `UPDATE verdict.exchanges SET hold_until = now() - interval '1 second' WHERE hold_until IS NOT NULL`); err != nil {
		t.Fatal(err)
	}
	ok := testenv.Eventually(t, 5*time.Second, func() bool {
		n := 0
		for _, it := range items(in, "/v1/me/feed", reader) {
			if it.Verdict.Kind == "shape" {
				n++
			}
		}
		return n == 2
	})
	if !ok {
		t.Fatal("a held shaped message was not released after its interval")
	}
}

func TestBridgingVectorRaisesTheRiskOfFarDeliveries(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Mode: kernel.ModeEnforce})
	pusher, _, _ := in.Human("pusher")
	setBridge(in, pusher, "angry", "red")
	ch := channel(in, pusher, "far-room")
	for _, h := range []string{"far_one", "far_two"} {
		tok, _, _ := in.Human(h)
		setBridge(in, tok, "trust", "lime") // 0.25 against angry/red
		subscribe(in, tok, ch)
	}
	body := "Come join us, everyone is welcome here."
	for i := 0; i < 3; i++ {
		in.Must(publish(in, pusher, map[string]any{"channel_id": ch, "body_md": body}, ""), 202)
		settle(in)
	}
	d := in.Must(in.Do("GET", "/v1/dossiers/"+hashOf(body), pusher, nil), 200)
	var dos struct {
		Bridging float64 `json:"bridging"`
		Signals  []struct {
			Name  string  `json:"name"`
			Value float64 `json:"value"`
		} `json:"signals"`
	}
	_ = json.Unmarshal(d.Raw, &dos)
	v := -1.0
	for _, s := range dos.Signals {
		if s.Name == "bridging_vector" {
			v = s.Value
		}
	}
	// The third copy's dossier sees the four far deliveries of the first two.
	if dos.Bridging != 1 || v != 1 {
		t.Fatalf("bridging %v signal %v: %s", dos.Bridging, v, d.Raw)
	}
}
