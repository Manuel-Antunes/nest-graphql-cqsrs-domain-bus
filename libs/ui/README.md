# `@nestposts/ui`

The design system: the shadcn primitives every screen is built from, the components built on them
(data table, stepper, dropzone, multi-select, date pickers, the web-mcp tooling), the hooks they share
and the theme — tokens, fonts, the brand layer and the animations. `apps/web` renders its pages and
better-auth-ui's screens with it; nothing in the application keeps a copy of a primitive.

It is a **source package**. Its `exports` point at `.ts`/`.tsx` files and there is no build a consumer
waits for: Next compiles it with the application (`transpilePackages`), and `typecheck` is what checks
it on its own.

## One family of primitives: shadcn `base-nova`

The primitives are shadcn's **base-nova** style — Base UI underneath, not Radix — because that is the
style better-auth-ui's registry is published for and the one `apps/web` was already written against.
The two families are not interchangeable: a Base UI trigger composes through `render={<Button />}`,
where a Radix one took `asChild`, and a component written for one silently loses its trigger on the
other. Components of this package that still reach for Radix directly (`radix-ui`, `@radix-ui/*`) do so
for a primitive shadcn does not wrap, never for one it does.

## Adding a component

From this directory, with the aliases resolved through `tsconfig.ui.json`:

```bash
npx nx run @nestposts/ui:ui-add -- <name>          # a shadcn primitive
npx nx run @nestposts/ui:ui-add -- @reui/<name>    # a reui component
```

`apps/web/components.json` points its `ui` and `utils` aliases here too, so a registry item added from
the application (`npx shadcn add @better-auth-ui/<item>`) writes its primitives into this package and
its own views into the application. Every file that comes from a registry has its comments stripped
and is formatted by Biome; `biome.json` has an override for `libs/ui/**` that turns off the rules a
copied component breaks by design (exhaustive effect dependencies, a handful of a11y rules on
composite widgets, index keys on positional lists) — they are upstream's decisions, and rewriting them
here would make every refresh a merge.

## The theme

`src/styles/global.css` is the entry an application imports: Tailwind, the tokens (`theme.css`), the
self-hosted fonts (`fonts.css`), the brand recipes (`brand.css`) and the animations. It declares
`@source` over this package, so the classes its components use are generated for whichever
application imports it.

## Storybook

The `.stories.tsx` files and `.storybook/` came with the package and are kept, but Storybook is not
installed in this repository: they are excluded from `typecheck`, and `tsconfig.storybook.json` is
not referenced.
