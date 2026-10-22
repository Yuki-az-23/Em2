package secret

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

var fast = Argon2Params{MemoryKiB: 1024, Time: 1, Threads: 1}

func TestPasswordRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse battery staple", fast)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=1024,t=1,p=1$") {
		t.Fatalf("unexpected hash format %s", h)
	}
	if ok, err := VerifyPassword("correct horse battery staple", h); !ok || err != nil {
		t.Fatalf("verify failed: %v %v", ok, err)
	}
	if ok, _ := VerifyPassword("correct horse battery stapl", h); ok {
		t.Fatal("wrong password accepted")
	}
	h2, _ := HashPassword("correct horse battery staple", fast)
	if h == h2 {
		t.Fatal("salt is not random")
	}
}

func TestVerifyRejectsMalformedAndAbusiveHashes(t *testing.T) {
	for _, h := range []string{"", "plain", "$argon2i$v=19$m=1024,t=1,p=1$c2FsdA$aGFzaA", "$argon2id$v=19$m=99999999,t=1,p=1$c2FsdA$aGFzaA", "$argon2id$v=19$m=1024,t=1,p=1$!!$aGFzaA"} {
		if ok, err := VerifyPassword("x", h); ok || err == nil {
			t.Errorf("hash %q: ok=%v err=%v", h, ok, err)
		}
	}
}

func signer(t *testing.T) *Signer {
	t.Helper()
	s, err := NewSigner(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTokenRoundTripAndExpiry(t *testing.T) {
	s := signer(t)
	now := time.Unix(1_800_000_000, 0)
	tok, err := s.Sign(Claims{Issuer: Issuer, Subject: "p1", SessionID: "s1", Kind: "human", IssuedAt: now.Unix(), ExpiresAt: now.Add(15 * time.Minute).Unix(), ID: "j1"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.Verify(tok, now.Add(time.Minute))
	if err != nil || c.Subject != "p1" || c.SessionID != "s1" {
		t.Fatalf("verify: %+v %v", c, err)
	}
	if _, err := s.Verify(tok, now.Add(16*time.Minute)); err == nil {
		t.Fatal("expired token accepted")
	}
}

func TestTokenRejectsForgeries(t *testing.T) {
	s := signer(t)
	now := time.Unix(1_800_000_000, 0)
	good, _ := s.Sign(Claims{Issuer: Issuer, Subject: "p1", SessionID: "s1", IssuedAt: now.Unix(), ExpiresAt: now.Add(time.Hour).Unix()})
	parts := strings.Split(good, ".")
	enc := func(v any) string { b, _ := json.Marshal(v); return base64.RawURLEncoding.EncodeToString(b) }

	other, _ := NewSigner(append(make([]byte, 31), 1))
	foreign, _ := other.Sign(Claims{Issuer: Issuer, Subject: "p1", SessionID: "s1", IssuedAt: now.Unix(), ExpiresAt: now.Add(time.Hour).Unix()})

	// Re-sign a forged header with the real key to prove the header checks
	// themselves (not only the signature) reject it.
	resign := func(h map[string]string) string {
		signing := enc(h) + "." + parts[1]
		return signing + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(s.key, []byte(signing)))
	}
	cases := map[string]string{
		"alg none":         enc(map[string]string{"alg": "none", "typ": "JWT", "kid": s.kid}) + "." + parts[1] + ".",
		"alg HS256 signed": resign(map[string]string{"alg": "HS256", "typ": "JWT", "kid": s.kid}),
		"wrong kid signed": resign(map[string]string{"alg": "EdDSA", "typ": "JWT", "kid": "deadbeef"}),
		"tampered payload": parts[0] + "." + enc(map[string]any{"iss": Issuer, "sub": "admin", "sid": "s1", "exp": now.Add(time.Hour).Unix()}) + "." + parts[2],
		"other key":        foreign,
		"two parts":        parts[0] + "." + parts[1],
		"garbage":          "a.b.c",
	}
	for name, tok := range cases {
		if _, err := s.Verify(tok, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	wrongIss, _ := s.Sign(Claims{Issuer: "someone-else", Subject: "p1", SessionID: "s1", IssuedAt: now.Unix(), ExpiresAt: now.Add(time.Hour).Unix()})
	if _, err := s.Verify(wrongIss, now); err == nil {
		t.Error("wrong issuer accepted")
	}
}

func TestAgentKeysAndPepper(t *testing.T) {
	p, err := NewPepper(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewPepper(make([]byte, 16)); err == nil {
		t.Fatal("short pepper accepted")
	}
	key, lookup, err := NewAgentKey()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(key, AgentKeyPrefix) || len(lookup) != len(AgentKeyPrefix)+8 || !strings.HasPrefix(key, lookup) {
		t.Fatalf("key %q lookup %q", key, lookup)
	}
	if got, ok := AgentKeyLookup(key); !ok || got != lookup {
		t.Fatalf("lookup %q %v", got, ok)
	}
	for _, bad := range []string{"", AgentKeyPrefix, key + "x", "em2_xx_" + key[7:], key[:len(key)-1] + "!"} {
		if _, ok := AgentKeyLookup(bad); ok {
			t.Errorf("malformed key accepted: %q", bad)
		}
	}
	stored := p.Hash(key)
	if !p.Equal(key, stored) || p.Equal(key[:len(key)-1]+"A", stored) && key[len(key)-1] != 'A' {
		t.Fatal("pepper hash comparison wrong")
	}
	other, _ := NewPepper(append(make([]byte, 31), 9))
	if other.Equal(key, stored) {
		t.Fatal("hash does not depend on the pepper")
	}
	r, _ := NewRefreshToken()
	if !RefreshWellFormed(r) || RefreshWellFormed(key) {
		t.Fatal("refresh token format check wrong")
	}
}
