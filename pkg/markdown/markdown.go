// Package markdown parses EM2's Markdown subset (ADR-007) into an AST and
// renders it to safe HTML.
//
// Supported: paragraphs, headings (# to ###; deeper levels render as 3),
// emphasis (*em*, _em_, **strong**, __strong__), inline code, links,
// images that point at /v1/media/<id>, bullet and numbered lists, block
// quotes, fenced code, thematic breaks, and one extension:
//
//	```emotion sad/blue
//	A passage that claims its own emotion.
//	```
//
// Raw HTML is never passed through: it is text. Links keep only http, https,
// mailto and same-site paths. An emotion fence is a claim made by the author;
// it is collected in Doc.Claims and is never trusted (ADR-011).
package markdown

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"em2.social/em2/core"
)

// MaxBytes is the largest body Parse accepts.
const MaxBytes = 20000

const (
	maxNodes       = 5000
	maxInlineDepth = 8
	maxQuoteDepth  = 3
)

// Node is one AST node. The tree is JSON-serialisable and stored alongside
// the source so readers never need to re-parse.
type Node struct {
	Type     string  `json:"type"` // doc heading paragraph list item quote code emotion hr text strong em codespan link image
	Level    int     `json:"level,omitempty"`
	Ordered  bool    `json:"ordered,omitempty"`
	Lang     string  `json:"lang,omitempty"`
	Text     string  `json:"text,omitempty"`
	Href     string  `json:"href,omitempty"`
	Emotion  string  `json:"emotion,omitempty"`
	Color    string  `json:"color,omitempty"`
	Children []*Node `json:"children,omitempty"`
}

// Doc is a parsed body.
type Doc struct {
	Root   *Node     `json:"root"`
	Claims []core.EC `json:"-"` // emotion fences, in order; untrusted
	Links  []string  `json:"-"` // distinct external (http/https) link targets
	Images []string  `json:"-"` // media paths referenced
}

// Errors returned by Parse.
var (
	ErrTooLong     = errors.New("markdown: body exceeds 20000 bytes")
	ErrInvalidUTF8 = errors.New("markdown: body is not valid UTF-8")
	ErrTooComplex  = errors.New("markdown: body has too many elements")
)

type parser struct {
	nodes  int
	claims []core.EC
	links  map[string]bool
	order  []string
	images []string
}

func (p *parser) node(n *Node) *Node {
	p.nodes++
	return n
}

// Parse parses src.
func Parse(src string) (*Doc, error) {
	if len(src) > MaxBytes {
		return nil, ErrTooLong
	}
	if !utf8.ValidString(src) {
		return nil, ErrInvalidUTF8
	}
	src = strings.ReplaceAll(strings.ReplaceAll(src, "\r\n", "\n"), "\r", "\n")
	src = strings.ReplaceAll(src, "\x00", "�")
	p := &parser{links: map[string]bool{}}
	root := &Node{Type: "doc", Children: p.blocks(strings.Split(src, "\n"), 0)}
	if p.nodes > maxNodes {
		return nil, ErrTooComplex
	}
	return &Doc{Root: root, Claims: p.claims, Links: p.order, Images: p.images}, nil
}

var (
	headingRe = regexp.MustCompile(`^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$`)
	bulletRe  = regexp.MustCompile(`^ {0,3}[-*+][ \t]+(.*)$`)
	orderedRe = regexp.MustCompile(`^ {0,3}[0-9]{1,9}[.)][ \t]+(.*)$`)
	hrRe      = regexp.MustCompile(`^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$`)
	fenceRe   = regexp.MustCompile("^ {0,3}(```+)[ \t]*([^`]*)$")
	quoteRe   = regexp.MustCompile(`^ {0,3}>[ ]?(.*)$`)
	langRe    = regexp.MustCompile(`^[a-z0-9+#-]{1,20}$`)
)

func blank(s string) bool { return strings.TrimSpace(s) == "" }

func startsBlock(line string) bool {
	return headingRe.MatchString(line) || fenceRe.MatchString(line) || quoteRe.MatchString(line) ||
		bulletRe.MatchString(line) || orderedRe.MatchString(line) || hrRe.MatchString(line)
}

func (p *parser) blocks(lines []string, quoteDepth int) []*Node {
	var out []*Node
	for i := 0; i < len(lines) && p.nodes <= maxNodes; {
		line := lines[i]
		switch {
		case blank(line):
			i++

		case fenceRe.MatchString(line):
			m := fenceRe.FindStringSubmatch(line)
			ticks, info := m[1], strings.TrimSpace(m[2])
			j := i + 1
			var body []string
			for ; j < len(lines); j++ {
				t := strings.TrimSpace(lines[j])
				if strings.HasPrefix(t, ticks) && strings.Trim(t, "`") == "" {
					break
				}
				body = append(body, lines[j])
			}
			out = append(out, p.fence(info, body))
			i = j + 1

		case headingRe.MatchString(line):
			m := headingRe.FindStringSubmatch(line)
			level := len(m[1])
			if level > 3 {
				level = 3
			}
			out = append(out, p.node(&Node{Type: "heading", Level: level, Children: p.inline(m[2], 0)}))
			i++

		case hrRe.MatchString(line):
			out = append(out, p.node(&Node{Type: "hr"}))
			i++

		case quoteRe.MatchString(line):
			var inner []string
			for ; i < len(lines) && quoteRe.MatchString(lines[i]); i++ {
				inner = append(inner, quoteRe.FindStringSubmatch(lines[i])[1])
			}
			q := p.node(&Node{Type: "quote"})
			if quoteDepth >= maxQuoteDepth {
				q.Children = []*Node{p.node(&Node{Type: "paragraph", Children: p.inline(strings.Join(inner, "\n"), 0)})}
			} else {
				q.Children = p.blocks(inner, quoteDepth+1)
			}
			out = append(out, q)

		case bulletRe.MatchString(line) || orderedRe.MatchString(line):
			ordered := orderedRe.MatchString(line)
			re := bulletRe
			if ordered {
				re = orderedRe
			}
			list := p.node(&Node{Type: "list", Ordered: ordered})
			for i < len(lines) && re.MatchString(lines[i]) {
				text := []string{re.FindStringSubmatch(lines[i])[1]}
				i++
				// Indented continuation lines belong to the item.
				for i < len(lines) && !blank(lines[i]) && (strings.HasPrefix(lines[i], "  ") || strings.HasPrefix(lines[i], "\t")) && !re.MatchString(lines[i]) {
					text = append(text, strings.TrimSpace(lines[i]))
					i++
				}
				list.Children = append(list.Children, p.node(&Node{Type: "item", Children: p.inline(strings.Join(text, "\n"), 0)}))
			}
			out = append(out, list)

		default:
			var para []string
			for i < len(lines) && !blank(lines[i]) && (len(para) == 0 || !startsBlock(lines[i])) {
				para = append(para, strings.TrimSpace(lines[i]))
				i++
			}
			out = append(out, p.node(&Node{Type: "paragraph", Children: p.inline(strings.Join(para, "\n"), 0)}))
		}
	}
	return out
}

// fence builds a code block, or an emotion block when the info string is
// "emotion <emotion>/<color>" with valid wheel names.
func (p *parser) fence(info string, body []string) *Node {
	fields := strings.Fields(info)
	if len(fields) == 2 && fields[0] == "emotion" {
		if e, c, ok := strings.Cut(fields[1], "/"); ok {
			em, err1 := core.ParseEmotion(e)
			co, err2 := core.ParseColor(c)
			if err1 == nil && err2 == nil {
				p.claims = append(p.claims, core.EC{Emotion: em, Color: co})
				inner := p.blocks(body, maxQuoteDepth) // no nested quotes inside an emotion block
				return p.node(&Node{Type: "emotion", Emotion: e, Color: c, Children: inner})
			}
		}
	}
	lang := ""
	if len(fields) > 0 && langRe.MatchString(strings.ToLower(fields[0])) {
		lang = strings.ToLower(fields[0])
	}
	return p.node(&Node{Type: "code", Lang: lang, Text: strings.Join(body, "\n")})
}

var mediaPathRe = regexp.MustCompile(`^/v1/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// safeHref returns the link target if it is http(s), mailto or a same-site
// path, and whether it is external.
func safeHref(raw string) (href string, external, ok bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2048 {
		return "", false, false
	}
	for _, r := range raw {
		if r < 0x20 || r == 0x7f || r == ' ' || r == '\\' {
			return "", false, false
		}
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		return raw, false, true
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", false, false
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		if u.Host == "" {
			return "", false, false
		}
		return u.String(), true, true
	case "mailto":
		return u.String(), false, true
	}
	return "", false, false
}

func (p *parser) text(s string) *Node { return p.node(&Node{Type: "text", Text: s}) }

// inline parses emphasis, code spans, links and images.
func (p *parser) inline(s string, depth int) []*Node {
	var out []*Node
	var buf strings.Builder
	flush := func() {
		if buf.Len() > 0 {
			out = append(out, p.text(buf.String()))
			buf.Reset()
		}
	}
	for i := 0; i < len(s); {
		if p.nodes > maxNodes {
			break
		}
		c := s[i]
		switch {
		case c == '\\' && i+1 < len(s) && strings.IndexByte("\\`*_[]()#+-.!>~|", s[i+1]) >= 0:
			buf.WriteByte(s[i+1])
			i += 2
			continue

		case c == '`':
			n := 0
			for i+n < len(s) && s[i+n] == '`' {
				n++
			}
			ticks := s[i : i+n]
			if end := strings.Index(s[i+n:], ticks); end >= 0 {
				flush()
				code := s[i+n : i+n+end]
				if len(code) >= 2 && code[0] == ' ' && code[len(code)-1] == ' ' {
					code = code[1 : len(code)-1]
				}
				out = append(out, p.node(&Node{Type: "codespan", Text: code}))
				i += n + end + n
				continue
			}
			buf.WriteString(ticks)
			i += n
			continue

		case c == '!' && i+1 < len(s) && s[i+1] == '[':
			if label, target, next, ok := linkAt(s, i+1); ok {
				flush()
				if mediaPathRe.MatchString(strings.TrimSpace(target)) {
					src := strings.TrimSpace(target)
					p.images = append(p.images, src)
					out = append(out, p.node(&Node{Type: "image", Href: src, Text: label}))
				} else {
					out = append(out, p.text(label)) // images only from EM2's media store
				}
				i = next
				continue
			}

		case c == '[':
			if label, target, next, ok := linkAt(s, i); ok {
				flush()
				var children []*Node
				if depth < maxInlineDepth {
					children = p.inline(label, depth+1)
				} else {
					children = []*Node{p.text(label)}
				}
				if href, external, ok := safeHref(target); ok {
					if external && !p.links[href] {
						p.links[href] = true
						p.order = append(p.order, href)
					}
					out = append(out, p.node(&Node{Type: "link", Href: href, Children: children}))
				} else {
					out = append(out, children...)
				}
				i = next
				continue
			}

		case (c == '*' || c == '_') && depth < maxInlineDepth:
			delim := string(c)
			typ := "em"
			if i+1 < len(s) && s[i+1] == c {
				delim, typ = delim+delim, "strong"
			}
			start := i + len(delim)
			if start < len(s) && s[start] != ' ' && s[start] != '\n' {
				if end := strings.Index(s[start:], delim); end > 0 && s[start+end-1] != ' ' {
					// Intraword underscores are literal (snake_case).
					if !(c == '_' && i > 0 && isWord(s[i-1])) {
						flush()
						out = append(out, p.node(&Node{Type: typ, Children: p.inline(s[start:start+end], depth+1)}))
						i = start + end + len(delim)
						continue
					}
				}
			}
			buf.WriteString(delim)
			i += len(delim)
			continue
		}
		buf.WriteByte(c)
		i++
	}
	flush()
	return out
}

func isWord(b byte) bool {
	return b == '_' || (b >= '0' && b <= '9') || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

// linkAt parses "[label](target)" starting at s[i] == '['.
func linkAt(s string, i int) (label, target string, next int, ok bool) {
	depth := 0
	j := i
	for ; j < len(s); j++ {
		switch s[j] {
		case '\\':
			j++
		case '[':
			depth++
		case ']':
			depth--
		}
		if depth == 0 {
			break
		}
	}
	if j >= len(s) || j+1 >= len(s) || s[j+1] != '(' {
		return "", "", 0, false
	}
	end := strings.IndexByte(s[j+2:], ')')
	if end < 0 {
		return "", "", 0, false
	}
	return s[i+1 : j], s[j+2 : j+2+end], j + 2 + end + 1, true
}
