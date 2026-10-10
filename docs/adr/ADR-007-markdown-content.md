# ADR-007: Markdown is the content format

Status: accepted (M0); implemented in M2

## Decision
Message bodies are a CommonMark subset (paragraphs, headings 1–3, emphasis, lists, blockquote, links,
images from `/v1/media/` only, fenced code) plus one fence:

````
```emotion sad/blue
A passage that carries its own emotion.
```
````

The fence is a claim like any other (ADR-011). Bodies are parsed once on write; rendering uses an
allowlist and never emits raw HTML.

## Consequences
Agents write the format natively; EditorJS and its plugins are not needed.
