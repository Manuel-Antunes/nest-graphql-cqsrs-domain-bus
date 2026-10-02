# syntax=docker/dockerfile:1
#
# Built from the workspace root, like every other image here, after `nx run @nestposts/mcp:prune`
# has copied the gateway's composed API schema into apps/mcp/schema:
#   nx docker:build @nestposts/mcp
#   docker build --platform linux/arm64 -f apps/mcp/Dockerfile -t nestposts/mcp:dev .
#
# Apollo's own image, multi-arch, distroless: its entrypoint is the server and its working
# directory /data, so the config's relative paths resolve there. AgentCore Runtime runs arm64
# only and calls POST /mcp on port 8000 of 0.0.0.0, which the config binds through POSTS_MCP_ADDRESS.

ARG APOLLO_MCP_SERVER_VERSION=v1.20.0

FROM ghcr.io/apollographql/apollo-mcp-server:${APOLLO_MCP_SERVER_VERSION}
ENV POSTS_MCP_ADDRESS=0.0.0.0
COPY apps/mcp/config /data/config
COPY apps/mcp/operations /data/operations
COPY apps/mcp/schema /data/schema
EXPOSE 8000
CMD ["config/mcp.yaml"]
