package integration

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
	"em2.social/em2/test/testenv"
)

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

//go:embed testdata/probe/*.sql
var probeMigrations embed.FS

// probe is a test-only module with its own schema. It tries to read another
// module's table, consumes identity events, and publishes from a handler that fails.
type probe struct {
	failFirst atomic.Int32 // deliveries to fail before succeeding
	calls     atomic.Int32
}

func (p *probe) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(probeMigrations, "testdata/probe")
	return kernel.Manifest{Name: "probe", Version: "0.0.1", Kind: kernel.KindModule, Schema: "probe", Migrations: sub}
}

func (p *probe) Register(r *kernel.Registry) error {
	r.Emits(kernel.EventDef{Name: "probe.thing.happened", Version: 1, Schema: schema.Object(schema.Req("n", schema.Integer()))})
	r.Subscribe("identity.principal.registered", 1, func(c kernel.Ctx, e kernel.Envelope) error {
		p.calls.Add(1)
		if p.failFirst.Add(-1) >= 0 {
			return errors.New("simulated subscriber failure")
		}
		var payload struct {
			PrincipalID string `json:"principal_id"`
		}
		if err := json.Unmarshal(e.Payload, &payload); err != nil {
			return err
		}
		_, err := c.DB().Exec(c, `INSERT INTO seen (principal_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, payload.PrincipalID, e.ID)
		return err
	})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/probe/own", OperationID: "probeOwn", Handler: func(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
		var n int
		if err := c.DB().QueryRow(c, `SELECT count(*) FROM seen`).Scan(&n); err != nil {
			return nil, err
		}
		return kernel.JSON(200, map[string]int{"n": n}), nil
	}})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/probe/steal", OperationID: "probeSteal", Handler: func(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
		var n int
		if err := c.DB().QueryRow(c, `SELECT count(*) FROM identity.principals`).Scan(&n); err != nil {
			return nil, err
		}
		return kernel.JSON(200, map[string]int{"n": n}), nil
	}})
	r.Route(kernel.Route{Method: "POST", Path: "/v1/probe/publish-then-fail", OperationID: "probePublishFail", Handler: func(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
		if err := c.Publish("probe.thing.happened", map[string]int{"n": 1}); err != nil {
			return nil, err
		}
		return nil, kernel.ErrConflict
	}})
	return nil
}

// ADR-003: with role isolation a module cannot read another module's schema.
func TestRoleIsolationBlocksCrossSchemaQueries(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Extra: []kernel.Module{&probe{}}})
	in.Must(in.Do("GET", "/v1/probe/own", "", nil), 200)
	steal := in.Must(in.Do("GET", "/v1/probe/steal", "", nil), 500)
	if strings.Contains(string(steal.Raw), "identity") || strings.Contains(string(steal.Raw), "permission") {
		t.Fatalf("error leaks detail: %s", steal.Raw)
	}
	// Confirm the cause is the database permission, not something else.
	ctx := context.Background()
	tx, err := in.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SET LOCAL ROLE em2_probe`); err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `SELECT 1 FROM identity.principals LIMIT 1`)
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("expected permission denied, got %v", err)
	}
}

// The outbox delivers each event to each subscriber at least once, retries
// failures, and records exactly one delivery once the subscriber commits.
func TestOutboxRetriesUntilDelivered(t *testing.T) {
	p := &probe{}
	p.failFirst.Store(2)
	in := testenv.Start(t, testenv.Options{Extra: []kernel.Module{p}})
	_, _, id := in.Human("jules")
	ctx := context.Background()
	ok := testenv.Eventually(t, 5*time.Second, func() bool {
		var n int
		_ = in.Pool.QueryRow(ctx, `SELECT count(*) FROM probe.seen WHERE principal_id = $1`, id).Scan(&n)
		return n == 1
	})
	if !ok {
		t.Fatalf("event never delivered (calls=%d)", p.calls.Load())
	}
	if c := p.calls.Load(); c != 3 {
		t.Fatalf("subscriber called %d times, want 3 (two failures, one success)", c)
	}
	var deliveries, pending, attempts int
	_ = in.Pool.QueryRow(ctx, `SELECT count(*) FROM kernel.deliveries WHERE subscriber = 'probe:identity.principal.registered'`).Scan(&deliveries)
	_ = in.Pool.QueryRow(ctx, `SELECT count(*) FROM kernel.outbox WHERE dispatched_at IS NULL`).Scan(&pending)
	_ = in.Pool.QueryRow(ctx, `SELECT max(attempts) FROM kernel.outbox WHERE name = 'identity.principal.registered'`).Scan(&attempts)
	if deliveries != 1 || pending != 0 || attempts != 2 {
		t.Fatalf("deliveries=%d pending=%d attempts=%d", deliveries, pending, attempts)
	}
	// A second dispatch pass does not redeliver.
	if _, err := in.Kernel.DispatchOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if c := p.calls.Load(); c != 3 {
		t.Fatalf("redelivered after success: %d calls", c)
	}
}

// An event published by a handler that fails is rolled back with it.
func TestPublishIsTransactional(t *testing.T) {
	in := testenv.Start(t, testenv.Options{Extra: []kernel.Module{&probe{}}})
	in.Must(in.Do("POST", "/v1/probe/publish-then-fail", "", nil), 409)
	var n int
	if err := in.Pool.QueryRow(context.Background(), `SELECT count(*) FROM kernel.outbox WHERE name = 'probe.thing.happened'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("rolled-back handler left %d outbox rows", n)
	}
}

func TestMigrationsAreIdempotentAndImmutable(t *testing.T) {
	in := testenv.Start(t, testenv.Options{})
	ctx := context.Background()
	ran, err := in.Kernel.Migrate(ctx)
	if err != nil || len(ran) != 0 {
		t.Fatalf("second migrate ran %v, err %v", ran, err)
	}
	if pending, err := in.Kernel.PendingMigrations(ctx); err != nil || len(pending) != 0 {
		t.Fatalf("pending %v err %v", pending, err)
	}
	if _, err := in.Pool.Exec(ctx, `UPDATE kernel.migrations SET checksum = 'tampered' WHERE module = 'identity'`); err != nil {
		t.Fatal(err)
	}
	if _, err := in.Kernel.Migrate(ctx); err == nil || !strings.Contains(err.Error(), "changed after it was applied") {
		t.Fatalf("tampered migration not detected: %v", err)
	}
}

func TestReadinessFollowsMigrations(t *testing.T) {
	in := testenv.Start(t, testenv.Options{NoMigrate: true})
	r := in.Must(in.Do("GET", "/readyz", "", nil), 503)
	if strings.TrimSpace(string(r.Raw)) != `{"status":"not ready"}` {
		t.Fatalf("readyz body %s", r.Raw)
	}
	if _, err := in.Kernel.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	ok := testenv.Eventually(t, 7*time.Second, func() bool { return in.Do("GET", "/readyz", "", nil).Status == 200 })
	if !ok {
		t.Fatal("not ready after migrating")
	}
}
