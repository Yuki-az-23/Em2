// Package convert turns protocol payloads (JSON, plain text, Markdown, HTML)
// into the Markdown body of a canonical message. The result is always valid
// for pkg/markdown and never longer than Limit bytes; nothing here is trusted
// or rendered as raw HTML.
package convert

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"mime"
	"regexp"
	"strings"
	"unicode/utf8"

	"em2.social/em2/pkg/markdown"
)

// Limit leaves room under markdown.MaxBytes for the fence and the note.
const Limit = markdown.MaxBytes - 512

// Result is a converted body.
type Result struct {
	Markdown  string
	Truncated bool // the content was cut to fit
	Text      bool // false when the content was not text and only described
}

// ToMarkdown converts a body by its Content-Type.
func ToMarkdown(contentType string, body []byte) Result {
	mt, _, _ := mime.ParseMediaType(contentType)
	switch {
	case !utf8.Valid(body):
		return describe(mt, len(body))
	case mt == "application/json" || strings.HasSuffix(mt, "+json"):
		var buf bytes.Buffer
		if json.Indent(&buf, body, "", "  ") == nil {
			body = buf.Bytes()
		}
		return Fenced("json", string(body))
	case mt == "text/html" || mt == "application/xhtml+xml":
		return markdownOrFenced(HTMLToText(string(body)))
	case mt == "text/markdown" || mt == "text/plain" || mt == "":
		return markdownOrFenced(string(body))
	case strings.HasPrefix(mt, "text/"):
		return Fenced("", string(body))
	}
	return describe(mt, len(body))
}

func describe(mt string, n int) Result {
	if mt == "" {
		mt = "unknown type"
	}
	return Result{Markdown: fmt.Sprintf("_Non-text content (%s, %d bytes); EM2 keeps only this description._", mt, n)}
}

// markdownOrFenced keeps text as Markdown when it parses, and otherwise
// shows it verbatim in a code block.
func markdownOrFenced(s string) Result {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n"))
	if s == "" {
		return Result{Markdown: "_Empty body._", Text: true}
	}
	cut, truncated := cutUTF8(s, Limit)
	if _, err := markdown.Parse(cut); err == nil {
		if truncated {
			cut += "\n\n_(truncated)_"
		}
		return Result{Markdown: cut, Truncated: truncated, Text: true}
	}
	return Fenced("text", s)
}

var backticks = regexp.MustCompile("`{3,}")

// Fenced wraps s in a code fence longer than any backtick run inside it, so
// the content cannot close the fence.
func Fenced(info, s string) Result {
	s = strings.TrimRight(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	cut, truncated := cutUTF8(s, Limit)
	fence := "```"
	for _, run := range backticks.FindAllString(cut, -1) {
		if len(run) >= len(fence) {
			fence = strings.Repeat("`", len(run)+1)
		}
	}
	md := fence + info + "\n" + cut + "\n" + fence
	if truncated {
		md += "\n\n_(truncated)_"
	}
	if _, err := markdown.Parse(md); err != nil {
		return describe("text that EM2 could not represent", len(s))
	}
	return Result{Markdown: md, Truncated: truncated, Text: true}
}

// cutUTF8 cuts s to at most n bytes on a rune boundary.
func cutUTF8(s string, n int) (string, bool) {
	if len(s) <= n {
		return s, false
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n], true
}

var (
	dropRe  = regexp.MustCompile(`(?is)<(script|style|noscript|template|svg|head)\b.*?</(script|style|noscript|template|svg|head)\s*>`)
	commRe  = regexp.MustCompile(`(?s)<!--.*?-->`)
	liRe    = regexp.MustCompile(`(?i)<li\b[^>]*>`)
	blockRe = regexp.MustCompile(`(?i)</?(p|div|br|h[1-6]|tr|table|section|article|header|footer|main|nav|aside|blockquote|pre|ul|ol|dl|dt|dd|hr|figure|figcaption)\b[^>]*>`)
	tagRe   = regexp.MustCompile(`(?s)<[^>]*>`)
	spaceRe = regexp.MustCompile(`[ \t\f\v]+`)
	nlRe    = regexp.MustCompile(`\n[ \t]*\n(?:[ \t]*\n)+`)
)

// HTMLToText extracts readable text from an HTML page: scripts, styles and
// comments are dropped, block elements become line breaks, list items become
// "- " lines, and entities are decoded.
func HTMLToText(s string) string {
	s = commRe.ReplaceAllString(s, " ")
	s = dropRe.ReplaceAllString(s, " ")
	s = liRe.ReplaceAllString(s, "\n- ")
	s = blockRe.ReplaceAllString(s, "\n")
	s = tagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimSpace(spaceRe.ReplaceAllString(l, " "))
	}
	s = strings.Join(lines, "\n")
	s = nlRe.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}
