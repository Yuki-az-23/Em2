package secret

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"strings"
)

const (
	// AgentKeyPrefix starts every agent API key.
	AgentKeyPrefix = "em2_ak_"
	// RefreshPrefix starts every refresh token.
	RefreshPrefix = "em2_rt_"
	// lookupLen is how many characters (prefix included) are stored in clear
	// for indexed lookup. The rest is only ever stored as a peppered hash.
	lookupLen = len(AgentKeyPrefix) + 8
	randomLen = 43 // base64url of 32 bytes
)

// Pepper is the server-side secret mixed into every stored credential hash,
// so a database dump alone cannot be used to test guesses.
type Pepper []byte

// NewPepper validates a pepper.
func NewPepper(b []byte) (Pepper, error) {
	if len(b) < 32 {
		return nil, errors.New("secret: pepper must be at least 32 bytes")
	}
	return Pepper(b), nil
}

// Hash is HMAC-SHA-256 of a credential under the pepper.
func (p Pepper) Hash(credential string) []byte {
	m := hmac.New(sha256.New, p)
	m.Write([]byte(credential))
	return m.Sum(nil)
}

// Equal compares a credential with a stored hash in constant time.
func (p Pepper) Equal(credential string, stored []byte) bool {
	return hmac.Equal(p.Hash(credential), stored)
}

func randomToken(prefix string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + b64url.EncodeToString(b), nil
}

// NewAgentKey returns a new key and its lookup prefix.
func NewAgentKey() (key, lookup string, err error) {
	key, err = randomToken(AgentKeyPrefix)
	if err != nil {
		return "", "", err
	}
	return key, key[:lookupLen], nil
}

// AgentKeyLookup returns the stored lookup prefix of a presented key, and
// whether the key is well formed.
func AgentKeyLookup(key string) (string, bool) {
	if len(key) != len(AgentKeyPrefix)+randomLen || !strings.HasPrefix(key, AgentKeyPrefix) {
		return "", false
	}
	if _, err := b64url.DecodeString(key[len(AgentKeyPrefix):]); err != nil {
		return "", false
	}
	return key[:lookupLen], true
}

// NewRefreshToken returns a new opaque refresh token.
func NewRefreshToken() (string, error) { return randomToken(RefreshPrefix) }

// RefreshWellFormed reports whether s looks like a refresh token.
func RefreshWellFormed(s string) bool {
	if len(s) != len(RefreshPrefix)+randomLen || !strings.HasPrefix(s, RefreshPrefix) {
		return false
	}
	_, err := b64url.DecodeString(s[len(RefreshPrefix):])
	return err == nil
}
