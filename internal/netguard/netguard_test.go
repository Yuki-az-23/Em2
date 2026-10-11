package netguard

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestBlockedRanges(t *testing.T) {
	blocked := []string{"127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.50", "169.254.169.254", "100.100.100.200",
		"0.0.0.0", "255.255.255.255", "224.0.0.1", "::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1", "::ffff:127.0.0.1",
		"::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:a00:1::", "ff02::1"}
	allowed := []string{"1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"}
	for _, s := range blocked {
		if !Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range allowed {
		if Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

type fakeResolver map[string][]string

func (f fakeResolver) LookupNetIP(_ context.Context, _, host string) ([]netip.Addr, error) {
	var out []netip.Addr
	for _, s := range f[host] {
		out = append(out, netip.MustParseAddr(s))
	}
	return out, nil
}

func TestDialRefusesNamesThatResolveInside(t *testing.T) {
	g := &Guard{Resolver: fakeResolver{
		"inside.example": {"10.0.0.7"},
		"rebind.example": {"93.184.216.34", "127.0.0.1"},
		"meta.example":   {"169.254.169.254"},
		"mapped.example": {"::ffff:192.168.0.1"},
	}}
	for _, host := range []string{"inside.example", "rebind.example", "meta.example", "mapped.example", "127.0.0.1", "[::1]"} {
		_, err := g.DialContext(context.Background(), "tcp", host+":80")
		if !errors.Is(err, ErrBlocked) {
			t.Errorf("%s: err = %v, want ErrBlocked", host, err)
		}
	}
	if _, err := g.DialContext(context.Background(), "tcp", "1.1.1.1:22"); !errors.Is(err, ErrBlocked) {
		t.Errorf("port 22 allowed: %v", err)
	}
}

func TestClientRefusesLoopbackAndRedirectsInside(t *testing.T) {
	inner := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("secret")) }))
	defer inner.Close()
	g := &Guard{}
	_, err := g.Client(5 * time.Second).Get(inner.URL)
	if err == nil || !errors.Is(err, ErrBlocked) {
		t.Fatalf("loopback fetch: %v", err)
	}

	// With private addresses allowed (tests), a redirect chain is still capped.
	hops := 0
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++
		http.Redirect(w, r, srv.URL+"/again", http.StatusFound)
	}))
	defer srv.Close()
	open := &Guard{AllowPrivate: true}
	if _, err := open.Client(5 * time.Second).Get(srv.URL); err == nil || !errors.Is(err, ErrBlocked) {
		t.Fatalf("redirect loop: %v", err)
	}
	if hops != 4 {
		t.Fatalf("followed %d hops, want 4 (the request and 3 redirects)", hops)
	}
	// A redirect to a non-http scheme is refused.
	ftp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
	}))
	defer ftp.Close()
	if _, err := open.Client(5 * time.Second).Get(ftp.URL); err == nil {
		t.Fatal("redirect to file: followed")
	}
}

// A public host that redirects to a name resolving inside is refused at the
// redirect's dial. 127.0.0.1 plays the public host, 127.0.0.2 the inside one.
func TestRedirectToInsideIsRefused(t *testing.T) {
	inside := netip.MustParseAddr("127.0.0.2")
	g := &Guard{
		Resolver: fakeResolver{"inside.example": {"127.0.0.2"}},
		Block:    func(a netip.Addr) bool { return a == inside },
		Ports:    func(int) bool { return true },
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ok" {
			_, _ = w.Write([]byte("fine"))
			return
		}
		http.Redirect(w, r, "http://inside.example:"+strings.Split(r.Host, ":")[1]+"/", http.StatusFound)
	}))
	defer srv.Close()
	resp, err := g.Client(5 * time.Second).Get(srv.URL + "/ok")
	if err != nil {
		t.Fatalf("public fetch: %v", err)
	}
	resp.Body.Close()
	if _, err := g.Client(5 * time.Second).Get(srv.URL + "/go"); !errors.Is(err, ErrBlocked) {
		t.Fatalf("redirect inside: %v", err)
	}
}
