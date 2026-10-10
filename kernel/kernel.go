package kernel

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"em2.social/em2/core"
)

// Config configures a kernel.
type Config struct {
	Pool             *pgxpool.Pool // nil runs without a database (unit tests)
	Mode             RunMode       // default shadow
	Logger           *slog.Logger  // default: discard
	RoleIsolation    bool          // run each module's transactions as its own database role
	RolePrefix       string        // default "em2_"
	TrustProxy       bool          // take the client IP from the last X-Forwarded-For entry
	Now              func() time.Time
	DispatchInterval time.Duration // outbox poll interval; default 500ms
}

type eventInfo struct {
	def    EventDef
	module string
}

// Kernel holds the registered system.
type Kernel struct {
	cfg        Config
	log        *slog.Logger
	modules    []Module
	manifests  map[string]Manifest
	order      []string
	routes     []*Route
	events     map[string]eventInfo
	subs       []subscription
	services   map[string][]any
	jobs       []job
	auth       AuthenticateFunc
	authModule string
	errs       []error

	mux      *http.ServeMux
	limiter  *limiter
	metrics  *metrics
	booted   bool
	ready    atomic.Bool
	draining atomic.Bool
	inflight sync.WaitGroup
	wake     chan struct{}
}

// New creates a kernel. Register modules, then Boot.
func New(cfg Config) *Kernel {
	if cfg.Mode == "" {
		cfg.Mode = ModeShadow
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewJSONHandler(io.Discard, nil))
	}
	if cfg.RolePrefix == "" {
		cfg.RolePrefix = "em2_"
	}
	if cfg.Now == nil {
		cfg.Now = func() time.Time { return time.Now().UTC() }
	}
	if cfg.DispatchInterval == 0 {
		cfg.DispatchInterval = 500 * time.Millisecond
	}
	return &Kernel{
		cfg:       cfg,
		log:       cfg.Logger,
		manifests: map[string]Manifest{},
		events:    map[string]eventInfo{},
		services:  map[string][]any{},
		limiter:   newLimiter(cfg.Now),
		metrics:   newMetrics(),
		wake:      make(chan struct{}, 1),
	}
}

func (k *Kernel) bootErr(err error) { k.errs = append(k.errs, err) }

// Register adds modules. Order does not matter; Boot sorts by DependsOn.
func (k *Kernel) Register(mods ...Module) error {
	if k.booted {
		return errors.New("kernel: register after boot")
	}
	for _, m := range mods {
		man := m.Manifest()
		if !nameRe.MatchString(man.Name) || man.Name == "kernel" {
			return fmt.Errorf("kernel: invalid module name %q", man.Name)
		}
		if man.Schema != "" && (!nameRe.MatchString(man.Schema) || man.Schema == "kernel" || man.Schema == "public") {
			return fmt.Errorf("kernel: module %s has invalid schema %q", man.Name, man.Schema)
		}
		if _, dup := k.manifests[man.Name]; dup {
			return fmt.Errorf("kernel: module %s registered twice", man.Name)
		}
		for _, other := range k.manifests {
			if man.Schema != "" && other.Schema == man.Schema {
				return fmt.Errorf("kernel: modules %s and %s both claim schema %s", other.Name, man.Name, man.Schema)
			}
		}
		k.manifests[man.Name] = man
		k.modules = append(k.modules, m)
	}
	return nil
}

// dependencyOrder sorts manifests so every module comes after its
// dependencies. It fails on unknown dependencies and cycles.
func dependencyOrder(manifests map[string]Manifest) ([]string, error) {
	names := make([]string, 0, len(manifests))
	for n := range manifests {
		names = append(names, n)
	}
	sort.Strings(names)
	const (
		unvisited = iota
		visiting
		done
	)
	state := map[string]int{}
	var order []string
	var visit func(n string, path []string) error
	visit = func(n string, path []string) error {
		switch state[n] {
		case visiting:
			return fmt.Errorf("kernel: dependency cycle: %s", strings.Join(append(path, n), " -> "))
		case done:
			return nil
		}
		state[n] = visiting
		deps := append([]string(nil), manifests[n].DependsOn...)
		sort.Strings(deps)
		for _, d := range deps {
			if _, ok := manifests[d]; !ok {
				return fmt.Errorf("kernel: %s depends on unknown module %s", n, d)
			}
			if err := visit(d, append(path, n)); err != nil {
				return err
			}
		}
		state[n] = done
		order = append(order, n)
		return nil
	}
	for _, n := range names {
		if err := visit(n, nil); err != nil {
			return nil, err
		}
	}
	return order, nil
}

// Boot registers every module in dependency order, checks the event graph and
// builds the HTTP handler. It does not run migrations (see Migrate).
func (k *Kernel) Boot() error {
	if k.booted {
		return errors.New("kernel: boot twice")
	}
	order, err := dependencyOrder(k.manifests)
	if err != nil {
		return err
	}
	k.order = order
	byName := map[string]Module{}
	for _, m := range k.modules {
		byName[m.Manifest().Name] = m
	}
	k.registerBuiltins()
	for _, n := range order {
		if err := byName[n].Register(&Registry{k: k, manifest: k.manifests[n]}); err != nil {
			return fmt.Errorf("kernel: register %s: %w", n, err)
		}
	}
	for _, s := range k.subs {
		info, ok := k.events[s.event]
		switch {
		case !ok:
			k.bootErr(fmt.Errorf("%s subscribes to undeclared event %s", s.module, s.event))
		case info.def.Version != s.version:
			k.bootErr(fmt.Errorf("%s subscribes to %s v%d, but v%d is emitted", s.module, s.event, s.version, info.def.Version))
		}
	}
	for _, j := range k.jobs {
		if j.every <= 0 {
			k.bootErr(fmt.Errorf("%s job %s has no interval", j.module, j.name))
		}
	}
	if err := k.buildMux(); err != nil {
		k.bootErr(err)
	}
	if len(k.errs) > 0 {
		return fmt.Errorf("kernel: boot failed: %w", errors.Join(k.errs...))
	}
	k.booted = true
	k.ready.Store(true)
	return nil
}

// Handler is the public HTTP handler.
func (k *Kernel) Handler() http.Handler { return k.mux }

// AdminHandler serves /metrics. Bind it to a private address.
func (k *Kernel) AdminHandler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		k.metrics.write(w)
	})
	return m
}

// Ready reports whether the kernel accepts traffic.
func (k *Kernel) Ready() bool { return k.ready.Load() && !k.draining.Load() }

// Run starts the outbox dispatcher and jobs and blocks until ctx is done.
func (k *Kernel) Run(ctx context.Context) {
	var wg sync.WaitGroup
	if k.cfg.Pool != nil {
		wg.Add(1)
		go func() { defer wg.Done(); k.dispatchLoop(ctx) }()
		for _, j := range k.jobs {
			wg.Add(1)
			go func(j job) { defer wg.Done(); k.jobLoop(ctx, j) }(j)
		}
	}
	<-ctx.Done()
	wg.Wait()
}

// Drain stops accepting requests and waits for in-flight ones.
func (k *Kernel) Drain(ctx context.Context) error {
	k.draining.Store(true)
	done := make(chan struct{})
	go func() { k.inflight.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (k *Kernel) jobLoop(ctx context.Context, j job) {
	t := time.NewTicker(j.every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := k.runInTx(ctx, j.module, nil, "job:"+j.name, func(c *execCtx) error { return j.fn(c) }); err != nil {
				k.log.Error("job failed", "module", j.module, "job", j.name, "error", err)
			}
		}
	}
}

// runInTx runs fn in a module-scoped transaction and commits on success.
func (k *Kernel) runInTx(ctx context.Context, module string, actor *core.Principal, requestID string, fn func(c *execCtx) error) error {
	c := k.newCtx(ctx, module, actor, requestID)
	if err := fn(c); err != nil {
		_, _ = c.tx.finish(false)
		return err
	}
	committed, err := c.tx.finish(true)
	if err != nil {
		return err
	}
	if committed && len(c.published) > 0 {
		k.metrics.published.Add(uint64(len(c.published)))
		k.nudge()
	}
	return nil
}

func (k *Kernel) nudge() {
	select {
	case k.wake <- struct{}{}:
	default:
	}
}

// ModuleInfo describes one registered module for introspection.
type ModuleInfo struct {
	Name      string      `json:"name"`
	Version   string      `json:"version"`
	Kind      Kind        `json:"kind"`
	DependsOn []string    `json:"depends_on"`
	Schema    string      `json:"schema,omitempty"`
	Routes    []RouteInfo `json:"routes"`
	Emits     []string    `json:"emits"`
	Consumes  []string    `json:"consumes"`
	Jobs      []string    `json:"jobs"`
}

// RouteInfo describes one route.
type RouteInfo struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	OperationID string `json:"operation_id"`
	Auth        string `json:"auth"`
	Scope       string `json:"scope,omitempty"`
}

// Modules lists registered modules in boot order.
func (k *Kernel) Modules() []ModuleInfo {
	var out []ModuleInfo
	for _, n := range k.order {
		m := k.manifests[n]
		info := ModuleInfo{Name: n, Version: m.Version, Kind: m.Kind, DependsOn: append([]string{}, m.DependsOn...), Schema: m.Schema,
			Routes: []RouteInfo{}, Emits: []string{}, Consumes: []string{}, Jobs: []string{}}
		for _, r := range k.routes {
			if r.module == n {
				info.Routes = append(info.Routes, RouteInfo{r.Method, r.Path, r.OperationID, r.Auth.String(), r.Scope})
			}
		}
		for name, e := range k.events {
			if e.module == n {
				info.Emits = append(info.Emits, fmt.Sprintf("%s.v%d", name, e.def.Version))
			}
		}
		sort.Strings(info.Emits)
		for _, s := range k.subs {
			if s.module == n {
				info.Consumes = append(info.Consumes, fmt.Sprintf("%s.v%d", s.event, s.version))
			}
		}
		for _, j := range k.jobs {
			if j.module == n {
				info.Jobs = append(info.Jobs, j.name)
			}
		}
		out = append(out, info)
	}
	return out
}
