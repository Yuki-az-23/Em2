package contract

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"em2.social/em2/internal/app"
	"em2.social/em2/test/testenv"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

// AGENTS.md: core/ imports nothing outside the standard library.
func TestCoreImportsOnlyStdlib(t *testing.T) {
	out, err := exec.Command("go", "list", "-f", `{{join .Imports "\n"}}`, "em2.social/em2/core").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	for _, imp := range strings.Fields(string(out)) {
		if strings.Contains(strings.SplitN(imp, "/", 2)[0], ".") {
			t.Errorf("core imports non-stdlib package %s", imp)
		}
	}
}

// ADR-002: exactly two direct third-party requirements.
func TestDirectDependencies(t *testing.T) {
	b, err := os.ReadFile(filepath.Join(repoRoot(t), "go.mod"))
	if err != nil {
		t.Fatal(err)
	}
	var direct []string
	inBlock := false
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "require ("):
			inBlock = true
			continue
		case inBlock && line == ")":
			inBlock = false
			continue
		case strings.HasPrefix(line, "require "):
			line = strings.TrimPrefix(line, "require ")
		case !inBlock:
			continue
		}
		if line != "" && !strings.Contains(line, "// indirect") {
			direct = append(direct, strings.Fields(line)[0])
		}
	}
	want := map[string]bool{"github.com/jackc/pgx/v5": true, "golang.org/x/crypto": true}
	if len(direct) != len(want) {
		t.Fatalf("direct dependencies = %v; adding one needs an ADR", direct)
	}
	for _, d := range direct {
		if !want[d] {
			t.Errorf("unexpected direct dependency %s (needs an ADR)", d)
		}
	}
}

var schemaRef = regexp.MustCompile(`\b(kernel|identity|ingest|verdict|ledger|journal|observatory|admin)\.[a-z_]+\b`)

// ADR-003: a module's code names only its own schema (role isolation enforces
// the same at run time). kernel.* tables are written only through the kernel.
func TestModulesReferenceOnlyTheirOwnSchema(t *testing.T) {
	root := filepath.Join(repoRoot(t), "internal", "modules")
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, mod := range entries {
		if !mod.IsDir() {
			continue
		}
		own := mod.Name()
		_ = filepath.WalkDir(filepath.Join(root, own), func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !(strings.HasSuffix(path, ".go") || strings.HasSuffix(path, ".sql")) || strings.HasSuffix(path, "_test.go") {
				return err
			}
			b, _ := os.ReadFile(path)
			for _, line := range strings.Split(string(b), "\n") {
				if !strings.ContainsAny(line, "`'\"") && !strings.HasSuffix(path, ".sql") {
					continue // only look inside SQL text
				}
				for _, idx := range schemaRef.FindAllStringSubmatchIndex(line, -1) {
					match, schema := line[idx[0]:idx[1]], line[idx[2]:idx[3]]
					// Event names ("identity.principal.deleted") have a third
					// segment; table references ("identity.principals") do not.
					if idx[1] < len(line) && line[idx[1]] == '.' {
						continue
					}
					if schema != own && !isGoSelector(line, match) {
						t.Errorf("%s references schema %q: %s", path, schema, strings.TrimSpace(line))
					}
				}
			}
			return nil
		})
	}
}

// ADR-001: modules talk only through the kernel and internal/services; a
// module never imports another module's package.
func TestModulesDoNotImportEachOther(t *testing.T) {
	out, err := exec.Command("go", "list", "-f", `{{.ImportPath}} {{join .Imports " "}}`, "em2.social/em2/internal/modules/...").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	const prefix = "em2.social/em2/internal/modules/"
	owner := func(pkg string) string {
		rest := strings.TrimPrefix(pkg, prefix)
		name, _, _ := strings.Cut(rest, "/")
		return name
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		self := owner(fields[0])
		for _, imp := range fields[1:] {
			if strings.HasPrefix(imp, prefix) && owner(imp) != self {
				t.Errorf("module %s imports %s; use internal/services and kernel.Resolve", self, imp)
			}
		}
	}
}

// isGoSelector skips Go expressions such as kernel.NewID() outside string literals.
func isGoSelector(line, match string) bool {
	idx := strings.Index(line, match)
	before := line[:idx]
	return strings.Count(before, "`")%2 == 0 && strings.Count(before, `"`)%2 == 0 && strings.Count(before, "'")%2 == 0
}

// ADR-006: the UI contains no third-party code and no build tooling.
func TestWebHasNoThirdPartyCode(t *testing.T) {
	root := filepath.Join(repoRoot(t), "web")
	bare := regexp.MustCompile(`(?m)^\s*import\s[^;]*?from\s+['"]([^'"./][^'"]*)['"]`)
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if d.IsDir() && name == "node_modules" {
			t.Errorf("%s: node_modules is not allowed in web/", path)
			return filepath.SkipDir
		}
		if name == "package.json" || name == "package-lock.json" {
			t.Errorf("%s: npm manifests are not allowed in web/", path)
		}
		if strings.HasSuffix(name, ".js") || strings.HasSuffix(name, ".html") || strings.HasSuffix(name, ".css") {
			b, _ := os.ReadFile(path)
			if m := bare.FindSubmatch(b); m != nil {
				t.Errorf("%s imports %q; only relative imports of code in this repo are allowed", path, m[1])
			}
			if bytes.Contains(b, []byte("://cdn")) || bytes.Contains(b, []byte("unpkg.com")) || bytes.Contains(b, []byte("jsdelivr")) {
				t.Errorf("%s loads code from a CDN", path)
			}
		}
		return nil
	})
}

// ADR-008.
func TestLicenseIsAGPL(t *testing.T) {
	b, err := os.ReadFile(filepath.Join(repoRoot(t), "LICENSE"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte("GNU AFFERO GENERAL PUBLIC LICENSE")) || !bytes.Contains(b, []byte("Version 3, 19 November 2007")) {
		t.Fatal("LICENSE is not the AGPL-3.0 text")
	}
}

// ADR-011: the public API document carries no build version, no admin
// routes, and no field that would hand a sender receiver-side verdict data.
func TestPublicOpenAPIHygiene(t *testing.T) {
	cfg := testenv.TestConfig("")
	k, _, err := app.Open(context.Background(), cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	doc := k.OpenAPI(false)
	b, _ := json.Marshal(doc)
	s := string(b)
	if strings.Contains(s, "/v1/admin") {
		t.Fatal("public OpenAPI lists admin routes")
	}
	if v := doc["info"].(map[string]any)["version"]; v != "v1" {
		t.Fatalf("info.version = %v", v)
	}
	for _, field := range []string{`"threshold"`, `"score"`, `"rule_version"`, `"bridge_of`, `"password_hash"`, `"key_hash"`, `"refresh_hash"`} {
		if strings.Contains(s, field) {
			t.Errorf("public OpenAPI exposes %s", field)
		}
	}
}
