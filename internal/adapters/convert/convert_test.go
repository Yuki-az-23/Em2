package convert

import (
	"strings"
	"testing"

	"em2.social/em2/pkg/markdown"
)

func TestJSONIsFencedAndCannotEscape(t *testing.T) {
	r := ToMarkdown("application/json; charset=utf-8", []byte(`{"a":"`+"```"+`\n# not a heading"}`))
	if !strings.HasPrefix(r.Markdown, "````json\n") || !r.Text {
		t.Fatalf("fence = %q", r.Markdown)
	}
	doc, err := markdown.Parse(r.Markdown)
	if err != nil {
		t.Fatal(err)
	}
	if h := markdown.HTML(doc.Root); strings.Contains(h, "<h1>") {
		t.Fatalf("content escaped the fence: %s", h)
	}
}

func TestHTMLBecomesText(t *testing.T) {
	page := `<html><head><title>x</title><script>alert(1)</script></head><body><!-- c --><h1>Title</h1>
		<p>Hello &amp; <b>welcome</b></p><ul><li>one</li><li>two</li></ul><style>p{}</style><p>&lt;script&gt;</p></body></html>`
	r := ToMarkdown("text/html", []byte(page))
	for _, bad := range []string{"alert", "p{}", "<b>", "x\n"} {
		if strings.Contains(r.Markdown, bad) {
			t.Fatalf("%q left in %q", bad, r.Markdown)
		}
	}
	for _, want := range []string{"Title", "Hello & welcome", "- one", "- two"} {
		if !strings.Contains(r.Markdown, want) {
			t.Fatalf("%q missing from %q", want, r.Markdown)
		}
	}
	doc, err := markdown.Parse(r.Markdown)
	if err != nil {
		t.Fatal(err)
	}
	if h := markdown.HTML(doc.Root); strings.Contains(h, "<script") {
		t.Fatalf("decoded entity became markup: %s", h)
	}
}

func TestLongAndBinaryBodies(t *testing.T) {
	r := ToMarkdown("text/plain", []byte(strings.Repeat("é", Limit)))
	if !r.Truncated || len(r.Markdown) > markdown.MaxBytes {
		t.Fatalf("truncated=%v len=%d", r.Truncated, len(r.Markdown))
	}
	if _, err := markdown.Parse(r.Markdown); err != nil {
		t.Fatal(err)
	}
	r = ToMarkdown("image/png", []byte{0x89, 'P', 'N', 'G', 0xff})
	if r.Text || !strings.Contains(r.Markdown, "image/png, 5 bytes") {
		t.Fatalf("binary: %+v", r)
	}
	if r := ToMarkdown("text/plain", []byte("  ")); r.Markdown == "" {
		t.Fatal("empty body produced no markdown")
	}
}

// Whatever arrives, the result parses, fits the limit and renders without
// markup from the input.
func FuzzToMarkdownIsValid(f *testing.F) {
	for _, s := range []string{`{"a":1}`, "```\n# x\n```", "<script>x</script>", "plain *text*", "\xff\xfe", "````emotion joy/yellow\nx\n````"} {
		for _, ct := range []string{"application/json", "text/plain", "text/html", "text/markdown", "text/csv"} {
			f.Add(ct, []byte(s))
		}
	}
	f.Fuzz(func(t *testing.T, ct string, body []byte) {
		r := ToMarkdown(ct, body)
		if len(r.Markdown) > markdown.MaxBytes {
			t.Fatalf("too long: %d", len(r.Markdown))
		}
		doc, err := markdown.Parse(r.Markdown)
		if err != nil {
			t.Fatalf("invalid markdown for %q: %v", ct, err)
		}
		h := strings.ToLower(markdown.HTML(doc.Root))
		for _, bad := range []string{"<script", "javascript:", " onerror=", "<iframe"} {
			if strings.Contains(h, bad) {
				t.Fatalf("unsafe output %q", h)
			}
		}
	})
}
