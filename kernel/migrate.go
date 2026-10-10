package kernel

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"regexp"
	"sort"

	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var kernelMigrations embed.FS

var migrationFileRe = regexp.MustCompile(`^[0-9]{4}_[a-z0-9_]+\.sql$`)

// migrationLockKey is the advisory lock that serialises concurrent migrators.
const migrationLockKey = 0x656d32 // "em2"

type migrationFile struct {
	module, schema, name, sql, checksum string
}

func migrationFiles(module, schema string, fsys fs.FS) ([]migrationFile, error) {
	if fsys == nil {
		return nil, nil
	}
	var out []migrationFile
	err := fs.WalkDir(fsys, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if !migrationFileRe.MatchString(d.Name()) {
			return fmt.Errorf("%s: migration file %q must be named NNNN_name.sql", module, path)
		}
		b, err := fs.ReadFile(fsys, path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(b)
		out = append(out, migrationFile{module, schema, d.Name(), string(b), hex.EncodeToString(sum[:])})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	for i := 1; i < len(out); i++ {
		if out[i].name[:4] == out[i-1].name[:4] {
			return nil, fmt.Errorf("%s: two migrations numbered %s", module, out[i].name[:4])
		}
	}
	return out, err
}

// allMigrations lists every migration in apply order: the kernel's, then each
// module's in dependency order.
func (k *Kernel) allMigrations() ([]migrationFile, error) {
	kfs, _ := fs.Sub(kernelMigrations, "migrations")
	files, err := migrationFiles("kernel", "kernel", kfs)
	if err != nil {
		return nil, err
	}
	order, err := dependencyOrder(k.manifests)
	if err != nil {
		return nil, err
	}
	for _, n := range order {
		m := k.manifests[n]
		if m.Migrations != nil && m.Schema == "" {
			return nil, fmt.Errorf("%s has migrations but no schema", n)
		}
		mf, err := migrationFiles(n, m.Schema, m.Migrations)
		if err != nil {
			return nil, err
		}
		files = append(files, mf...)
	}
	return files, nil
}

// Migrate applies pending migrations, each in its own transaction with
// search_path set to the module's schema, and records them in
// kernel.migrations. An applied migration whose file has changed is an error:
// migrations are forward-only and immutable. With role isolation it then
// (re)grants each module role access to its own schema only.
func (k *Kernel) Migrate(ctx context.Context) ([]string, error) {
	if k.cfg.Pool == nil {
		return nil, ErrNoDatabase
	}
	files, err := k.allMigrations()
	if err != nil {
		return nil, err
	}
	conn, err := k.cfg.Pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationLockKey); err != nil {
		return nil, err
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, migrationLockKey)
	}()

	if _, err := conn.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS kernel;
		CREATE TABLE IF NOT EXISTS kernel.migrations (
			module     text NOT NULL,
			name       text NOT NULL,
			checksum   text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (module, name))`); err != nil {
		return nil, fmt.Errorf("bootstrap kernel.migrations: %w", err)
	}
	applied, err := appliedMigrations(ctx, conn.Conn())
	if err != nil {
		return nil, err
	}
	var ran []string
	for _, f := range files {
		key := f.module + "/" + f.name
		if sum, ok := applied[key]; ok {
			if sum != f.checksum {
				return ran, fmt.Errorf("migration %s was changed after it was applied", key)
			}
			continue
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return ran, err
		}
		schema := pgx.Identifier{f.schema}.Sanitize()
		if _, err := tx.Exec(ctx, "CREATE SCHEMA IF NOT EXISTS "+schema+"; SET LOCAL search_path TO "+schema); err != nil {
			_ = tx.Rollback(ctx)
			return ran, fmt.Errorf("migration %s: %w", key, err)
		}
		if _, err := tx.Exec(ctx, f.sql); err != nil {
			_ = tx.Rollback(ctx)
			return ran, fmt.Errorf("migration %s: %w", key, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO kernel.migrations (module, name, checksum) VALUES ($1, $2, $3)`, f.module, f.name, f.checksum); err != nil {
			_ = tx.Rollback(ctx)
			return ran, err
		}
		if err := tx.Commit(ctx); err != nil {
			return ran, err
		}
		ran = append(ran, key)
	}
	if k.cfg.RoleIsolation {
		if err := k.grantRoles(ctx, conn.Conn()); err != nil {
			return ran, err
		}
	}
	return ran, nil
}

func appliedMigrations(ctx context.Context, conn *pgx.Conn) (map[string]string, error) {
	rows, err := conn.Query(ctx, `SELECT module, name, checksum FROM kernel.migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var m, n, c string
		if err := rows.Scan(&m, &n, &c); err != nil {
			return nil, err
		}
		out[m+"/"+n] = c
	}
	return out, rows.Err()
}

// PendingMigrations lists migrations not yet applied (empty when current).
func (k *Kernel) PendingMigrations(ctx context.Context) ([]string, error) {
	if k.cfg.Pool == nil {
		return nil, ErrNoDatabase
	}
	files, err := k.allMigrations()
	if err != nil {
		return nil, err
	}
	conn, err := k.cfg.Pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	var exists bool
	if err := conn.QueryRow(ctx, `SELECT to_regclass('kernel.migrations') IS NOT NULL`).Scan(&exists); err != nil {
		return nil, err
	}
	applied := map[string]string{}
	if exists {
		if applied, err = appliedMigrations(ctx, conn.Conn()); err != nil {
			return nil, err
		}
	}
	var pending []string
	for _, f := range files {
		if _, ok := applied[f.module+"/"+f.name]; !ok {
			pending = append(pending, f.module+"/"+f.name)
		}
	}
	return pending, nil
}

// grantRoles creates one NOLOGIN role per module schema and gives it access to
// that schema only, plus the kernel tables every module writes through the
// kernel (outbox, deliveries). The connecting user is made a member so it can
// SET ROLE per transaction.
func (k *Kernel) grantRoles(ctx context.Context, conn *pgx.Conn) error {
	for _, n := range k.order {
		m := k.manifests[n]
		if m.Schema == "" {
			continue
		}
		role := pgx.Identifier{k.roleName(m.Schema)}.Sanitize()
		schema := pgx.Identifier{m.Schema}.Sanitize()
		lit := k.roleName(m.Schema)
		stmts := []string{
			fmt.Sprintf(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '%s') THEN CREATE ROLE %s NOLOGIN; END IF; END $$`, lit, role),
			fmt.Sprintf(`GRANT %s TO CURRENT_USER`, role),
			fmt.Sprintf(`CREATE SCHEMA IF NOT EXISTS %s`, schema),
			fmt.Sprintf(`GRANT USAGE ON SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`GRANT USAGE ON SCHEMA kernel TO %s`, role),
			fmt.Sprintf(`GRANT INSERT ON kernel.outbox TO %s`, role),
			fmt.Sprintf(`GRANT SELECT, INSERT ON kernel.deliveries TO %s`, role),
		}
		for _, s := range stmts {
			if _, err := conn.Exec(ctx, s); err != nil {
				return fmt.Errorf("grant role for %s: %w", n, err)
			}
		}
	}
	return nil
}
