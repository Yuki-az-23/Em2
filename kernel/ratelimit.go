package kernel

import (
	"math"
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// limiter is an in-memory token bucket per key. It is per process; a
// multi-replica deployment shares nothing (acceptable until M7, see RUNBOOK).
type limiter struct {
	mu      sync.Mutex
	now     func() time.Time
	buckets map[string]*bucket
}

func newLimiter(now func() time.Time) *limiter {
	return &limiter{now: now, buckets: map[string]*bucket{}}
}

// allow takes one token. When refused it returns the seconds until one is free.
func (l *limiter) allow(key string, rl RateLimit) (bool, int) {
	if rl.Burst <= 0 || rl.Per <= 0 {
		return true, 0
	}
	rate := float64(rl.Burst) / rl.Per.Seconds() // tokens per second
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		if len(l.buckets) > 100_000 {
			l.prune(now, rate, float64(rl.Burst))
		}
		b = &bucket{tokens: float64(rl.Burst), last: now}
		l.buckets[key] = b
	}
	b.tokens = math.Min(float64(rl.Burst), b.tokens+now.Sub(b.last).Seconds()*rate)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	return false, int(math.Ceil((1 - b.tokens) / rate))
}

// prune drops buckets that have refilled completely.
func (l *limiter) prune(now time.Time, rate, burst float64) {
	for k, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*rate >= burst {
			delete(l.buckets, k)
		}
	}
}
