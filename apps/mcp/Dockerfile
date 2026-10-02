# syntax=docker/dockerfile:1
#
# Built from the workspace root, like every other image here, after `nx run @nestposts/mcp:prune`
# has copied the gateway's composed API schema into apps/mcp/schema and built the posts MCP App
# into apps/mcp/apps:
#   nx docker:build @nestposts/mcp
#   docker build --platform linux/arm64 -f apps/mcp/Dockerfile -t nestposts/mcp:dev .
#
# Apollo's binary, from Apollo's own image, behind Caddy. AgentCore Runtime calls POST /mcp on
# port 8000 of 0.0.0.0 and forwards neither the query string nor a sub-path, while Apollo MCP
# Server only serves an MCP App to a request whose URL says `?app=<name>&appTarget=mcp`. The one
# thing AgentCore does forward is an allowlisted X-Amzn-Bedrock-AgentCore-Runtime-Custom-* header,
# so Caddy (config/Caddyfile) turns X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App into those two
# parameters and proxies to Apollo on 127.0.0.1:8001. A request without the header reaches Apollo
# unchanged: the six operations, as before.
#
# The base is distroless/cc's debug variant: the glibc and CA certificates Apollo's image runs on,
# plus a busybox shell to start two processes. Apollo runs in the foreground, so the container
# stops when it does.

ARG APOLLO_MCP_SERVER_VERSION=v1.20.0
ARG CADDY_VERSION=2.10

FROM ghcr.io/apollographql/apollo-mcp-server:${APOLLO_MCP_SERVER_VERSION} AS apollo
FROM caddy:${CADDY_VERSION} AS caddy

FROM gcr.io/distroless/cc-debian12:debug
COPY --from=apollo /usr/local/bin/apollo-mcp-server /usr/local/bin/apollo-mcp-server
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
WORKDIR /data
ENV POSTS_MCP_ADDRESS=127.0.0.1 \
    POSTS_MCP_PORT=8001 \
    XDG_CONFIG_HOME=/tmp \
    XDG_DATA_HOME=/tmp
COPY apps/mcp/config /data/config
COPY apps/mcp/operations /data/operations
COPY apps/mcp/schema /data/schema
COPY apps/mcp/apps /data/apps
EXPOSE 8000
ENTRYPOINT ["/busybox/sh", "-c", "caddy run --config config/Caddyfile --adapter caddyfile & exec apollo-mcp-server config/mcp.yaml"]
