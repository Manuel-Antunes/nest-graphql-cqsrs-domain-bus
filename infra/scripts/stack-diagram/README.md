# stack-diagram

The deployed stack as a draw.io diagram in AWS's own icons. `pnpm graph:stack <stage>` writes it
beside the DOT (`.sst/graph/<stage>.drawio` and `.html`); on a DOT that already exists:

```bash
node infra/scripts/stack-diagram/main.mjs .sst/graph/dev.dot           # dev.drawio, dev.html
node infra/scripts/stack-diagram/main.mjs .sst/graph/dev.dot --types   # every type, and what it became
```

The `.html` opens in a browser as it is: it loads draw.io's viewer, with zoom, fit, full screen and
the layers. The `.drawio` is the editable canvas — the desktop app, app.diagrams.net, or VS Code's
`hediet.vscode-drawio`. Hovering anything shows its Pulumi type and URN; hovering an edge, the
properties the dependency goes through.

Nothing here knows an AWS service by name. What the diagram shows is decided by three rules, and
anything added to the stack later — SageMaker, a Bedrock agent, a component of our own — goes
through the same three. The one place that knows a framework is `conventions.mjs`, for what SST
does that the DOT cannot show (below).

## Groups are the component tree

A Pulumi resource that has children is a component (`sst:aws:Function`, `sst:aws:Nextjs`,
`nestposts:aws:NodeFunction`, …) and is drawn as a group; the resources under it are drawn inside
it, and so on down. That tree is exactly what the DOT's parent edges carry, so the grouping is the
stack's own and not a clustering algorithm's guess. A group whose resources are all hidden is not
drawn, and a child's name is shown without its parent's prefix (`PostsApiFunction` in `PostsApi` is
`Function`).

A group's icon is, in order:

1. the one `config.json` gives its type;
2. the icon of the child it wraps — the child whose type name ends its own (`NodeFunction` wraps a
   `Function`, `SnsTopic` a `Topic`, `Vpc` a `Vpc`);
3. the service icon of the module most of its children belong to (`Postgres` → `rds`, `Router` →
   `cloudfront`, `Nextjs` → `lambda`).

## A resource shows if draw.io has an icon for it

The catalog is draw.io's AWS palette itself, `Sidebar-AWS4.js`, read from draw.io's repository and
cached for a week in `node_modules/.cache/stack-diagram/`; offline, a stale cache is used. Every
entry has a title, search tags and a category, and that is what a Pulumi type is matched against:

- the type's **module** (`aws:lambda/function:Function` → `lambda`), with the aliases below, finds
  the entries of that service;
- the type's **name**, split into words (`EventSourceMapping` → `event source mapping`), ranks them:
  a name word the entry carries counts three, a module word one, and a word in the entry's title the
  type does not have costs one and a half;
- an entry that carries no module word is still a candidate when it has the type's last word and
  sits in the same category as the service (`sqs/queue` → *Queue*, `dynamodb/table` → *Table*).

When nothing names the resource, the service icon stands for it (`lambda/permission` → *Lambda*).
A type with no candidate at all is not drawn, and neither is a resource outside AWS — one whose
package is not `aws*` and whose module is not `aws` — unless `config.json` gives it an icon.

## Edges are Pulumi's dependencies

An edge goes from a resource to the one that depends on it, between drawn resources only, after a
transitive reduction: `A → C` is dropped when `A → B → C` is already drawn. A dependency through a
resource that is not drawn is not drawn either — SST's router records its routes in dynamic
resources, and those have no icon.

Inside a group, each dependency is an edge between the two resources. Between groups, the
dependencies are gathered into one link per pair of groups and per **property** the dependency goes
through — `eventSourceArn`, `topic`, `redrivePolicy`, `environment`, `inlinePolicies`, `vpcConfig` —
drawn between the groups' borders, labelled with the property, and listing every dependency it
stands for on hover. Each property is a layer of its own (*Between groups: environment*, …), so the
diagram can be read one concern at a time: switch everything off but `topic`, `endpoint`,
`eventSourceArn` and `redrivePolicy` and what is left is the messaging.

The layout is Graphviz for a group of resources — so the dependencies inside it are routed — and a
grid for a group of groups, packed towards 16:10 in an order that keeps the groups a link joins
next to each other. The links between the blocks of a grid are routed by Graphviz too, around the
blocks, with their positions fixed (`neato -n2`); orthogonally when its orthogonal router copes, as
straight segments when it does not — it aborts on some inputs, and a few pixels of slack is usually
what it needed.

## What SST does that the DOT cannot show (`conventions.mjs`)

Read off SST's own components (`.sst/platform/src/components/aws/`), and applied only to its types:

- **A subscriber that nobody placed is drawn with its queue.** SST creates `SnsTopicQueueSubscriber`
  and friends at the top of the stack, so on their own they are a group of their own, away from
  both ends. A top-level `sst:aws:*Subscriber` is drawn inside the queue it reads from or delivers
  to — so a queue's group holds the queue, the policy that lets SNS send to it and the topic's
  subscription — or, with no queue, inside the component it is named after (SST names every
  subscriber `<Source>Subscriber…`). A subscriber whose parent was given explicitly — `QueueWorker`
  subscribes with `parent: this` — stays where it was put.
- **A queue's event source mapping reads from that queue.** `Queue.subscribe` resolves the queue's
  ARN inside an `apply` before it builds the `QueueLambdaSubscriber`, so Pulumi records no dependency
  of the mapping's `eventSourceArn` on the queue, and the only queues the DOT ties it to are the
  ones it inherited through the function. The subscriber is named after its queue, and that
  dependency is put back, as `eventSourceArn`, and kept through the transitive reduction.

## `config.json`

```json
{
  "aliases": { "iam": "identity access management" },
  "types": { "sentry:index/sentryProject:SentryProject": "alert" },
  "hidden": ["aws:s3/bucketObjectv2:*"],
  "hiddenProperties": ["inlinePolicies", "vpcConfig"]
}
```

- **`aliases`** — words that stand for others, for a module or a name word draw.io spells out:
  `iam`, `kms`, `ecs`, `eip`. A module draw.io tags with its own abbreviation (`sqs`, `s3`, `vpc`) or
  names in one word (`secretsmanager`, `stepfunctions`) needs none.
- **`types`** — an exact type and the draw.io icon to use for it: the name after `mxgraph.aws4.` in
  a draw.io style, or `--types`'s output. It is how something outside AWS gets drawn, and how a
  match that is wrong gets corrected. A name draw.io does not have fails the run.
- **`hidden`** — types not to draw, `*` as a wildcard. Hiding a component hides everything in it.
- **`hiddenProperties`** — properties whose layer starts switched off. It hides nothing: the links
  are drawn and routed, and the layers button shows them. This repository starts with IAM
  (`inlinePolicies`) and network placement (`vpcConfig`, `subnetIds`, `vpcSubnetIds`) off, because
  every function has both and they cover everything else; an empty list starts with all on.
