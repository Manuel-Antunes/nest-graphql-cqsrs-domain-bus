# auth

The email templates under `src/mail/components/` — and their copy in
`libs/organizations/src/mail/components/` — are the React Email components of
[**better-auth-ui**](https://github.com/better-auth-ui/better-auth-ui) (1.7.x), MIT licensed (see
`src/mail/components/LICENSE`). They are the same components `apps/web` renders its screens next to,
taken from the project's shadcn registry (`@better-auth-ui/<name>-email`), which is how better-auth-ui
distributes them: as source to be copied, not a package to import.

## Why copied and not imported

`@better-auth-ui/react` exports `./email` under the `import` condition only. The libraries here compile
to CommonJS and are loaded with `require`, and a `require` of an export map that has no `require` or
`default` condition fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` — so the package cannot be reached from
the notificator that renders these, whatever Node's `require(esm)` could do with the file itself.

## What changed on the way in

| upstream | here |
|---|---|
| `import { cn } from "@/lib/utils"` | `./cn` (clsx + tailwind-merge) |
| JSDoc on every prop and component | removed — this repository carries no comments outside the in-house libraries |
| formatting | Biome's |

The markup, the wording, the localization objects and the colors are upstream's. What this repository
adds is around them, not in them: each template in `src/mail/templates/` is a `defineEmailTemplate`
that renders one of these with the application's name, and `ONE_TIME_PASSWORD_WORDING` passes the
OTP email the words for what the code is for, through the component's own `localization` prop.

## Updating

`npx shadcn add @better-auth-ui/<name>-email --view` prints the current source. Diff it against the
file here, keep the three changes above, and run the `better-auth-emails.spec.ts` suite, which renders
every one of them.
