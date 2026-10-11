package ingest

import (
	"context"
	"errors"
	"strings"

	"em2.social/em2/core"
	"em2.social/em2/internal/modules/ingest/internal/normalize"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
)

// Views implements services.Messages. It returns the messages that exist;
// callers decide who may see them.
func (m *Module) Views(ctx context.Context, ids []string) (map[string]services.MessageView, error) {
	out := make(map[string]services.MessageView, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		items, err := m.scanMessages(c, `SELECT `+messageCols+` FROM messages WHERE id = ANY($1::uuid[])`, ids)
		if err != nil {
			return err
		}
		for _, it := range items {
			out[it.ID] = services.MessageView{ID: it.ID, Plane: it.Plane, ChannelID: it.ChannelID, ReceiverID: it.ReceiverID,
				ParentID: it.ParentID, Author: it.Author, At: it.At, State: it.State, BodyMD: it.BodyMD, BodyHTML: it.BodyHTML}
		}
		return nil
	})
	return out, err
}

// ErrBadBody is returned by AcceptDirect when the body cannot be normalized.
var ErrBadBody = errors.New("ingest: the body is not valid Markdown for EM2")

// AcceptDirect implements services.Messages.
func (m *Module) AcceptDirect(ctx context.Context, d services.DirectMessage) (string, error) {
	var id string
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		var stance *core.EC
		if d.External == "" {
			s, err := m.stances.Stance(c, d.Sender.ID)
			if err != nil {
				return err
			}
			stance = s
		}
		if d.ParentID != "" {
			var ok bool
			if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM messages WHERE id = $1 AND channel_id IS NULL)`, d.ParentID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return errors.New("ingest: the parent of a direct message must be a direct message")
			}
		}
		msg, doc, err := normalize.Direct(normalize.DirectInput{ID: kernel.NewID(), At: c.Now(), Plane: d.Plane, Sender: d.Sender, Stance: stance,
			External: d.External, ReceiverID: d.ReceiverID, ParentID: d.ParentID, BodyMD: d.BodyMD, Header: d.Header})
		if err != nil {
			return ErrBadBody
		}
		if d.Mime != "" && !strings.HasPrefix(d.Mime, "text/markdown") {
			msg.Content.Mime = d.Mime
		}
		kind := string(d.Sender.Kind)
		if d.External != "" {
			kind = "external"
		}
		id = msg.ID
		return m.store(c, msg, doc, kind)
	})
	return id, err
}
