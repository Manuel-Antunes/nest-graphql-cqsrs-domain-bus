# `tools/biome` — the rules Biome does not ship

Three GritQL plugins, wired by path in the root `biome.json`. They exist because the move from ESLint
to Biome left three holes, and each of these fills the part of its hole that can be filled without the
thing Biome cannot give a plugin: a schema, a stylesheet, or a second file.

A plugin is a pattern plus `register_diagnostic`. It reads the file it is handed and nothing else —
no I/O, no configuration, no type information — and it cannot autofix. That single constraint is what
decides, below, which rules are here and which could not be.

| file | scope in `biome.json` | replaces |
|---|---|---|
| `playwright.grit` | `apps/web-e2e/src/specs/**/*.spec.ts` | `eslint-plugin-playwright` |
| `graphql-operations.grit` | `apps/web/src/**`, minus `src/gql/**` | `@graphql-eslint/eslint-plugin`'s naming convention |
| `tailwind.grit` | idem | `eslint-plugin-better-tailwindcss` |

The scopes are the ones the ESLint configs had. `playwright.grit` deliberately does not reach
`apps/web-e2e/src/support/**`: a helper there may assert outside a test block, which is the whole
point of a helper.

## What each one checks

**`playwright.grit`** — Biome's `test` domain already has `noFocusedTests` and `noSkippedTests`, which
were `no-focused-test` and `no-skipped-test`. What it does not have is the rule from the plugin's
`flat/recommended` that actually caught bugs:

- **A web-first matcher that is not awaited.** `expect(locator).toBeVisible()` returns a Promise.
  Without `await` it asserts nothing, the test is green, and the page never rendered. The plugin
  carries the list of Playwright's async matchers; `await`, `return`, `Promise.all` and `.then` all
  count as consuming it. **A matcher missing from that list is a matcher this rule does not check**,
  so the list is the thing to extend when Playwright adds one.
- **An assertion inside a conditional**, which is an assertion the test may never reach.

`no-conditional-in-test` is *not* ported. It refused a conditional anywhere in a test body, and
distinguishing the test's own body from a `page.on('request', …)` callback nested inside it — which
`authentication.spec.ts` legitimately has — is a scoping rule GritQL cannot express.

**`graphql-operations.grit`** — every operation in `apps/web` lives inside a `` graphql(`…`) ``
template literal. With `javascript.experimentalEmbeddedSnippetsEnabled`, Biome formats that document
and runs its own GraphQL rules on it, so what `@graphql-eslint`'s `operations-recommended` checked is
now split three ways:

| where | what |
|---|---|
| Biome, natively | anonymous operations (`useGraphqlNamedOperations`), a second anonymous one (`useLoneAnonymousOperation`), duplicate variables, arguments and fields — `noDuplicateFields` raised to `error` in `biome.json`, because it defaults to `info` |
| this plugin | naming, which Biome has no rule for (its `useGraphqlNamingConvention` only checks enum values) |
| codegen | everything that needs the schema — an unknown field or fragment, a wrong argument type — plus an undefined variable and a subscription with two root fields, which fail `graphql-codegen` |

The plugin reads the document as text off the call expression and holds the three conventions of the
old `naming-convention` config:

- **Fragments are `<Owner>_<field>`** — `PostCard_post`. This was the one rule the old config wrote by
  hand, because the codegen'd unmask helper and every spread site read that name.
- **Operations are PascalCase, without the keyword in the name** — `FeedPosts`, not `feedPosts` or
  `GetFeedPostsQuery`: no `Query`, `Mutation`, `Subscription` or `Get` prefix and no `Query`,
  `Mutation` or `Subscription` suffix, which are `operations-recommended`'s defaults. Codegen appends
  the keyword to the type it generates, so a repeated one reads `FeedPostsQueryQuery`.
- **Variables are camelCase** — `$postId`, not `$PostId` or `$post_id`. The old config allowed a
  leading underscore on every name, and so does this.

Each was checked both ways against a probe file: firing on the violation, and silent on the legal
shape beside it — a leading underscore, `$after` used only as a value, `GenerateThing` and
`QueueStatus`, which contain the forbidden words without starting with them.

**`tailwind.grit`** — reads both places a class list is written here, the `className` attribute and
the `cn()` call:

- **Utilities removed in Tailwind v4** (`flex-shrink-*`, `flex-grow-*`, `overflow-ellipsis`,
  `decoration-slice`, `decoration-clone`, the `*-opacity-*` family). Each is silently inert: emitted
  into the HTML, matching no rule, and the element renders unstyled.
- **Leading, trailing or doubled whitespace** in a class list, which is why two lists that are the
  same read as different in a diff.

## What could not be written, and why

These are the gaps, stated so that nobody reads the table above as full coverage.

- **`no-unknown-classes`** was the better-tailwindcss rule worth having, and it is the one that cannot
  exist here: it resolves every class against `globals.css`. A plugin sees one file.
- **`no-duplicate-classes`** needs a backreference (`\b(\w+)\b.*\b\1\b`). The regex engine Biome
  compiles these against has none — the pattern compiles and silently never matches, which is worth
  knowing before writing another rule that way.
- **Class sorting** is Biome's own `nursery/useSortedClasses`, already on in `biome.json`.
- **An unused variable** (`no-unused-variables`). It needs a backreference — a `$name` defined and
  never repeated — and the regex engine has none. Codegen does not refuse one either.
- **An unused or a duplicate fragment across files** (`no-unused-fragments`,
  `unique-fragment-name`). A plugin sees one file; codegen refuses a duplicate operation name, not an
  orphan fragment.
- **A document with two fragments** has only one of them checked. A capturing regex binds one match
  and GritQL has no loop. Every `graphql()` here holds one operation or one fragment; a document with
  more would need this revisited.

## Working on them

`biome check` formats `.grit` files like any other source, and a plugin that fails to compile reports
`Error(s) during loading of plugins` rather than failing open. These are worth knowing, most of
them because they fail *silently*:

- **`$...name` does not bind.** `cn($...args)` matches nothing; `cn($args)` binds the whole argument
  list. Bare `$...` inside a call works.
- **A regex with a capture group needs a variable for it.** `r"(?:…)"` where you do not want one, or
  the plugin reports `regex pattern matched 1 variables, but expected 0` as an *info* and stops.
- **`<:` anchors a regex to the WHOLE node.** There is no substring search, so "contains" is written
  `r"(?s).*…*"`. Without the wrapping the rule compiles, loads, matches nothing and looks like a
  working rule.
- **A plugin that does not compile switches the whole linter off.** `Error(s) during loading of
  plugins` is then everything the run reports — no other plugin and none of Biome's own rules. A
  branch still calling a pattern that was deleted is enough.

There is no test runner for these. A rule is proven by writing the violation into a file under the
scope it is wired to, running `npx biome lint <that file>`, and deleting it — which is how each rule
here was checked in both directions, firing on the violation and silent on the shape beside it that
must stay legal.
