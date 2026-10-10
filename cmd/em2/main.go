// Command em2 runs and operates EM2.
//
//	em2 serve                 run the API (needs EM2_DATABASE_URL, EM2_SIGNING_KEY, EM2_KEY_PEPPER)
//	em2 migrate               apply pending migrations
//	em2 openapi [--admin]     print the OpenAPI document
//	em2 keygen                print new EM2_SIGNING_KEY and EM2_KEY_PEPPER values
//	em2 grant-role HANDLE ROLE   give a human the admin or observer role
//	em2 validate              check configuration, database and migrations
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"em2.social/em2/internal/app"
	"em2.social/em2/internal/modules/identity"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cfg, err := app.FromEnv()
	if err != nil {
		fatal(err)
	}
	log := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch os.Args[1] {
	case "serve":
		err = serve(ctx, cfg, log)
	case "migrate":
		err = migrate(ctx, cfg, log)
	case "openapi":
		err = openapi(cfg, len(os.Args) > 2 && os.Args[2] == "--admin")
	case "keygen":
		err = keygen()
	case "grant-role":
		if len(os.Args) != 4 {
			usage()
			os.Exit(2)
		}
		err = grantRole(ctx, cfg, log, os.Args[2], os.Args[3])
	case "validate":
		err = validate(ctx, cfg, log)
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fatal(err)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: em2 serve | migrate | openapi [--admin] | keygen | grant-role HANDLE ROLE | validate")
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "em2:", err)
	os.Exit(1)
}

func needSecrets(cfg app.Config) error {
	if len(cfg.SigningKey) == 0 || len(cfg.KeyPepper) == 0 {
		return errors.New("EM2_SIGNING_KEY and EM2_KEY_PEPPER are required; generate them with `em2 keygen`")
	}
	return nil
}

func needDB(cfg app.Config) error {
	if cfg.DatabaseURL == "" {
		return errors.New("EM2_DATABASE_URL is required")
	}
	return nil
}

func serve(ctx context.Context, cfg app.Config, log *slog.Logger) error {
	if err := errors.Join(needSecrets(cfg), needDB(cfg)); err != nil {
		return err
	}
	k, pool, err := app.Open(ctx, cfg, log)
	if err != nil {
		return err
	}
	defer pool.Close()
	if pending, err := k.PendingMigrations(ctx); err != nil {
		return err
	} else if len(pending) > 0 {
		return fmt.Errorf("%d migrations pending; run `em2 migrate` first", len(pending))
	}

	srv := &http.Server{Addr: cfg.Addr, Handler: k.Handler(), ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 30 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second, MaxHeaderBytes: 32 << 10}
	admin := &http.Server{Addr: cfg.AdminAddr, Handler: k.AdminHandler(), ReadHeaderTimeout: 5 * time.Second}
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	done := make(chan struct{})
	go func() { k.Run(runCtx); close(done) }()
	errc := make(chan error, 2)
	go func() { errc <- srv.ListenAndServe() }()
	go func() { errc <- admin.ListenAndServe() }()
	log.Info("em2 serving", "addr", cfg.Addr, "admin_addr", cfg.AdminAddr, "mode", cfg.Mode)

	select {
	case <-ctx.Done():
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	log.Info("em2 draining")
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancelShutdown()
	_ = k.Drain(shutdown)
	_ = srv.Shutdown(shutdown)
	_ = admin.Shutdown(shutdown)
	cancel()
	<-done
	return nil
}

// Commands that only need the module graph can run without real secrets.
func withPlaceholderSecrets(cfg app.Config) app.Config {
	if len(cfg.SigningKey) == 0 {
		cfg.SigningKey = make([]byte, 32)
	}
	if len(cfg.KeyPepper) == 0 {
		cfg.KeyPepper = make([]byte, 32)
	}
	return cfg
}

func migrate(ctx context.Context, cfg app.Config, log *slog.Logger) error {
	if err := needDB(cfg); err != nil {
		return err
	}
	k, pool, err := app.Open(ctx, withPlaceholderSecrets(cfg), log)
	if err != nil {
		return err
	}
	defer pool.Close()
	ran, err := k.Migrate(ctx)
	for _, m := range ran {
		fmt.Println("applied", m)
	}
	if err != nil {
		return err
	}
	if len(ran) == 0 {
		fmt.Println("up to date")
	}
	return nil
}

func openapi(cfg app.Config, admin bool) error {
	cfg.DatabaseURL = ""
	k, _, err := app.Open(context.Background(), withPlaceholderSecrets(cfg), slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(k.OpenAPI(admin))
}

func keygen() error {
	seed := make([]byte, 32)
	pepper := make([]byte, 32)
	if _, err := rand.Read(seed); err != nil {
		return err
	}
	if _, err := rand.Read(pepper); err != nil {
		return err
	}
	fmt.Println("EM2_SIGNING_KEY=" + base64.StdEncoding.EncodeToString(seed))
	fmt.Println("EM2_KEY_PEPPER=" + base64.StdEncoding.EncodeToString(pepper))
	return nil
}

func grantRole(ctx context.Context, cfg app.Config, log *slog.Logger, handle, role string) error {
	if err := needDB(cfg); err != nil {
		return err
	}
	_, pool, err := app.Open(ctx, withPlaceholderSecrets(cfg), log)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := identity.GrantRole(ctx, pool, handle, role); err != nil {
		return err
	}
	fmt.Printf("%s now has role %s\n", handle, role)
	return nil
}

func validate(ctx context.Context, cfg app.Config, log *slog.Logger) error {
	var problems []error
	if err := needSecrets(cfg); err != nil {
		problems = append(problems, err)
	}
	if err := needDB(cfg); err != nil {
		problems = append(problems, err)
	} else {
		k, pool, err := app.Open(ctx, withPlaceholderSecrets(cfg), log)
		if err != nil {
			problems = append(problems, err)
		} else {
			defer pool.Close()
			if err := pool.Ping(ctx); err != nil {
				problems = append(problems, fmt.Errorf("database unreachable: %w", err))
			} else if pending, err := k.PendingMigrations(ctx); err != nil {
				problems = append(problems, err)
			} else if len(pending) > 0 {
				problems = append(problems, fmt.Errorf("%d migrations pending", len(pending)))
			}
		}
	}
	if len(problems) > 0 {
		return errors.Join(problems...)
	}
	fmt.Println("ok")
	return nil
}
