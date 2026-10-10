package kernel

import (
	"context"
	"fmt"
	"io/fs"
	"reflect"
	"regexp"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/pkg/schema"
)

// Kind classifies what a registrant is (seed: modules, adapters, plugins).
type Kind string

const (
	KindModule  Kind = "module"
	KindAdapter Kind = "adapter"
	KindPlugin  Kind = "plugin"
)

// Manifest is a registrant's static description.
type Manifest struct {
	Name       string   // unique, lowercase
	Version    string   // semver of the module's contract
	Kind       Kind     // module, adapter or plugin
	DependsOn  []string // modules whose services this one may resolve
	Schema     string   // the only Postgres schema this module may touch; "" for none
	Migrations fs.FS    // NNNN_name.sql files, forward-only; nil for none
}

// Module is anything that registers with the kernel.
type Module interface {
	Manifest() Manifest
	Register(r *Registry) error
}

var nameRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,30}$`)

// EventDef declares an event a module emits.
type EventDef struct {
	Name    string // "<module>.<entity>.<verb>", e.g. "identity.principal.registered"
	Version int
	Schema  *schema.Schema
	Summary string
}

// Envelope is a delivered event.
type Envelope struct {
	ID         string
	Name       string
	Version    int
	OccurredAt time.Time
	Actor      *core.Principal
	Payload    []byte
	TraceID    string
}

// EventHandler consumes an event inside a transaction scoped to the
// subscriber's schema. Returning an error rolls the transaction back and the
// event is retried later (at-least-once; handlers must be idempotent).
type EventHandler func(ctx Ctx, e Envelope) error

// JobFunc runs periodically inside a transaction scoped to the module's schema.
type JobFunc func(ctx Ctx) error

// AuthenticateFunc turns a bearer credential into a principal. It runs inside
// a read-write transaction scoped to the registering module's schema. Return
// ErrUnauthenticated (or any error) to reject; the caller always sees the same
// generic 401.
type AuthenticateFunc func(ctx Ctx, credential string) (*core.Principal, error)

type subscription struct {
	module  string
	event   string
	version int
	handler EventHandler
}

type job struct {
	module string
	name   string
	every  time.Duration
	fn     JobFunc
}

// Registry is the handle a module receives during Register. It records who is
// registering so that scoping and dependency rules can be enforced.
type Registry struct {
	k        *Kernel
	manifest Manifest
}

// Name of the registering module.
func (r *Registry) Name() string { return r.manifest.Name }

// Route registers an HTTP route. Duplicate method+path pairs fail at boot.
func (r *Registry) Route(rt Route) {
	rt.module = r.manifest.Name
	r.k.routes = append(r.k.routes, &rt)
}

// Emits declares an event this module publishes.
func (r *Registry) Emits(ev EventDef) {
	if _, dup := r.k.events[ev.Name]; dup {
		r.k.bootErr(fmt.Errorf("event %s declared twice", ev.Name))
		return
	}
	r.k.events[ev.Name] = eventInfo{def: ev, module: r.manifest.Name}
}

// Subscribe consumes an event. The event must be declared by some module with
// the same version; this is checked at boot.
func (r *Registry) Subscribe(event string, version int, h EventHandler) {
	r.k.subs = append(r.k.subs, subscription{module: r.manifest.Name, event: event, version: version, handler: h})
}

// Provide exposes a service to modules that list this one in DependsOn. The
// service is found by the interface types it implements.
func (r *Registry) Provide(svc any) {
	r.k.services[r.manifest.Name] = append(r.k.services[r.manifest.Name], svc)
}

// Job registers a periodic task.
func (r *Registry) Job(name string, every time.Duration, fn JobFunc) {
	r.k.jobs = append(r.k.jobs, job{module: r.manifest.Name, name: name, every: every, fn: fn})
}

// Authenticator registers the function that resolves bearer credentials.
// Exactly one module may register it.
func (r *Registry) Authenticator(fn AuthenticateFunc) {
	if r.k.auth != nil {
		r.k.bootErr(fmt.Errorf("authenticator registered twice (by %s and %s)", r.k.authModule, r.manifest.Name))
		return
	}
	r.k.auth, r.k.authModule = fn, r.manifest.Name
}

// Resolve finds a service of type T provided by one of the caller's
// dependencies. Resolving from a module not listed in DependsOn fails.
func Resolve[T any](r *Registry) (T, error) {
	var zero T
	want := reflect.TypeOf((*T)(nil)).Elem()
	for _, dep := range r.manifest.DependsOn {
		for _, svc := range r.k.services[dep] {
			if v, ok := svc.(T); ok {
				return v, nil
			}
		}
	}
	for mod, svcs := range r.k.services {
		for _, svc := range svcs {
			if _, ok := svc.(T); ok {
				return zero, fmt.Errorf("%s: service %v is provided by %s, which is not in DependsOn", r.manifest.Name, want, mod)
			}
		}
	}
	return zero, fmt.Errorf("%s: no provider for service %v", r.manifest.Name, want)
}

// Ctx is what handlers, event consumers and jobs receive.
type Ctx interface {
	context.Context
	// DB is a transaction scoped to the module's schema. It begins on first
	// use and commits when the handler returns without error.
	DB() DB
	// Publish records an event in the outbox within the same transaction.
	Publish(event string, payload any) error
	Log() Logger
	Principal() *core.Principal
	Now() time.Time
	Mode() RunMode
	RequestID() string
}
