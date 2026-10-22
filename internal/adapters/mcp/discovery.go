package mcp

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	htmltemplate "html/template"
	"net/http"
	"text/template"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/kernel"
)

//go:embed docs/*
var docsFS embed.FS

const style = "body{font:16px/1.55 system-ui,sans-serif;margin:0;color:#1d1d1f;background:#fbfaf7}" +
	"main{max-width:42rem;margin:0 auto;padding:3rem 1.25rem}h1{font-size:2.4rem;margin:0 0 1rem}" +
	"code{background:#efece4;padding:.1rem .3rem;border-radius:.25rem}a{color:#5b3fbf}" +
	"@media(prefers-color-scheme:dark){body{color:#ecebe8;background:#17161a}code{background:#2a282e}a{color:#b6a4ff}}"

var (
	llmsTmpl  = template.Must(template.ParseFS(docsFS, "docs/llms.md"))
	indexTmpl = htmltemplate.Must(htmltemplate.ParseFS(docsFS, "docs/index.html"))
	styleHash = func() string { h := sha256.Sum256([]byte(style)); return base64.StdEncoding.EncodeToString(h[:]) }()
)

func (a *Adapter) discoveryRoutes(r *kernel.Registry) {
	doc := func(path, id, summary string, h kernel.HandlerFunc) {
		r.Route(kernel.Route{Method: "GET", Path: path, OperationID: id, Summary: summary, Hidden: true,
			RateLimit: &kernel.RateLimit{Burst: 120, Per: time.Minute}, Handler: h})
	}
	doc("/{$}", "landing", "Landing page", a.landing)
	doc("/llms.txt", "llmsTxt", "Guide for language models and agents", a.llmsTxt)
	doc("/robots.txt", "robotsTxt", "Crawler rules", a.robots)
	doc("/.well-known/em2-agent.json", "agentCard", "Machine-readable summary for agents", a.card)
}

func public(body []byte, ct string) *kernel.Response {
	return &kernel.Response{Status: http.StatusOK, Raw: body, ContentType: ct,
		Headers: map[string]string{"Cache-Control": "public, max-age=300"}}
}

func (a *Adapter) llms() string {
	var b bytes.Buffer
	_ = llmsTmpl.Execute(&b, map[string]any{"Base": a.cfg.PublicURL, "Tools": a.tools()})
	return b.String()
}

func (a *Adapter) llmsTxt(kernel.Ctx, *kernel.Request) (*kernel.Response, error) {
	return public([]byte(a.llms()), "text/markdown; charset=utf-8"), nil
}

func (a *Adapter) landing(kernel.Ctx, *kernel.Request) (*kernel.Response, error) {
	var b bytes.Buffer
	if err := indexTmpl.Execute(&b, map[string]any{"Base": a.cfg.PublicURL, "Style": htmltemplate.CSS(style)}); err != nil {
		return nil, err
	}
	resp := public(b.Bytes(), "text/html; charset=utf-8")
	resp.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'sha256-" + styleHash + "'; frame-ancestors 'none'; base-uri 'none'"
	return resp, nil
}

const robots = `# EM2: the public guide and descriptions are for everyone, crawlers included.
User-agent: *
Allow: /$
Allow: /llms.txt
Allow: /.well-known/
Allow: /v1/openapi.json
Disallow: /v1/
Disallow: /ingress/
Disallow: /mcp
`

func (a *Adapter) robots(kernel.Ctx, *kernel.Request) (*kernel.Response, error) {
	return public([]byte(robots), "text/plain; charset=utf-8"), nil
}

// card is the machine-readable summary. It describes capabilities and
// endpoints, never versions, hostnames of internals or rule details.
func (a *Adapter) card(kernel.Ctx, *kernel.Request) (*kernel.Response, error) {
	names := []string{}
	for _, t := range a.tools() {
		names = append(names, t.Name)
	}
	b, _ := json.MarshalIndent(map[string]any{
		"name":        "EM2",
		"description": "Emotion-guided communication proxy: per-receiver verdicts against emotional bridges, evidence dossiers against spam and manipulation, uniform answers to senders.",
		"endpoints": map[string]string{
			"mcp": a.cfg.PublicURL + "/mcp", "openapi": a.cfg.PublicURL + "/v1/openapi.json", "guide": a.cfg.PublicURL + "/llms.txt",
			"api": a.cfg.PublicURL + "/v1",
		},
		"mcp":            map[string]any{"transport": "streamable-http", "protocol_versions": versions, "tools": names},
		"authentication": map[string]any{"type": "bearer", "how": "Register a human, create an agent and issue it a key; see the guide."},
		"agent_scopes":   core.AgentScopes,
		"emotions":       core.EmotionNames(),
		"colors":         core.ColorNames(),
	}, "", "  ")
	return public(b, "application/json"), nil
}
