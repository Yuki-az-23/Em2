package ingest

import (
	"time"

	"em2.social/em2/core"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/markdown"
	"em2.social/em2/pkg/schema"
)

var (
	idParam     = map[string]*schema.Schema{"id": schema.UUID()}
	hashParam   = map[string]*schema.Schema{"hash": schema.String().Match(`[0-9a-f]{64}`)}
	pageQuery   = schema.Object(schema.Opt("cursor", schema.String().Len(1, 200)), schema.Opt("limit", schema.Integer().Range(1, 50)))
	ecSchema    = schema.Object(schema.Req("emotion", schema.Enum(core.EmotionNames()...)), schema.Req("color", schema.Enum(core.ColorNames()...)))
	principalV  = schema.Object(schema.Req("id", schema.UUID()), schema.Req("handle", schema.String()), schema.Req("kind", schema.String()))
	channelView = schema.Object(
		schema.Req("id", schema.UUID()), schema.Req("handle", schema.String()), schema.Req("title", schema.String()),
		schema.Req("description", schema.String()), schema.Req("owner", principalV), schema.Req("created_at", schema.DateTime()))
	messageView = schema.Object(
		schema.Req("id", schema.UUID()), schema.Req("plane", schema.Enum("bus", "ingress", "egress")),
		schema.Opt("channel_id", schema.UUID()), schema.Opt("receiver_id", schema.UUID().Doc("Set on direct messages instead of channel_id.")),
		schema.Opt("parent_id", schema.UUID()),
		schema.Req("author", principalV), schema.Req("at", schema.DateTime()),
		schema.Opt("state", ecSchema.Doc("The message's current emotional state. It starts at the author's bridge and moves only by pressure. Absent when not known (external content).")),
		schema.Req("body_md", schema.String()), schema.Req("body_html", schema.String()))
	signalView  = schema.Object(schema.Req("name", schema.String()), schema.Req("value", schema.Number()), schema.Req("weight", schema.Number()), schema.Req("evidence", schema.String()))
	dossierView = schema.Object(
		schema.Req("content_hash", schema.String()), schema.Req("first_seen", schema.DateTime()), schema.Req("seen_count", schema.Integer()),
		schema.Req("senders", schema.Integer()), schema.Req("velocity", schema.Number()), schema.Req("burstiness", schema.Number()),
		schema.Req("sender_concentration", schema.Number()), schema.Req("drift", schema.Number()), schema.Req("risk", schema.Number()),
		schema.Req("signals", schema.Array(signalView)), schema.Req("version", schema.String()), schema.Opt("links", schema.Array(schema.String())))

	messageEvent = schema.Object(schema.Req("message_id", schema.UUID()), schema.Req("content_hash", schema.String().Match(`[0-9a-f]{64}`)),
		schema.Req("sender_id", schema.UUID()), schema.Opt("channel_id", schema.UUID()), schema.Opt("receiver_id", schema.UUID()))
	assessedEvent = schema.Object(schema.Req("message_id", schema.UUID()), schema.Req("content_hash", schema.String().Match(`[0-9a-f]{64}`)),
		schema.Req("plane", schema.Enum("bus", "ingress", "egress")), schema.Req("sender_id", schema.UUID()), schema.Req("sender_kind", schema.String()),
		schema.Opt("channel_id", schema.UUID()), schema.Opt("receiver_id", schema.UUID()), schema.Opt("parent_id", schema.UUID()),
		schema.Opt("stance", ecSchema), schema.Req("risk", schema.Number()), schema.Req("at", schema.DateTime()))
	dossierEvent = schema.Object(schema.Req("content_hash", schema.String().Match(`[0-9a-f]{64}`)), schema.Req("risk", schema.Number()), schema.Req("version", schema.String()))
)

func page(item *schema.Schema) *schema.Schema {
	return schema.Object(schema.Req("items", schema.Array(item)), schema.Opt("next_cursor", schema.String()))
}

func (m *Module) routes() []kernel.Route {
	tags := []string{"messages"}
	return []kernel.Route{
		{Method: "POST", Path: "/v1/channels", OperationID: "createChannel", Summary: "Create a channel", Tags: tags,
			Auth: kernel.AuthPrincipal, Scope: "post:create",
			Body: schema.Object(schema.Req("handle", schema.String().Match(`[a-z][a-z0-9_-]{2,31}`)), schema.Req("title", schema.String().Len(1, 100)),
				schema.Opt("description", schema.String().Len(0, 1000))),
			Responses: map[int]*schema.Schema{201: channelView}, RateLimit: &kernel.RateLimit{Burst: 20, Per: time.Hour}, Handler: m.createChannel},
		{Method: "GET", Path: "/v1/channels", OperationID: "listChannels", Summary: "Channels, newest first", Tags: tags,
			Auth: kernel.AuthPrincipal, Query: pageQuery, Responses: map[int]*schema.Schema{200: page(channelView)}, Handler: m.listChannels},
		{Method: "GET", Path: "/v1/channels/{id}", OperationID: "getChannel", Summary: "One channel", Tags: tags,
			Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: channelView}, Handler: m.getChannel},
		{Method: "GET", Path: "/v1/channels/{id}/messages", OperationID: "listChannelMessages", Summary: "Messages in a channel, newest first", Tags: tags,
			Auth: kernel.AuthPrincipal, Params: idParam, Query: pageQuery, Responses: map[int]*schema.Schema{200: page(messageView)}, Handler: m.listMessages},

		{Method: "POST", Path: "/v1/messages", OperationID: "publishMessage",
			Summary: "Publish a message. The response is the same 202 for every accepted message; delivery decisions belong to the receivers.",
			Tags:    tags, Auth: kernel.AuthPrincipal, Scope: "post:create", Idempotent: true,
			Body: schema.Object(schema.Req("channel_id", schema.UUID()), schema.Opt("parent_id", schema.UUID()),
				schema.Req("body_md", schema.String().Len(1, markdown.MaxBytes)),
				schema.Opt("claims", ecSchema.Doc("What you say the content's emotion is. Recorded as a claim; it does not set the message's state."))),
			Responses: map[int]*schema.Schema{202: schema.Object(schema.Req("id", schema.UUID()))},
			RateLimit: &kernel.RateLimit{Burst: 60, Per: time.Minute}, MinDuration: m.cfg.PublishPad, Handler: m.publish},
		{Method: "GET", Path: "/v1/messages/{id}", OperationID: "getMessage", Summary: "One message", Tags: tags,
			Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: messageView}, Handler: m.getMessage},

		{Method: "GET", Path: "/v1/dossiers/{hash}", OperationID: "getDossier",
			Summary: "Evidence about one piece of content. Visible to its authors, to receivers of direct messages carrying it, and to observers.", Tags: []string{"dossiers"},
			Auth: kernel.AuthPrincipal, Params: hashParam, Responses: map[int]*schema.Schema{200: dossierView}, Handler: m.getDossier},

		{Method: "POST", Path: "/v1/media", OperationID: "uploadMedia",
			Summary: "Upload an image (PNG, JPEG, GIF or WebP, up to 5 MB) as the raw request body", Tags: []string{"media"},
			Auth: kernel.AuthPrincipal, Scope: "post:create",
			Responses: map[int]*schema.Schema{201: schema.Object(schema.Req("id", schema.UUID()), schema.Req("url", schema.String()), schema.Req("mime", schema.String()), schema.Req("bytes", schema.Integer()))},
			RateLimit: &kernel.RateLimit{Burst: 60, Per: time.Hour}, Handler: m.uploadMedia},
		{Method: "GET", Path: "/v1/media/{id}", OperationID: "getMedia", Summary: "Download an image", Tags: []string{"media"},
			Params: idParam, Responses: map[int]*schema.Schema{200: nil}, Handler: m.getMedia},
	}
}
