// Package netguard makes outbound HTTP requests on behalf of principals
// without letting them reach EM2's own network: every address a connection
// dials is checked after DNS resolution, at dial time, so a hostname that
// resolves to a private address (or is rebound to one) is refused. Redirects
// are followed a few times and each hop is checked the same way.
//
// It is used by the egress adapter (agents fetching content) and by the
// ingress adapter (EM2 calling a principal's registered upstream).
package netguard

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"time"
)

// ErrBlocked is returned when a destination is not allowed.
var ErrBlocked = errors.New("netguard: destination not allowed")

// Resolver looks up host addresses. net.DefaultResolver satisfies it.
type Resolver interface {
	LookupNetIP(ctx context.Context, network, host string) ([]netip.Addr, error)
}

// Guard is an outbound policy.
type Guard struct {
	// AllowPrivate permits private, loopback and link-local destinations.
	// For tests and single-host development only.
	AllowPrivate bool
	Resolver     Resolver // nil means net.DefaultResolver
	MaxRedirects int      // default 3
	// Ports allowed; nil means 80, 443 and 8080-8999.
	Ports func(port int) bool
	// Block decides which addresses are refused; nil means Blocked. Tests
	// use it to treat one loopback address as public and another as private.
	Block func(netip.Addr) bool
}

var blockedPrefixes = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{
		"0.0.0.0/8",       // this network
		"10.0.0.0/8",      // RFC 1918
		"100.64.0.0/10",   // carrier-grade NAT (also some cloud metadata)
		"127.0.0.0/8",     // loopback
		"169.254.0.0/16",  // link-local, cloud metadata
		"172.16.0.0/12",   // RFC 1918
		"192.0.0.0/24",    // IETF protocol assignments
		"192.0.2.0/24",    // documentation
		"192.88.99.0/24",  // 6to4 relay
		"192.168.0.0/16",  // RFC 1918
		"198.18.0.0/15",   // benchmarking
		"198.51.100.0/24", // documentation
		"203.0.113.0/24",  // documentation
		"224.0.0.0/4",     // multicast
		"240.0.0.0/4",     // reserved, broadcast
		"::/128",          // unspecified
		"::1/128",         // loopback
		"64:ff9b::/96",    // NAT64: embeds an IPv4 address
		"64:ff9b:1::/48",  // local NAT64
		"100::/64",        // discard
		"2001::/32",       // Teredo
		"2001:db8::/32",   // documentation
		"2002::/16",       // 6to4: embeds an IPv4 address
		"fc00::/7",        // unique local (includes fd00:ec2::254 metadata)
		"fe80::/10",       // link-local
		"ff00::/8",        // multicast
	} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

// Blocked reports whether an address belongs to a range EM2 never dials for
// a principal.
func Blocked(a netip.Addr) bool {
	a = a.Unmap()
	if !a.IsValid() {
		return true
	}
	for _, p := range blockedPrefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func defaultPorts(p int) bool { return p == 80 || p == 443 || (p >= 8080 && p <= 8999) }

// DialContext resolves and checks the destination, then dials the first
// allowed address directly, so the address checked is the address used.
func (g *Guard) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, ErrBlocked
	}
	ports := g.Ports
	if ports == nil {
		ports = defaultPorts
	}
	if !g.AllowPrivate && !ports(port) {
		return nil, fmt.Errorf("%w: port %d", ErrBlocked, port)
	}
	var addrs []netip.Addr
	if ip, err := netip.ParseAddr(host); err == nil {
		addrs = []netip.Addr{ip}
	} else {
		r := g.Resolver
		if r == nil {
			r = net.DefaultResolver
		}
		if addrs, err = r.LookupNetIP(ctx, "ip", host); err != nil {
			return nil, err
		}
	}
	if len(addrs) == 0 {
		return nil, ErrBlocked
	}
	// Every resolved address must be allowed: a mixed answer is a rebinding
	// attempt or a misconfiguration, and either way not dialed.
	if !g.AllowPrivate {
		block := g.Block
		if block == nil {
			block = Blocked
		}
		for _, a := range addrs {
			if block(a) {
				return nil, fmt.Errorf("%w: %s", ErrBlocked, a)
			}
		}
	}
	d := net.Dialer{Timeout: 10 * time.Second}
	var lastErr error
	for _, a := range addrs {
		c, err := d.DialContext(ctx, network, netip.AddrPortFrom(a.Unmap(), uint16(port)).String())
		if err == nil {
			return c, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// Client returns an HTTP client that dials only through the guard, ignores
// proxy settings from the environment, and checks every redirect.
func (g *Guard) Client(timeout time.Duration) *http.Client {
	max := g.MaxRedirects
	if max <= 0 {
		max = 3
	}
	tr := &http.Transport{
		Proxy:                 nil,
		DialContext:           g.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
	}
	return &http.Client{
		Transport: tr,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > max {
				return fmt.Errorf("%w: too many redirects", ErrBlocked)
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("%w: scheme %s", ErrBlocked, req.URL.Scheme)
			}
			return nil
		},
	}
}
