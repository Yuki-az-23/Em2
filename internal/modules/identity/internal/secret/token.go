package secret

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Issuer is the iss claim on every EM2 access token.
const Issuer = "em2"

var b64url = base64.RawURLEncoding

// Claims of an EM2 human access token.
type Claims struct {
	Issuer    string `json:"iss"`
	Subject   string `json:"sub"` // principal id
	SessionID string `json:"sid"`
	Kind      string `json:"kind"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	ID        string `json:"jti"`
}

type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
	Kid string `json:"kid"`
}

// Signer issues and verifies EdDSA (Ed25519) JWTs.
type Signer struct {
	key ed25519.PrivateKey
	pub ed25519.PublicKey
	kid string
}

// NewSigner builds a signer from a 32-byte Ed25519 seed.
func NewSigner(seed []byte) (*Signer, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, errors.New("secret: signing key must be a 32-byte Ed25519 seed")
	}
	key := ed25519.NewKeyFromSeed(seed)
	pub := key.Public().(ed25519.PublicKey)
	sum := sha256.Sum256(pub)
	return &Signer{key: key, pub: pub, kid: hex.EncodeToString(sum[:8])}, nil
}

// KeyID identifies the verification key.
func (s *Signer) KeyID() string { return s.kid }

// Sign returns a compact JWT.
func (s *Signer) Sign(c Claims) (string, error) {
	h, err := json.Marshal(header{Alg: "EdDSA", Typ: "JWT", Kid: s.kid})
	if err != nil {
		return "", err
	}
	p, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	signing := b64url.EncodeToString(h) + "." + b64url.EncodeToString(p)
	return signing + "." + b64url.EncodeToString(ed25519.Sign(s.key, []byte(signing))), nil
}

// ErrInvalidToken covers every verification failure. Callers never learn which check failed.
var ErrInvalidToken = errors.New("secret: invalid token")

// Verify checks algorithm, key id, signature, issuer and time. It accepts
// only EdDSA with this signer's key; "none" and every other algorithm fail.
func (s *Signer) Verify(token string, now time.Time) (Claims, error) {
	var c Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 || len(token) > 4096 {
		return c, ErrInvalidToken
	}
	hb, err := b64url.DecodeString(parts[0])
	if err != nil {
		return c, ErrInvalidToken
	}
	var h header
	if json.Unmarshal(hb, &h) != nil || h.Alg != "EdDSA" || h.Typ != "JWT" || h.Kid != s.kid {
		return c, ErrInvalidToken
	}
	sig, err := b64url.DecodeString(parts[2])
	if err != nil || !ed25519.Verify(s.pub, []byte(parts[0]+"."+parts[1]), sig) {
		return c, ErrInvalidToken
	}
	pb, err := b64url.DecodeString(parts[1])
	if err != nil || json.Unmarshal(pb, &c) != nil {
		return Claims{}, ErrInvalidToken
	}
	t := now.Unix()
	if c.Issuer != Issuer || c.Subject == "" || c.SessionID == "" || c.ExpiresAt <= t || c.IssuedAt > t+60 {
		return Claims{}, ErrInvalidToken
	}
	return c, nil
}
