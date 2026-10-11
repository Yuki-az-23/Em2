package kernel

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB is the query surface a module gets. pgx.Tx satisfies it.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ErrNoDatabase is returned when a handler uses the database but the kernel
// runs without one (unit tests of database-free routes).
var ErrNoDatabase = errors.New("kernel: no database configured")

// beginScoped starts a transaction that can only see the module's own schema:
// search_path is the module schema, and with role isolation the transaction
// also runs as the module's database role, which has USAGE on that schema only
// (ADR-003).
func (k *Kernel) beginScoped(ctx context.Context, pool *pgxpool.Pool, module string) (pgx.Tx, error) {
	if pool == nil {
		return nil, ErrNoDatabase
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if err := k.enterScope(ctx, tx, module); err != nil {
		_ = tx.Rollback(ctx)
		return nil, err
	}
	return tx, nil
}

// enterScope switches an open transaction to a module's role and search_path.
// SET LOCAL lasts until the next switch or the end of the transaction.
func (k *Kernel) enterScope(ctx context.Context, tx pgx.Tx, module string) error {
	schema := k.schemaOf(module)
	if k.cfg.RoleIsolation {
		role := "NONE"
		if schema != "" {
			role = pgx.Identifier{k.roleName(schema)}.Sanitize()
		}
		if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
			return fmt.Errorf("set role for %s: %w", module, err)
		}
	}
	path := "pg_catalog"
	if schema != "" {
		path = pgx.Identifier{schema}.Sanitize()
	}
	if _, err := tx.Exec(ctx, "SET LOCAL search_path TO "+path); err != nil {
		return fmt.Errorf("set search_path for %s: %w", module, err)
	}
	return nil
}

func (k *Kernel) roleName(schema string) string { return k.cfg.RolePrefix + schema }

func (k *Kernel) schemaOf(module string) string {
	if m, ok := k.manifests[module]; ok {
		return m.Schema
	}
	return ""
}

// lazyTx begins its transaction on first use.
type lazyTx struct {
	k      *Kernel
	ctx    context.Context
	module string
	tx     pgx.Tx
	err    error
}

func (l *lazyTx) get() (pgx.Tx, error) {
	if l.tx == nil && l.err == nil {
		l.tx, l.err = l.k.beginScoped(l.ctx, l.k.cfg.Pool, l.module)
	}
	return l.tx, l.err
}

func (l *lazyTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	tx, err := l.get()
	if err != nil {
		return pgconn.CommandTag{}, err
	}
	return tx.Exec(ctx, sql, args...)
}

func (l *lazyTx) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	tx, err := l.get()
	if err != nil {
		return nil, err
	}
	return tx.Query(ctx, sql, args...)
}

type errRow struct{ err error }

func (r errRow) Scan(...any) error { return r.err }

func (l *lazyTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	tx, err := l.get()
	if err != nil {
		return errRow{err}
	}
	return tx.QueryRow(ctx, sql, args...)
}

// finish commits or rolls back. It reports whether anything was committed.
func (l *lazyTx) finish(commit bool) (bool, error) {
	if l.tx == nil {
		return false, nil
	}
	// Use a fresh context so a cancelled request still releases its connection.
	ctx := context.WithoutCancel(l.ctx)
	if !commit {
		return false, l.tx.Rollback(ctx)
	}
	if err := l.tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// IsUniqueViolation reports whether err is a Postgres unique-constraint error.
func IsUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// IsNoRows reports whether err means a query returned no rows.
func IsNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
