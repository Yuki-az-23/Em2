// Package schema is a small JSON Schema subset: enough to validate EM2
// request bodies, query strings and events, and to emit the same schema into
// the OpenAPI document. Supported keywords: type, properties, required,
// additionalProperties (false only), items, enum, minLength, maxLength,
// pattern, format (email, uuid, date-time), minimum, maximum, minItems,
// maxItems, nullable.
package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/mail"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Schema is a node in a schema tree. Construct with the helpers below.
type Schema struct {
	Type        string             `json:"type,omitempty"`
	Description string             `json:"description,omitempty"`
	Properties  map[string]*Schema `json:"properties,omitempty"`
	Required    []string           `json:"required,omitempty"`
	Closed      bool               `json:"-"` // additionalProperties: false
	Items       *Schema            `json:"items,omitempty"`
	Enum        []string           `json:"enum,omitempty"`
	MinLength   *int               `json:"minLength,omitempty"`
	MaxLength   *int               `json:"maxLength,omitempty"`
	Pattern     string             `json:"pattern,omitempty"`
	Format      string             `json:"format,omitempty"`
	Minimum     *float64           `json:"minimum,omitempty"`
	Maximum     *float64           `json:"maximum,omitempty"`
	MinItems    *int               `json:"minItems,omitempty"`
	MaxItems    *int               `json:"maxItems,omitempty"`
	Nullable    bool               `json:"nullable,omitempty"`

	re *regexp.Regexp
}

// MarshalJSON emits OpenAPI 3.1-compatible JSON Schema.
func (s *Schema) MarshalJSON() ([]byte, error) {
	type plain Schema
	b, err := json.Marshal((*plain)(s))
	if err != nil || !s.Closed {
		return b, err
	}
	// Append additionalProperties:false.
	if bytes.Equal(b, []byte("{}")) {
		return []byte(`{"additionalProperties":false}`), nil
	}
	return append(b[:len(b)-1], []byte(`,"additionalProperties":false}`)...), nil
}

// Prop is a named property used by Object.
type Prop struct {
	Name     string
	Schema   *Schema
	Required bool
}

// Req marks a required property.
func Req(name string, s *Schema) Prop { return Prop{Name: name, Schema: s, Required: true} }

// Opt marks an optional property.
func Opt(name string, s *Schema) Prop { return Prop{Name: name, Schema: s} }

// Object is a closed object (no unknown properties allowed).
func Object(props ...Prop) *Schema {
	s := &Schema{Type: "object", Properties: map[string]*Schema{}, Closed: true}
	for _, p := range props {
		s.Properties[p.Name] = p.Schema
		if p.Required {
			s.Required = append(s.Required, p.Name)
		}
	}
	return s
}

// OpenObject allows properties not listed.
func OpenObject(props ...Prop) *Schema {
	s := Object(props...)
	s.Closed = false
	return s
}

func String() *Schema  { return &Schema{Type: "string"} }
func Integer() *Schema { return &Schema{Type: "integer"} }
func Number() *Schema  { return &Schema{Type: "number"} }
func Boolean() *Schema { return &Schema{Type: "boolean"} }

// Array of items.
func Array(items *Schema) *Schema { return &Schema{Type: "array", Items: items} }

// Enum of strings.
func Enum(values ...string) *Schema { return &Schema{Type: "string", Enum: values} }

// UUID string.
func UUID() *Schema { return &Schema{Type: "string", Format: "uuid"} }

// Email string.
func Email() *Schema { return String().Len(3, 254).WithFormat("email") }

// DateTime string (RFC 3339).
func DateTime() *Schema { return &Schema{Type: "string", Format: "date-time"} }

// Len sets string length bounds in characters.
func (s *Schema) Len(min, max int) *Schema { s.MinLength, s.MaxLength = &min, &max; return s }

// Range sets numeric bounds.
func (s *Schema) Range(min, max float64) *Schema { s.Minimum, s.Maximum = &min, &max; return s }

// Count sets array length bounds.
func (s *Schema) Count(min, max int) *Schema { s.MinItems, s.MaxItems = &min, &max; return s }

// Match sets a regular expression the whole string must match.
func (s *Schema) Match(pattern string) *Schema {
	s.Pattern = pattern
	s.re = regexp.MustCompile("^(?:" + pattern + ")$")
	return s
}

// WithFormat sets a format keyword.
func (s *Schema) WithFormat(f string) *Schema { s.Format = f; return s }

// Doc sets a description.
func (s *Schema) Doc(d string) *Schema { s.Description = d; return s }

// OrNull allows JSON null.
func (s *Schema) OrNull() *Schema { s.Nullable = true; return s }

// FieldError is one validation failure. Pointer is an RFC 6901 JSON pointer
// into the input. Detail never echoes the input value.
type FieldError struct {
	Pointer string `json:"pointer"`
	Detail  string `json:"detail"`
}

// Errors is a list of field errors.
type Errors []FieldError

func (e Errors) Error() string {
	parts := make([]string, len(e))
	for i, fe := range e {
		parts[i] = fe.Pointer + ": " + fe.Detail
	}
	return strings.Join(parts, "; ")
}

// maxErrors caps how many problems are reported for one document.
const maxErrors = 20

// ValidateJSON decodes raw JSON and validates it. A syntax error is reported
// as a single error at the root.
func (s *Schema) ValidateJSON(raw []byte) Errors {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return Errors{{Pointer: "", Detail: "body is not valid JSON"}}
	}
	if dec.More() {
		return Errors{{Pointer: "", Detail: "body has trailing data"}}
	}
	return s.Validate(v)
}

// Validate checks an already-decoded value (decoded with UseNumber, or plain
// float64 numbers).
func (s *Schema) Validate(v any) Errors {
	var errs Errors
	s.validate(v, "", &errs)
	return errs
}

func (s *Schema) validate(v any, ptr string, errs *Errors) {
	if len(*errs) >= maxErrors {
		return
	}
	add := func(detail string) { push(errs, ptr, detail) }
	if v == nil {
		if !s.Nullable {
			add("must not be null")
		}
		return
	}
	switch s.Type {
	case "object":
		m, ok := v.(map[string]any)
		if !ok {
			add("must be an object")
			return
		}
		for _, r := range s.Required {
			if _, ok := m[r]; !ok {
				push(errs, ptr+"/"+escape(r), "is required")
			}
		}
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			child, known := s.Properties[k]
			if !known {
				if s.Closed {
					push(errs, ptr+"/"+escape(k), "is not an allowed property")
				}
				continue
			}
			child.validate(m[k], ptr+"/"+escape(k), errs)
		}
	case "array":
		a, ok := v.([]any)
		if !ok {
			add("must be an array")
			return
		}
		if s.MinItems != nil && len(a) < *s.MinItems {
			add(fmt.Sprintf("must have at least %d items", *s.MinItems))
		}
		if s.MaxItems != nil && len(a) > *s.MaxItems {
			add(fmt.Sprintf("must have at most %d items", *s.MaxItems))
			return
		}
		if s.Items != nil {
			for i, item := range a {
				s.Items.validate(item, ptr+"/"+strconv.Itoa(i), errs)
			}
		}
	case "string":
		str, ok := v.(string)
		if !ok {
			add("must be a string")
			return
		}
		s.validateString(str, add)
	case "integer", "number":
		f, ok := toFloat(v)
		if !ok {
			add("must be a " + s.Type)
			return
		}
		if s.Type == "integer" && f != math.Trunc(f) {
			add("must be an integer")
			return
		}
		if s.Minimum != nil && f < *s.Minimum {
			add(fmt.Sprintf("must be at least %v", *s.Minimum))
		}
		if s.Maximum != nil && f > *s.Maximum {
			add(fmt.Sprintf("must be at most %v", *s.Maximum))
		}
	case "boolean":
		if _, ok := v.(bool); !ok {
			add("must be a boolean")
		}
	}
}

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// ValidString validates a single string value against s (used for path and
// query parameters).
func (s *Schema) ValidString(str string) bool {
	ok := true
	s.validateString(str, func(string) { ok = false })
	return ok
}

func (s *Schema) validateString(str string, add func(string)) {
	n := utf8.RuneCountInString(str)
	if !utf8.ValidString(str) {
		add("must be valid UTF-8")
		return
	}
	if s.MinLength != nil && n < *s.MinLength {
		add(fmt.Sprintf("must be at least %d characters", *s.MinLength))
	}
	if s.MaxLength != nil && n > *s.MaxLength {
		add(fmt.Sprintf("must be at most %d characters", *s.MaxLength))
		return
	}
	if len(s.Enum) > 0 {
		found := false
		for _, e := range s.Enum {
			if e == str {
				found = true
				break
			}
		}
		if !found {
			add("must be one of: " + strings.Join(s.Enum, ", "))
		}
	}
	if s.Pattern != "" {
		re := s.re
		if re == nil {
			re = regexp.MustCompile("^(?:" + s.Pattern + ")$")
		}
		if !re.MatchString(str) {
			add("has an invalid format")
		}
	}
	switch s.Format {
	case "uuid":
		if !uuidRe.MatchString(str) {
			add("must be a lowercase UUID")
		}
	case "email":
		a, err := mail.ParseAddress(str)
		if err != nil || a.Address != str || !strings.Contains(str[strings.LastIndexByte(str, '@')+1:], ".") {
			add("must be an email address")
		}
	case "date-time":
		if _, err := time.Parse(time.RFC3339, str); err != nil {
			add("must be an RFC 3339 date-time")
		}
	}
}

// push appends an error unless the cap is reached.
func push(errs *Errors, ptr, detail string) {
	if len(*errs) < maxErrors {
		*errs = append(*errs, FieldError{Pointer: ptr, Detail: detail})
	}
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	return 0, false
}

func escape(k string) string {
	return strings.NewReplacer("~", "~0", "/", "~1").Replace(k)
}
