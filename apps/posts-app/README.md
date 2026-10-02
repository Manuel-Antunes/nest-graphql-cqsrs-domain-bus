# @nestposts/posts-app

The blog's posts as an **MCP App**: a React application that [Apollo MCP Server](https://www.apollographql.com/docs/apollo-mcp-server/mcp-apps)
serves natively, from `apps/mcp/apps/posts`, as the `ui://widget/posts#<hash>` resource of five
tools. A host renders it in a sandboxed iframe on the result of the tool the model called, and the
person acts there: picks a post, edits it with a live preview, approves a draft before it is
published. In this platform the host is the web's `/theo` (CopilotKit), and the app reaches it inside
an **A2UI** surface the posts agent answers with — see "How it gets on screen" below.

| tool | opens on | what the person does there | scope |
|---|---|---|---|
| `ChoosePostToEdit` | `/posts` — their posts, newest first | filters, picks one; the editor opens | `read:posts` |
| `EditPost` | `/posts/:id` — the editor, with a Preview tab | changes title and content, saves | `read:posts` |
| `PreviewPost` | `/preview` — the post exactly as the blog shows it, and for a change the current version beside it | publishes or applies, adjusts the text, discards | `read:posts` |
| `SavePost` | — | the editor's and the preview's Save/Apply button | `write:posts` |
| `PublishPost` | — | the preview's Publish button | `write:posts` |

## Shape

It follows `tmp/creditor-graph`, the app this one was modelled on:

- **An operation with `@tool` is a tool.** The documents live next to the hook that runs them
  (`features/*/hooks`), written with codegen's `gql()` (`codegen.ts`, `gqlTagName: 'gql'` — the
  `@apollo/client-ai-apps` Vite plugin only plucks files that say `gql`), and the plugin writes the
  manifest Apollo MCP Server reads (`apps/mcp/apps/posts/.application-manifest.json`) and the single
  HTML file beside it. The operation is validated against the gateway's composed API schema at build
  time, so an operation the gateway cannot run fails the build, not a conversation. `mcp-apps.graphql`
  declares the directives for codegen; they never reach the gateway.
- **The tool decides the screen, through a router.** `routes/routes.tsx` is the route table as data
  and `Openings` maps the tool the host opened the app with to its first entry — typed by
  `mcp/tool-registration.d.ts`, so a tool without an opening does not compile. Picking a post is a
  navigation, so "opened by the model" and "chosen by the person" are the same route.
- **The first render costs no round trip.** `useHydratedVariables` takes the tool's input, and the
  tool's result is already in the cache when `ApolloProvider` stops suspending.
- **Queries go through `execute`, mutations through their own tool.** The stock `ToolCallLink` runs
  every operation through Apollo MCP Server's `execute` tool, which under `mutation_mode: explicit`
  refuses a mutation. `ServerToolLink` (`graphql/server-tool.link.ts`) sends an operation the manifest
  declares as a mutation tool to that tool by name (`app.callServerTool`) and hands its
  `structuredContent.result` back to Apollo Client, so `useMutation` and the normalized cache work as
  anywhere else, and a GraphQL refusal is the mutation's `error`.
- **The conversation hears what the person did.** After a save, a publish or a discard the app sends
  the host a `ui/message` in the person's name, with CopilotKit's `followUp: false`: it is added to the
  conversation and runs nothing.
- **The host's theme** (`hostContext.theme`) toggles `.dark`; the styles are `libs/ui`'s theme without
  its web fonts, which a single-file bundle would carry as base64.

## How it gets on screen

1. Apollo MCP Server publishes the app's tools and resource only to a request whose URL says
   `?app=posts&appTarget=mcp` (`appTarget`, because a stateless server cannot remember the UI
   capability a client declared at `initialize`). AgentCore Runtime forwards neither a query string
   nor a sub-path to the container, so `apps/mcp`'s image puts Caddy in front of the server and turns
   the `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App` header into those two parameters. A client
   sends both (`McpAppEndpoint` in `libs/ai`, `McpAppServer` in the web).
2. The posts agent opens it: `PostsMcpApps` lists the app-mode tools and offers the model the ones
   that open the app (its queries), and only on a turn whose A2A client renders A2UI.
3. The tool's result becomes an A2UI v0.9 surface whose root is an `McpApp` component naming the
   server, the resource, the tool, its input and its result — never the HTML — on the catalog the
   client declared. It travels back over A2A as `application/json+a2ui` parts, and Theo hands it to
   the web as `a2ui_operations`, which CopilotKit's A2UI middleware renders.
4. The web's catalog renders `McpApp` with CopilotKit's own MCP Apps host (`MCPAppsActivityRenderer`):
   it reads the resource and forwards the app's `tools/call` through `/api/copilotkit`, where
   `McpAppsProxy` reaches the MCP server with a token issued for the person.

`libs/ai/README.md` ("MCP Apps in A2UI") has the agent side, `apps/web/README.md` the host.

## Commands

```bash
npx nx build @nestposts/posts-app      # codegen, then vite build into apps/mcp/apps/posts
npx nx test @nestposts/posts-app
npx nx serve @nestposts/mcp            # builds it first: the MCP server's prune depends on it
```

## Testing

The specs render the real app under `MockedProvider` and fake only what the host provides
(`useToolInfo`, `useApp`, `useHostContext`). `server-tool.link.spec.ts` runs mutations through the
link with a stand-in for the host's `callServerTool`.

`@apollo/client-ai-apps` 0.7.5 publishes a module that imports `./internal/useApolloClient` without
its extension: Node refuses it, Vite does not. `vitest.config.mts` inlines the package so Vite
resolves it in tests, as the build does.
