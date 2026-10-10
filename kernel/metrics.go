package kernel

import (
	"fmt"
	"io"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

var durationBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5}

type histogram struct {
	counts []uint64
	sum    float64
	n      uint64
}

// metrics is a minimal Prometheus text-format registry (no dependency).
type metrics struct {
	mu          sync.Mutex
	requests    map[[3]string]uint64 // route, method, status
	durations   map[string]*histogram
	rateLimited atomic.Uint64
	published   atomic.Uint64
	delivered   atomic.Uint64
	failed      atomic.Uint64
}

func newMetrics() *metrics {
	return &metrics{requests: map[[3]string]uint64{}, durations: map[string]*histogram{}}
}

func (m *metrics) observe(route, method string, status int, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requests[[3]string{route, method, fmt.Sprint(status)}]++
	h := m.durations[route]
	if h == nil {
		h = &histogram{counts: make([]uint64, len(durationBuckets))}
		m.durations[route] = h
	}
	s := d.Seconds()
	for i, b := range durationBuckets {
		if s <= b {
			h.counts[i]++
		}
	}
	h.sum += s
	h.n++
}

func (m *metrics) write(w io.Writer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	fmt.Fprintln(w, "# TYPE em2_http_requests_total counter")
	keys := make([][3]string, 0, len(m.requests))
	for k := range m.requests {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return fmt.Sprint(keys[i]) < fmt.Sprint(keys[j]) })
	for _, k := range keys {
		fmt.Fprintf(w, "em2_http_requests_total{route=%q,method=%q,status=%q} %d\n", k[0], k[1], k[2], m.requests[k])
	}
	fmt.Fprintln(w, "# TYPE em2_http_request_duration_seconds histogram")
	routes := make([]string, 0, len(m.durations))
	for r := range m.durations {
		routes = append(routes, r)
	}
	sort.Strings(routes)
	for _, r := range routes {
		h := m.durations[r]
		for i, b := range durationBuckets {
			fmt.Fprintf(w, "em2_http_request_duration_seconds_bucket{route=%q,le=\"%g\"} %d\n", r, b, h.counts[i])
		}
		fmt.Fprintf(w, "em2_http_request_duration_seconds_bucket{route=%q,le=\"+Inf\"} %d\n", r, h.n)
		fmt.Fprintf(w, "em2_http_request_duration_seconds_sum{route=%q} %g\n", r, h.sum)
		fmt.Fprintf(w, "em2_http_request_duration_seconds_count{route=%q} %d\n", r, h.n)
	}
	fmt.Fprintln(w, "# TYPE em2_rate_limited_total counter")
	fmt.Fprintf(w, "em2_rate_limited_total %d\n", m.rateLimited.Load())
	fmt.Fprintln(w, "# TYPE em2_events_published_total counter")
	fmt.Fprintf(w, "em2_events_published_total %d\n", m.published.Load())
	fmt.Fprintln(w, "# TYPE em2_events_delivered_total counter")
	fmt.Fprintf(w, "em2_events_delivered_total %d\n", m.delivered.Load())
	fmt.Fprintln(w, "# TYPE em2_events_failed_total counter")
	fmt.Fprintf(w, "em2_events_failed_total %d\n", m.failed.Load())
}
