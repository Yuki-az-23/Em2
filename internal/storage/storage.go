// Package storage stores binary objects (media) outside the database.
// M2 ships a local filesystem store; an S3-compatible store follows in M3.
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

// Store keeps objects by key.
type Store interface {
	Put(ctx context.Context, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}

// ErrNotFound is returned for a missing key.
var ErrNotFound = errors.New("storage: not found")

var keyRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// FS stores objects as files under Root, sharded by the key's first two characters.
type FS struct{ Root string }

// NewFS returns a store rooted at root. Directories are created on first write.
func NewFS(root string) (*FS, error) {
	if root == "" {
		return nil, errors.New("storage: empty root")
	}
	return &FS{Root: root}, nil
}

func (f *FS) path(key string) (string, error) {
	// Keys are generated UUIDs; anything else could escape the root.
	if !keyRe.MatchString(key) {
		return "", fmt.Errorf("storage: invalid key")
	}
	return filepath.Join(f.Root, key[:2], key), nil
}

// Put writes atomically: a temporary file in the same directory, then rename.
func (f *FS) Put(_ context.Context, key string, data []byte) error {
	p, err := f.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	tmp := p + ".tmp-" + hex.EncodeToString(b[:])
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func (f *FS) Get(_ context.Context, key string) ([]byte, error) {
	p, err := f.path(key)
	if err != nil {
		return nil, ErrNotFound
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return b, err
}

func (f *FS) Delete(_ context.Context, key string) error {
	p, err := f.path(key)
	if err != nil {
		return ErrNotFound
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
