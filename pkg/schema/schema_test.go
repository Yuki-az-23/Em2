package schema

import (
	"encoding/json"
	"strings"
	"testing"
)

func register() *Schema {
	return Object(
		Req("email", Email()),
		Req("password", String().Len(12, 256)),
		Req("handle", String().Match(`[a-z][a-z0-9_]{2,31}`)),
		Opt("tags", Array(Enum("a", "b")).Count(0, 2)),
		Opt("age", Integer().Range(0, 150)),
	)
}

func TestValidDocumentPasses(t *testing.T) {
	errs := register().ValidateJSON([]byte(`{"email":"a@example.org","password":"correct horse battery","handle":"alice","tags":["a"],"age":30}`))
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
}

func TestReportsEachProblemWithPointer(t *testing.T) {
	errs := register().ValidateJSON([]byte(`{"email":"nope","password":"short","handle":"Alice","extra":1,"tags":["a","c","b"],"age":1.5}`))
	got := map[string]string{}
	for _, e := range errs {
		got[e.Pointer] = e.Detail
	}
	for _, ptr := range []string{"/email", "/password", "/handle", "/extra", "/tags", "/age"} {
		if _, ok := got[ptr]; !ok {
			t.Errorf("missing error for %s; got %v", ptr, errs)
		}
	}
}

func TestMissingRequiredAndWrongTypes(t *testing.T) {
	errs := register().ValidateJSON([]byte(`{"email":5}`))
	want := []string{"/email", "/password", "/handle"}
	for _, w := range want {
		found := false
		for _, e := range errs {
			if e.Pointer == w {
				found = true
			}
		}
		if !found {
			t.Errorf("missing %s in %v", w, errs)
		}
	}
}

func TestErrorsNeverEchoInput(t *testing.T) {
	secret := "s3cr3t-value-that-must-not-leak"
	errs := register().ValidateJSON([]byte(`{"email":"` + secret + `","password":"x","handle":"` + secret + `"}`))
	if strings.Contains(errs.Error(), secret) {
		t.Fatalf("error text echoes input: %s", errs.Error())
	}
}

func TestSyntaxErrorAndTrailingData(t *testing.T) {
	if e := register().ValidateJSON([]byte(`{`)); len(e) != 1 || e[0].Pointer != "" {
		t.Fatalf("got %v", e)
	}
	if e := register().ValidateJSON([]byte(`{} {}`)); len(e) != 1 {
		t.Fatalf("got %v", e)
	}
}

func TestNullHandling(t *testing.T) {
	s := Object(Opt("x", String().OrNull()), Opt("y", String()))
	if e := s.ValidateJSON([]byte(`{"x":null}`)); len(e) != 0 {
		t.Fatalf("nullable rejected: %v", e)
	}
	if e := s.ValidateJSON([]byte(`{"y":null}`)); len(e) != 1 {
		t.Fatalf("null accepted for non-nullable: %v", e)
	}
}

func TestFormats(t *testing.T) {
	cases := []struct {
		s    *Schema
		in   string
		good bool
	}{
		{UUID(), "6f1c9a3e-2b7d-4c1a-9e8f-0a1b2c3d4e5f", true},
		{UUID(), "6F1C9A3E-2B7D-4C1A-9E8F-0A1B2C3D4E5F", false},
		{UUID(), "../etc/passwd", false},
		{Email(), "a@b.org", true},
		{Email(), "Alice <a@b.org>", false},
		{Email(), "a@localhost", false},
		{DateTime(), "2026-10-10T12:00:00Z", true},
		{DateTime(), "yesterday", false},
	}
	for _, c := range cases {
		if got := c.s.ValidString(c.in); got != c.good {
			t.Errorf("%s %q: got %v want %v", c.s.Format, c.in, got, c.good)
		}
	}
}

func TestErrorCountIsCapped(t *testing.T) {
	s := Object()
	m := map[string]int{}
	for i := 0; i < 100; i++ {
		m[strings.Repeat("k", i+1)] = i
	}
	b, _ := json.Marshal(m)
	if n := len(s.ValidateJSON(b)); n > maxErrors {
		t.Fatalf("got %d errors, cap is %d", n, maxErrors)
	}
}

func TestMarshalEmitsClosedObjects(t *testing.T) {
	b, err := json.Marshal(Object(Req("a", String())))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"additionalProperties":false`) || !strings.Contains(string(b), `"required":["a"]`) {
		t.Fatalf("got %s", b)
	}
}
