package kernel

import (
	"net/http"
	"sort"
	"strings"

	"em2.social/em2/pkg/schema"
)

var problemSchema = schema.Object(
	schema.Req("type", schema.String()),
	schema.Req("title", schema.String()),
	schema.Req("status", schema.Integer()),
	schema.Opt("detail", schema.String()),
	schema.Opt("instance", schema.String()),
	schema.Opt("errors", schema.Array(schema.Object(schema.Req("pointer", schema.String()), schema.Req("detail", schema.String())))),
)

// OpenAPI builds the OpenAPI 3.1 document from the route table. The public
// document leaves out admin routes. Neither carries a build version (ADR-011).
func (k *Kernel) OpenAPI(admin bool) map[string]any {
	paths := map[string]map[string]any{}
	routes := append([]*Route(nil), k.routes...)
	sort.Slice(routes, func(i, j int) bool { return routes[i].Path+routes[i].Method < routes[j].Path+routes[j].Method })
	for _, rt := range routes {
		if !admin && (rt.Auth == AuthAdmin || strings.HasPrefix(rt.Path, "/v1/admin/")) {
			continue
		}
		op := map[string]any{"operationId": rt.OperationID, "summary": rt.Summary}
		if len(rt.Tags) > 0 {
			op["tags"] = rt.Tags
		}
		if rt.Auth != AuthNone {
			op["security"] = []map[string][]string{{"bearer": {}}}
		}
		if rt.Scope != "" {
			op["x-em2-agent-scope"] = rt.Scope
		}
		var params []map[string]any
		names := make([]string, 0, len(rt.Params))
		for n := range rt.Params {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			params = append(params, map[string]any{"name": n, "in": "path", "required": true, "schema": rt.Params[n]})
		}
		if rt.Query != nil {
			qn := make([]string, 0, len(rt.Query.Properties))
			for n := range rt.Query.Properties {
				qn = append(qn, n)
			}
			sort.Strings(qn)
			for _, n := range qn {
				req := false
				for _, r := range rt.Query.Required {
					req = req || r == n
				}
				params = append(params, map[string]any{"name": n, "in": "query", "required": req, "schema": rt.Query.Properties[n]})
			}
		}
		if len(params) > 0 {
			op["parameters"] = params
		}
		if rt.Body != nil {
			op["requestBody"] = map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": rt.Body}}}
		} else if len(rt.RawBody) > 0 {
			content := map[string]any{}
			for _, t := range rt.RawBody {
				content[t] = map[string]any{}
			}
			op["requestBody"] = map[string]any{"required": true, "content": content}
		}
		responses := map[string]any{"default": map[string]any{
			"description": "Problem (RFC 9457)",
			"content":     map[string]any{"application/problem+json": map[string]any{"schema": map[string]string{"$ref": "#/components/schemas/Problem"}}},
		}}
		for code, s := range rt.Responses {
			resp := map[string]any{"description": http.StatusText(code)}
			if s != nil {
				resp["content"] = map[string]any{"application/json": map[string]any{"schema": s}}
			}
			responses[itoa(code)] = resp
		}
		op["responses"] = responses
		if paths[rt.Path] == nil {
			paths[rt.Path] = map[string]any{}
		}
		paths[rt.Path][strings.ToLower(rt.Method)] = op
	}
	return map[string]any{
		"openapi": "3.1.0",
		"info": map[string]any{
			"title":       "EM2",
			"version":     "v1",
			"description": "EM2 is an emotion-guided communication proxy. Agents send and receive messages through it; each message is scored against the receiver's EC Bridge.",
			"license":     map[string]string{"name": "AGPL-3.0-or-later", "identifier": "AGPL-3.0-or-later"},
		},
		"paths": paths,
		"components": map[string]any{
			"securitySchemes": map[string]any{"bearer": map[string]string{"type": "http", "scheme": "bearer",
				"description": "A human access token (JWT) or an agent API key (em2_ak_...)."}},
			"schemas": map[string]any{"Problem": problemSchema},
		},
	}
}
