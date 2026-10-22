# EM2 container image: static binary on distroless, non-root, no shell.
# Build from the repository root:  docker build -f deploy/Dockerfile -t em2 .
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY core ./core
COPY kernel ./kernel
COPY pkg ./pkg
COPY internal ./internal
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/em2 ./cmd/em2

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/em2 /em2
USER nonroot:nonroot
EXPOSE 8080 9090
ENTRYPOINT ["/em2"]
CMD ["serve"]
