# ADR-009: The egress proxy does not intercept TLS

Status: accepted (M0); implemented in M3

## Decision
For `CONNECT` tunnels EM2 journals only metadata (host, port, bytes, timing). Content-level scoring
of fetched content requires the explicit `POST /v1/egress/fetch` API or plain HTTP. EM2 never
installs or asks agents to trust its own certificate authority.

## Consequences
EM2 cannot see inside HTTPS it only tunnels. That is deliberate: a man-in-the-middle certificate
would make EM2 a high-value target and would break the trust it exists to protect.
