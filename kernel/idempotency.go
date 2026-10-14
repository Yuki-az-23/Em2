package kernel

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"regexp"
	"time"
)

var idemKeyRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type idemRequest struct {
	principal, route, key string
	hash                  []byte
}

type idemStored struct {
	hash     []byte
	status   int
	location string
	body     []byte
}

func requestHash(r *http.Request, body []byte) []byte {
	h := sha256.New()
	h.Write([]byte(r.Method + " " + r.URL.Path + "?" + r.URL.RawQuery + "\n"))
	h.Write(body)
	return h.Sum(nil)
}

// idemLookup returns the stored result for the key, if any. It reads with the
// kernel's own connection, outside any module scope.
func (k *Kernel) idemLookup(ctx context.Context, q *idemRequest) (*idemStored, error) {
	if k.cfg.Pool == nil {
		return nil, ErrNoDatabase
	}
	var s idemStored
	err := k.cfg.Pool.QueryRow(ctx, `SELECT request_hash, status, location, body FROM kernel.idempotency
		WHERE principal_id = $1 AND route = $2 AND key = $3 AND created_at > now() - interval '24 hours'`,
		q.principal, q.route, q.key).Scan(&s.hash, &s.status, &s.location, &s.body)
	if IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// idemRecord stores the result inside the handler's transaction, so it exists
// if and only if the handler's effects commit. It reports false when another
// request with the same key already stored a result.
func (k *Kernel) idemRecord(c *execCtx, q *idemRequest, resp *Response) (bool, error) {
	var body []byte
	if resp.Body != nil && resp.Raw == nil {
		b, err := json.Marshal(resp.Body)
		if err != nil {
			return false, err
		}
		body = b
	}
	status := resp.Status
	if status == 0 {
		status = http.StatusOK
	}
	tag, err := c.tx.Exec(c, `INSERT INTO kernel.idempotency (principal_id, route, key, request_hash, status, location, body)
		VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`, q.principal, q.route, q.key, q.hash, status, resp.Location, body)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// writeStored replays a stored result, or refuses a key reused for a
// different request.
func (k *Kernel) writeStored(w http.ResponseWriter, s *idemStored, q *idemRequest) {
	if string(s.hash) != string(q.hash) {
		writeProblem(w, ErrConflict.WithDetail("This Idempotency-Key was already used for a different request."), w.Header().Get("X-Request-Id"))
		return
	}
	h := w.Header()
	h.Set("Idempotent-Replayed", "true")
	if s.location != "" {
		h.Set("Location", s.location)
	}
	if s.body == nil {
		w.WriteHeader(s.status)
		return
	}
	h.Set("Content-Type", "application/json")
	w.WriteHeader(s.status)
	_, _ = w.Write(append(s.body, '\n'))
}

// idemCleanupLoop deletes stored results older than 24 hours, hourly.
func (k *Kernel) idemCleanupLoop(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if _, err := k.cfg.Pool.Exec(ctx, `DELETE FROM kernel.idempotency WHERE created_at < now() - interval '24 hours'`); err != nil && ctx.Err() == nil {
				k.log.Error("idempotency cleanup failed", "error", err)
			}
		}
	}
}
