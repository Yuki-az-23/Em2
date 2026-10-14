package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestFSRoundTripAndKeyValidation(t *testing.T) {
	ctx := context.Background()
	s, err := NewFS(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	key := "6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f"
	if err := s.Put(ctx, key, []byte("data")); err != nil {
		t.Fatal(err)
	}
	if b, err := s.Get(ctx, key); err != nil || string(b) != "data" {
		t.Fatalf("get = %q %v", b, err)
	}
	info, _ := os.Stat(filepath.Join(s.Root, key[:2], key))
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("file mode %v", info.Mode().Perm())
	}
	for _, bad := range []string{"../../etc/passwd", "", "6F1C9A3E-2B7D-4C1A-9E8F-0A1B2C3D4E5F", key + "/x"} {
		if err := s.Put(ctx, bad, []byte("x")); err == nil {
			t.Errorf("Put accepted key %q", bad)
		}
		if _, err := s.Get(ctx, bad); err != ErrNotFound {
			t.Errorf("Get(%q) = %v", bad, err)
		}
	}
	if err := s.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, key); err != ErrNotFound {
		t.Fatalf("after delete: %v", err)
	}
}
