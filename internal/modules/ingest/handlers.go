package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/modules/ingest/internal/normalize"
	"em2.social/em2/internal/services"
	"em2.social/em2/internal/storage"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/markdown"
)

type channelOut struct {
	ID          string                   `json:"id"`
	Handle      string                   `json:"handle"`
	Title       string                   `json:"title"`
	Description string                   `json:"description"`
	Owner       services.PublicPrincipal `json:"owner"`
	CreatedAt   time.Time                `json:"created_at"`
}

type messageOut struct {
	ID         string                   `json:"id"`
	Plane      core.Plane               `json:"plane"`
	ChannelID  string                   `json:"channel_id,omitempty"`
	ReceiverID string                   `json:"receiver_id,omitempty"`
	ParentID   string                   `json:"parent_id,omitempty"`
	Author     services.PublicPrincipal `json:"author"`
	At         time.Time                `json:"at"`
	State      *core.EC                 `json:"state,omitempty"`
	BodyMD     string                   `json:"body_md"`
	BodyHTML   string                   `json:"body_html"`
}

// cursor encodes a keyset position (time, id) for newest-first pagination.
func encodeCursor(at time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + id))
}

func decodeCursor(s string) (time.Time, string, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, "", err
	}
	ts, id, ok := strings.Cut(string(b), "|")
	if !ok {
		return time.Time{}, "", errors.New("bad cursor")
	}
	at, err := time.Parse(time.RFC3339Nano, ts)
	return at, id, err
}

func pageArgs(req *kernel.Request) (limit int, after *time.Time, afterID string, err error) {
	limit = 20
	if v := req.Query.Get("limit"); v != "" {
		limit, _ = strconv.Atoi(v)
	}
	if c := req.Query.Get("cursor"); c != "" {
		at, id, e := decodeCursor(c)
		if e != nil {
			return 0, nil, "", kernel.BadRequest("The cursor is not valid.")
		}
		after, afterID = &at, id
	}
	return limit, after, afterID, nil
}

func (m *Module) authors(ctx context.Context, ids []string) (map[string]services.PublicPrincipal, error) {
	out, err := m.dir.Public(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		if _, ok := out[id]; !ok {
			out[id] = services.PublicPrincipal{ID: id, Handle: "deleted"}
		}
	}
	return out, nil
}

func (m *Module) createChannel(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct{ Handle, Title, Description string }
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	p, id, now := c.Principal(), kernel.NewID(), c.Now()
	if _, err := c.DB().Exec(c, `INSERT INTO channels (id, handle, title, description, owner_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		id, in.Handle, in.Title, in.Description, p.ID, now); err != nil {
		if kernel.IsUniqueViolation(err) {
			return nil, kernel.ErrConflict.WithDetail("The channel handle is not available.")
		}
		return nil, err
	}
	out := channelOut{ID: id, Handle: in.Handle, Title: in.Title, Description: in.Description,
		Owner: services.PublicPrincipal{ID: p.ID, Handle: p.Handle, Kind: p.Kind}, CreatedAt: now}
	return &kernel.Response{Status: http.StatusCreated, Location: "/v1/channels/" + id, Body: out}, nil
}

func (m *Module) scanChannels(c kernel.Ctx, sql string, args ...any) ([]channelOut, error) {
	rows, err := c.DB().Query(c, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []channelOut
	var owners []string
	for rows.Next() {
		var ch channelOut
		if err := rows.Scan(&ch.ID, &ch.Handle, &ch.Title, &ch.Description, &ch.Owner.ID, &ch.CreatedAt); err != nil {
			return nil, err
		}
		owners = append(owners, ch.Owner.ID)
		out = append(out, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	dir, err := m.authors(c, owners)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Owner = dir[out[i].Owner.ID]
	}
	return out, nil
}

const channelCols = `id, handle, title, description, owner_id, created_at`

func (m *Module) listChannels(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	limit, after, afterID, err := pageArgs(req)
	if err != nil {
		return nil, err
	}
	var items []channelOut
	if after == nil {
		items, err = m.scanChannels(c, `SELECT `+channelCols+` FROM channels ORDER BY created_at DESC, id DESC LIMIT $1`, limit+1)
	} else {
		items, err = m.scanChannels(c, `SELECT `+channelCols+` FROM channels WHERE (created_at, id) < ($2, $3::uuid)
			ORDER BY created_at DESC, id DESC LIMIT $1`, limit+1, *after, afterID)
	}
	if err != nil {
		return nil, err
	}
	body := map[string]any{"items": nonNilChannels(items)}
	if len(items) > limit {
		items = items[:limit]
		body["items"] = items
		last := items[len(items)-1]
		body["next_cursor"] = encodeCursor(last.CreatedAt, last.ID)
	}
	return kernel.JSON(http.StatusOK, body), nil
}

func nonNilChannels(v []channelOut) []channelOut {
	if v == nil {
		return []channelOut{}
	}
	return v
}

func (m *Module) getChannel(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	items, err := m.scanChannels(c, `SELECT `+channelCols+` FROM channels WHERE id = $1`, req.Params["id"])
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, kernel.ErrNotFound
	}
	return kernel.JSON(http.StatusOK, items[0]), nil
}

// publish accepts a message. Every accepted message gets the same response:
// 202 with its id, padded to a fixed time (ADR-011).
func (m *Module) publish(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		ChannelID string   `json:"channel_id"`
		ParentID  string   `json:"parent_id"`
		BodyMD    string   `json:"body_md"`
		Claims    *core.EC `json:"claims"`
	}
	if err := req.Decode(&in); err != nil {
		return nil, kernel.BadRequest("Unknown emotion or color in claims.")
	}
	p := c.Principal()
	stance, err := m.stances.Stance(c, p.ID)
	if err != nil {
		return nil, err
	}
	if stance == nil {
		// About the caller themself, so it is safe to say.
		return nil, kernel.ErrConflict.WithDetail("Set your bridge with PUT /v1/me/bridge before publishing.")
	}
	var exists bool
	if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM channels WHERE id = $1)`, in.ChannelID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, kernel.ErrNotFound.WithDetail("No such channel.")
	}
	if in.ParentID != "" {
		if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM messages WHERE id = $1 AND channel_id = $2)`, in.ParentID, in.ChannelID).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists {
			return nil, kernel.ErrNotFound.WithDetail("No such parent message in this channel.")
		}
	}
	msg, doc, err := normalize.Bus(normalize.BusInput{ID: kernel.NewID(), At: c.Now(), Sender: *p, Stance: stance,
		ChannelID: in.ChannelID, ParentID: in.ParentID, BodyMD: in.BodyMD, Claim: in.Claims, Header: req.Header})
	if err != nil {
		return nil, kernel.BadRequest("The body is not valid Markdown for EM2 (too long, too complex or not UTF-8).")
	}
	if err := m.store(c, msg, doc, string(p.Kind)); err != nil {
		return nil, err
	}
	return &kernel.Response{Status: http.StatusAccepted, Location: "/v1/messages/" + msg.ID, Body: map[string]string{"id": msg.ID}}, nil
}

// store writes a normalized message and announces it. The dossier and the
// verdicts follow asynchronously from the event.
func (m *Module) store(c kernel.Ctx, msg core.Message, doc *markdown.Doc, senderKind string) error {
	ast, _ := json.Marshal(doc.Root)
	claims, _ := json.Marshal(msg.Claims)
	prov, _ := json.Marshal(msg.Provenance)
	links := doc.Links
	if links == nil {
		links = []string{}
	}
	nullable := func(s string) any {
		if s == "" {
			return nil
		}
		return s
	}
	var se, sc any
	if msg.Stance != nil {
		se, sc = int16(msg.Stance.Emotion), int16(msg.Stance.Color)
	}
	senderID, origin := msg.Sender.ID, ""
	if msg.Sender.Kind == core.RefExternal {
		senderID, origin = msg.Receiver.ID, msg.Sender.ID
	}
	receiver := ""
	if msg.ChannelID == "" {
		receiver = msg.Receiver.ID
	}
	if _, err := c.DB().Exec(c, `INSERT INTO messages (id, at, plane, direction, sender_id, sender_kind, channel_id, receiver_id, parent_id,
		stance_emotion, stance_color, content_hash, mime, body_md, body_ast, bytes, links, claims, provenance, origin)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
		msg.ID, msg.At, msg.Plane, msg.Direction, senderID, senderKind, nullable(msg.ChannelID), nullable(receiver), nullable(msg.ParentID),
		se, sc, msg.Content.SHA256, msg.Content.Mime, msg.Content.BodyMD, ast, msg.Content.Bytes,
		links, claims, prov, nullable(origin)); err != nil {
		return err
	}
	ev := map[string]string{"message_id": msg.ID, "content_hash": hex.EncodeToString(msg.Content.SHA256), "sender_id": senderID}
	if msg.ChannelID != "" {
		ev["channel_id"] = msg.ChannelID
	} else {
		ev["receiver_id"] = receiver
	}
	return c.Publish(EventMessageReceived, ev)
}

const messageCols = `id, plane, channel_id, receiver_id, parent_id, sender_id, at, COALESCE(state_emotion, stance_emotion), COALESCE(state_color, stance_color), body_md, body_ast`

// readable limits direct messages to their sender, their receiver and
// observers; channel messages are readable by every principal.
func readable(p *core.Principal, alias string) (string, []any) {
	if p.HasRole("observer") || p.HasRole("admin") {
		return "true", nil
	}
	return "(" + alias + "channel_id IS NOT NULL OR " + alias + "sender_id = $READER OR " + alias + "receiver_id = $READER)", []any{p.ID}
}

func (m *Module) scanMessages(c kernel.Ctx, sql string, args ...any) ([]messageOut, error) {
	rows, err := c.DB().Query(c, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []messageOut
	var senders []string
	for rows.Next() {
		var mo messageOut
		var channel, receiver, parent *string
		var se, sc *int16
		var ast []byte
		if err := rows.Scan(&mo.ID, &mo.Plane, &channel, &receiver, &parent, &mo.Author.ID, &mo.At, &se, &sc, &mo.BodyMD, &ast); err != nil {
			return nil, err
		}
		mo.ChannelID, mo.ReceiverID, mo.ParentID = deref(channel), deref(receiver), deref(parent)
		if se != nil && sc != nil {
			mo.State = &core.EC{Emotion: core.Emotion(*se), Color: core.Color(*sc)}
		}
		var root markdown.Node
		if err := json.Unmarshal(ast, &root); err != nil {
			return nil, err
		}
		mo.BodyHTML = markdown.HTML(&root)
		senders = append(senders, mo.Author.ID)
		out = append(out, mo)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	dir, err := m.authors(c, senders)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Author = dir[out[i].Author.ID]
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (m *Module) getMessage(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	cond, args := readable(c.Principal(), "")
	items, err := m.scanMessages(c, `SELECT `+messageCols+` FROM messages WHERE id = $1 AND `+strings.ReplaceAll(cond, "$READER", "$2"),
		append([]any{req.Params["id"]}, args...)...)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, kernel.ErrNotFound
	}
	return kernel.JSON(http.StatusOK, items[0]), nil
}

func (m *Module) listMessages(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	limit, after, afterID, err := pageArgs(req)
	if err != nil {
		return nil, err
	}
	var exists bool
	if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM channels WHERE id = $1)`, req.Params["id"]).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, kernel.ErrNotFound
	}
	var items []messageOut
	if after == nil {
		items, err = m.scanMessages(c, `SELECT `+messageCols+` FROM messages WHERE channel_id = $2
			ORDER BY at DESC, id DESC LIMIT $1`, limit+1, req.Params["id"])
	} else {
		items, err = m.scanMessages(c, `SELECT `+messageCols+` FROM messages WHERE channel_id = $2 AND (at, id) < ($3, $4::uuid)
			ORDER BY at DESC, id DESC LIMIT $1`, limit+1, req.Params["id"], *after, afterID)
	}
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []messageOut{}
	}
	body := map[string]any{"items": items}
	if len(items) > limit {
		items = items[:limit]
		body["items"] = items
		last := items[len(items)-1]
		body["next_cursor"] = encodeCursor(last.At, last.ID)
	}
	return kernel.JSON(http.StatusOK, body), nil
}

// getDossier shows a dossier to observers, to anyone who sent that content and
// to the receivers of direct messages that carried it.
// Everyone else gets the same 404 as for unknown content.
func (m *Module) getDossier(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	hash, _ := hex.DecodeString(req.Params["hash"])
	p := c.Principal()
	allowed := p.HasRole("observer") || p.HasRole("admin")
	if !allowed {
		if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM messages WHERE content_hash = $1 AND (sender_id = $2 OR receiver_id = $2))`, hash, p.ID).Scan(&allowed); err != nil {
			return nil, err
		}
	}
	if !allowed {
		return nil, kernel.ErrNotFound
	}
	var body []byte
	err := c.DB().QueryRow(c, `SELECT body FROM dossiers WHERE content_hash = $1`, hash).Scan(&body)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &kernel.Response{Status: http.StatusOK, Body: json.RawMessage(body)}, nil
}

// sniffImage returns the image type from magic bytes, or "".
func sniffImage(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg"
	case bytes.HasPrefix(b, []byte("GIF87a")), bytes.HasPrefix(b, []byte("GIF89a")):
		return "image/gif"
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		return "image/webp"
	}
	return ""
}

func (m *Module) uploadMedia(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	declared, _, _ := mime.ParseMediaType(req.Header.Get("Content-Type"))
	switch declared {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
	default:
		return nil, kernel.ErrUnsupportedMedia.WithDetail("Upload a PNG, JPEG, GIF or WebP image as the raw request body.")
	}
	data, err := io.ReadAll(io.LimitReader(req.Raw.Body, m.cfg.MaxMedia+1))
	if err != nil {
		return nil, kernel.BadRequest("The request body could not be read.")
	}
	if int64(len(data)) > m.cfg.MaxMedia {
		return nil, kernel.ErrPayloadTooLarge
	}
	if sniffImage(data) != declared {
		return nil, kernel.BadRequest("The file content does not match its declared image type.")
	}
	id, sum := kernel.NewID(), sha256.Sum256(data)
	if _, err := c.DB().Exec(c, `INSERT INTO media (id, owner_id, mime, bytes, sha256, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		id, c.Principal().ID, declared, len(data), sum[:], c.Now()); err != nil {
		return nil, err
	}
	// Write the file last: if it fails, the row rolls back with the request.
	if err := m.cfg.Media.Put(c, id, data); err != nil {
		return nil, err
	}
	url := "/v1/media/" + id
	return &kernel.Response{Status: http.StatusCreated, Location: url,
		Body: map[string]any{"id": id, "url": url, "mime": declared, "bytes": len(data)}}, nil
}

func (m *Module) getMedia(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var typ string
	err := c.DB().QueryRow(c, `SELECT mime FROM media WHERE id = $1`, req.Params["id"]).Scan(&typ)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	data, err := m.cfg.Media.Get(c, req.Params["id"])
	if errors.Is(err, storage.ErrNotFound) {
		return nil, kernel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &kernel.Response{Status: http.StatusOK, Raw: data, ContentType: typ, ETag: req.Params["id"],
		Headers: map[string]string{"Cache-Control": "public, max-age=31536000, immutable", "Content-Disposition": "inline"}}, nil
}
