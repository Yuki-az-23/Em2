package markdown

import (
	"regexp"
	"strings"
	"testing"

	"em2.social/em2/core"
)

func md(t testing.TB, src string) (string, *Doc) {
	t.Helper()
	d, err := Parse(src)
	if err != nil {
		t.Fatalf("parse %q: %v", src, err)
	}
	return HTML(d.Root), d
}

func TestGolden(t *testing.T) {
	cases := []struct{ in, want string }{
		{"hello", "<p>hello</p>"},
		{"# Title\n\ntext", "<h1>Title</h1>\n<p>text</p>"},
		{"#### deep", "<h3>deep</h3>"},
		{"a *b* **c** _d_ __e__", "<p>a <em>b</em> <strong>c</strong> <em>d</em> <strong>e</strong></p>"},
		{"snake_case_name", "<p>snake_case_name</p>"},
		{"use `x < y`", "<p>use <code>x &lt; y</code></p>"},
		{"- one\n- two", "<ul><li>one</li><li>two</li></ul>"},
		{"1. one\n2. two", "<ol><li>one</li><li>two</li></ol>"},
		{"> quoted\n> more", "<blockquote><p>quoted<br>\nmore</p></blockquote>"},
		{"```go\nfmt.Println(\"<hi>\")\n```", "<pre><code class=\"language-go\">fmt.Println(&#34;&lt;hi&gt;&#34;)</code></pre>"},
		{"---", "<hr>"},
		{"[site](https://example.org/a?b=1&c=2)", `<p><a href="https://example.org/a?b=1&amp;c=2" rel="nofollow noopener noreferrer ugc">site</a></p>`},
		{"[home](/v1/messages)", `<p><a href="/v1/messages" rel="nofollow noopener noreferrer ugc">home</a></p>`},
		{"![cat](/v1/media/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f)", `<p><img src="/v1/media/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f" alt="cat" loading="lazy"></p>`},
		{"\\*not em\\*", "<p>*not em*</p>"},
		{"```emotion sad/blue\nI feel *low*.\n```", `<section class="em2-emotion" data-emotion="sad" data-color="blue"><p>I feel <em>low</em>.</p></section>`},
		{"```emotion Sad/blue\nx\n```", `<pre><code class="language-emotion">x</code></pre>`},
	}
	for _, c := range cases {
		if got, _ := md(t, c.in); got != c.want {
			t.Errorf("%q\n got: %s\nwant: %s", c.in, got, c.want)
		}
	}
}

func TestEmotionFencesAreClaims(t *testing.T) {
	_, d := md(t, "```emotion joy/yellow\na\n```\n\n```emotion angry/red\nb\n```\n\n```emotion nope/red\nc\n```")
	want := []core.EC{{Emotion: core.Joy, Color: core.Yellow}, {Emotion: core.Angry, Color: core.Red}}
	if len(d.Claims) != 2 || d.Claims[0] != want[0] || d.Claims[1] != want[1] {
		t.Fatalf("claims = %v", d.Claims)
	}
}

func TestLinksAndImagesCollected(t *testing.T) {
	_, d := md(t, "[a](https://a.example) [a again](https://a.example) [b](http://b.example) [local](/x) [mail](mailto:x@y.org) ![i](/v1/media/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f)")
	if strings.Join(d.Links, " ") != "https://a.example http://b.example" {
		t.Fatalf("links = %v", d.Links)
	}
	if len(d.Images) != 1 {
		t.Fatalf("images = %v", d.Images)
	}
}

func TestLimits(t *testing.T) {
	if _, err := Parse(strings.Repeat("a", MaxBytes+1)); err != ErrTooLong {
		t.Fatalf("got %v", err)
	}
	if _, err := Parse("\xff\xfe"); err != ErrInvalidUTF8 {
		t.Fatalf("got %v", err)
	}
	if _, err := Parse(strings.Repeat("*a* ", 4900)); err != ErrTooComplex {
		t.Fatalf("got %v", err)
	}
	// Deep nesting terminates and stays bounded.
	if _, err := Parse(strings.Repeat("[", 5000) + strings.Repeat("]", 5000)); err != nil && err != ErrTooComplex {
		t.Fatal(err)
	}
	if _, err := Parse(strings.Repeat("> ", 500) + "x"); err != nil {
		t.Fatal(err)
	}
}

var (
	tagRe     = regexp.MustCompile(`<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>`)
	attrRe    = regexp.MustCompile(`\s([a-zA-Z-]+)="([^"]*)"`)
	allowTags = map[string]map[string]bool{
		"p": {}, "h1": {}, "h2": {}, "h3": {}, "ul": {}, "ol": {}, "li": {}, "blockquote": {}, "pre": {}, "hr": {}, "strong": {}, "em": {}, "br": {},
		"code":    {"class": true},
		"a":       {"href": true, "rel": true},
		"img":     {"src": true, "alt": true, "loading": true},
		"section": {"class": true, "data-emotion": true, "data-color": true},
	}
	mediaSrc = regexp.MustCompile(`^/v1/media/[0-9a-f-]{36}$`)
)

// assertSafe checks rendered HTML against the allowlist: only known tags,
// only known attributes, safe link targets and media-only images.
func assertSafe(t testing.TB, src, out string) {
	t.Helper()
	for _, m := range tagRe.FindAllStringSubmatch(out, -1) {
		attrs, ok := allowTags[strings.ToLower(m[2])]
		if !ok {
			t.Fatalf("input %q produced tag <%s>: %s", src, m[2], out)
		}
		rest := attrRe.ReplaceAllStringFunc(m[3], func(a string) string {
			am := attrRe.FindStringSubmatch(a)
			name, val := strings.ToLower(am[1]), am[2]
			if !attrs[name] {
				t.Fatalf("input %q produced attribute %s on <%s>: %s", src, name, m[2], out)
			}
			if name == "href" {
				l := strings.ToLower(val)
				if !(strings.HasPrefix(l, "https://") || strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "mailto:") || (strings.HasPrefix(l, "/") && !strings.HasPrefix(l, "//"))) {
					t.Fatalf("input %q produced href %q", src, val)
				}
			}
			if name == "src" && !mediaSrc.MatchString(val) {
				t.Fatalf("input %q produced img src %q", src, val)
			}
			return ""
		})
		if strings.TrimSpace(strings.TrimSuffix(rest, "/")) != "" {
			t.Fatalf("input %q left unparsed attribute text %q in %s", src, rest, out)
		}
	}
	if strings.Contains(strings.ToLower(out), "<script") {
		t.Fatalf("input %q produced a script tag", src)
	}
}

var xss = []string{
	"<script>alert(1)</script>",
	"<img src=x onerror=alert(1)>",
	"<a href=\"javascript:alert(1)\">x</a>",
	"[x](javascript:alert(1))",
	"[x](JaVaScRiPt:alert(1))",
	"[x]( javascript:alert(1))",
	"[x](java\tscript:alert(1))",
	"[x](vbscript:msgbox(1))",
	"[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
	"[x](//evil.example/a)",
	"[x](https://ok.example\" onmouseover=\"alert(1))",
	"[x](\\\\evil)",
	"![x](https://evil.example/a.png)",
	"![x](/v1/media/../../etc/passwd)",
	"![x\" onerror=\"alert(1)](/v1/media/6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f)",
	"```\"><script>alert(1)</script>\nx\n```",
	"```emotion joy/yellow\n<script>alert(1)</script>\n```",
	"```emotion joy\"><script>/yellow\nx\n```",
	"**<b onclick=alert(1)>x</b>**",
	"`</code><script>alert(1)</script>`",
	"[<img src=x onerror=alert(1)>](https://ok.example)",
	"<!-- --><svg onload=alert(1)>",
	"&lt;script&gt;",
	"[x](https://ok.example/ )",
}

func TestXSSCorpusRendersSafely(t *testing.T) {
	for _, src := range xss {
		out, _ := md(t, src)
		assertSafe(t, src, out)
	}
}

func FuzzRenderIsSafe(f *testing.F) {
	for _, s := range xss {
		f.Add(s)
	}
	f.Add("# a\n\n- *b* [c](https://d.example)\n\n> ```emotion sad/blue\n> e\n> ```")
	f.Fuzz(func(t *testing.T, src string) {
		d, err := Parse(src)
		if err != nil {
			return
		}
		assertSafe(t, src, HTML(d.Root))
	})
}
