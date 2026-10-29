package markdown

import (
	"html"
	"strconv"
	"strings"
)

// HTML renders a node tree. Every text and attribute value is escaped; only
// these tags are ever produced: p h1 h2 h3 ul ol li blockquote pre code hr
// strong em a img section br.
func HTML(n *Node) string {
	var b strings.Builder
	render(&b, n)
	return b.String()
}

func children(b *strings.Builder, n *Node) {
	for _, c := range n.Children {
		render(b, c)
	}
}

func render(b *strings.Builder, n *Node) {
	esc := html.EscapeString
	switch n.Type {
	case "doc":
		for i, c := range n.Children {
			if i > 0 {
				b.WriteByte('\n')
			}
			render(b, c)
		}
	case "heading":
		tag := "h" + strconv.Itoa(clamp(n.Level, 1, 3))
		b.WriteString("<" + tag + ">")
		children(b, n)
		b.WriteString("</" + tag + ">")
	case "paragraph":
		b.WriteString("<p>")
		children(b, n)
		b.WriteString("</p>")
	case "list":
		tag := "ul"
		if n.Ordered {
			tag = "ol"
		}
		b.WriteString("<" + tag + ">")
		children(b, n)
		b.WriteString("</" + tag + ">")
	case "item":
		b.WriteString("<li>")
		children(b, n)
		b.WriteString("</li>")
	case "quote":
		b.WriteString("<blockquote>")
		children(b, n)
		b.WriteString("</blockquote>")
	case "code":
		b.WriteString("<pre><code")
		if langRe.MatchString(n.Lang) {
			b.WriteString(` class="language-` + esc(n.Lang) + `"`)
		}
		b.WriteString(">" + esc(n.Text) + "</code></pre>")
	case "emotion":
		b.WriteString(`<section class="em2-emotion" data-emotion="` + esc(n.Emotion) + `" data-color="` + esc(n.Color) + `">`)
		children(b, n)
		b.WriteString("</section>")
	case "hr":
		b.WriteString("<hr>")
	case "text":
		b.WriteString(strings.ReplaceAll(esc(n.Text), "\n", "<br>\n"))
	case "strong":
		b.WriteString("<strong>")
		children(b, n)
		b.WriteString("</strong>")
	case "em":
		b.WriteString("<em>")
		children(b, n)
		b.WriteString("</em>")
	case "codespan":
		b.WriteString("<code>" + esc(n.Text) + "</code>")
	case "link":
		if href, _, ok := safeHref(n.Href); ok {
			b.WriteString(`<a href="` + esc(href) + `" rel="nofollow noopener noreferrer ugc">`)
			children(b, n)
			b.WriteString("</a>")
		} else {
			children(b, n)
		}
	case "image":
		if mediaPathRe.MatchString(n.Href) {
			b.WriteString(`<img src="` + esc(n.Href) + `" alt="` + esc(n.Text) + `" loading="lazy">`)
		} else {
			b.WriteString(esc(n.Text))
		}
	}
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
