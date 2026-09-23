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
| `graphql-operations.grit` | `apps/web/src/**`, minus `src/gql/**` | `@graphql-eslint/eslint-plugin` |
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
template literal, and Biome's GraphQL linter only sees standalone `.graphql` files. This reads the
document as text off the call expression, which is the only handle there is, and that buys the two
rules that need no schema:

- **The fragment naming convention**, `<Owner>_<field>` — `PostCard_post`. This was the one rule the
  old config wrote by hand, because the codegen'd unmask helper and every spread site read that name.
- **No anonymous operations.** The codegen client preset keys its documents by operation name.
- **Indentation drift.** Biome formats standalone `.graphql` files and leaves an embedded one alone,
  and Prettier — which reindented these — is gone, so the shape is kept by hand. Canonical is two
  spaces per level, the definition at two, its closing brace at two, and these hold without counting
  braces: a line at column zero, an odd number of leading spaces, a tab, a field sitting at the
  definition's own depth, indentation that grows after a line which opened nothing, indentation that
  grows by more than one level, a line that opens a block and is not followed by one exactly a level
  deeper, and a dedent onto a line that does not close one. Together they catch every drift an edit
  realistically makes — each was checked against all twenty documents first, and none matches correct
  GraphQL.
- **Spacing drift**, which is the same idea along the line rather than between lines. `print` puts
  exactly one space where a space goes and none anywhere else, so each of these is a fact about its
  output: two spaces in a row outside the indentation (`edges  {`), a spread carrying a space
  (`... PostCard_post`, where only the inline fragment `... on Post {` is legal), a space around the
  parentheses or before a colon, a colon with no space after it, a brace that does not open at the
  end of its line or close alone on its own, and a blank line inside a document. A comma is **not** a
  rule: `print` writes `(first: $first, after: $after)`.
- **A line ending in whitespace.**

What is **not** covered: a line even-indented at the wrong depth where none of the above applies —
say a field at six inside a block whose siblings are at six but which should have closed. Proving
that needs brace counting, which is parsing, which a regex is not. And nothing here reformats: a
plugin has no autofix, so these report and stop.

Everything in `operations-recommended` that needs the schema — a field that is not on the type, an
argument of the wrong type — is left to codegen, which fails the build on exactly those.

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
- **Reformatting an embedded GraphQL document.** Plugins have no autofix — `$doc => \`…\`` compiles
  and does nothing, under `--write` and under `--write --unsafe` alike, which was checked three ways
  before this line was written. The rules report drift and a person fixes it. Biome DOES format a
  standalone `.graphql` file, and `graphql.formatter` is now on, so a document that lived in one
  would be reindented on save with no plugin at all.
- **A document with two fragments** has only its first checked. The regex returns one match and
  GritQL has no loop. Every `graphql()` here holds at most one fragment; a second one would need this
  revisited.

## Working on them

`biome check` formats `.grit` files like any other source, and a plugin that fails to compile reports
`Error(s) during loading of plugins` rather than failing open. Two behaviours are worth knowing
because both fail *silently*:

- **`$...name` does not bind.** `cn($...args)` matches nothing; `cn($args)` binds the whole argument
  list. Bare `$...` inside a call works.
- **A regex with a capture group needs a variable for it.** `r"(?:…)"` where you do not want one, or
  the plugin reports `regex pattern matched 1 variables, but expected 0` as an *info* and stops.
- **`<:` anchors a regex to the WHOLE node.** There is no substring search, so "contains" is written
  `r"(?s).*…*"`. Without the wrapping the rule compiles, loads, matches nothing and looks like a
  working rule — which is exactly how the indentation checks above shipped broken the first time.

There is no test runner for these. A rule is proven by writing the violation into a file under the
scope it is wired to, running `npx biome lint <that file>`, and deleting it — which is how each rule
here was checked in both directions, firing on the violation and silent on the shape beside it that
must stay legal.
