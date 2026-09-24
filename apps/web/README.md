# web

O cliente de teste da `posts-api`: Next.js (app router) + Apollo Client, para ver a API de fora.

```bash
pnpm db:setup                      # o esquema e a tag padrão
npx nx serve @nestposts/posts-api  # a API em :3000
npx nx serve @nestposts/web        # este app em :4200
```

`NEXT_PUBLIC_API_URL` (padrão `http://localhost:3000`) é de onde saem o endpoint GraphQL e o socket das
subscriptions. The auth variables are the API's (see the root `CLAUDE.md`), plus `WEB_TRANSPORT` and
its broker address, because this server publishes the emails its Better Auth sends.

## Por onde os dados passam

**O `build` existe como script E como target do Nx**, e não é descuido. O Nx é quem constrói aqui
normalmente (`nx run @nestposts/web:build`, com cache e dependendo do `codegen`); o script existe
porque o **OpenNext** — que é quem empacota este app para a Lambda — roda `pnpm build` dentro deste
diretório e não sabe nada sobre Nx. Sem ele o deploy morre em `Command "build" not found`, depois de
já ter criado a infraestrutura toda.

**Queries e mutations vão por `/api/graphql`**, um route handler deste app. Não é enfeite: é ele que
põe o cookie da sessão na requisição de saída, e é por isso que o cookie nunca chega ao código de
cliente.

**Subscriptions não passam por ali.** Um route handler responde a uma requisição, e uma subscription é
um stream que fica aberto — o browser abre `…/graphql` direto na API, com `graphql-sse`, que é o que
ela fala: **GraphQL-over-SSE** no mesmo endereço das queries, em *distinct connections mode* (uma
requisição por subscription, porque o outro modo reserva o stream com um `PUT` e precisa que o mesmo
processo responda tudo dali em diante — o que uma função atrás de um balanceador não promete). Dá
para fazer isso porque `onPostCreated` e `onPostUpdated` são `@AllowAnonymous`: não há sessão a
reencaminhar.

## Authentication: better-auth-ui, over this application's own Better Auth

Every auth screen is [better-auth-ui](https://better-auth-ui.com)'s, copied in from its shadcn
registry: `src/components/auth/**` are the views, `src/lib/auth/*-plugin.ts(x)` the plugin factories,
and `app/_providers/auth-providers.tsx` wires them — password with **required** email verification,
magic link, email code, two factor (authenticator, emailed code, backup codes), several accounts per
browser, organizations with teams, the admin screens and the OAuth consent screen.

The primitives under them — and under every other page here — are `@nestposts/ui`'s (`libs/ui`), the
repository's one design system: `components.json` points its `ui` and `utils` aliases there, so a
registry install writes the views here and the primitives there, and `globals.css` is that package's
theme plus the two font tokens `next/font` fills.

| route | what answers |
|---|---|
| `/auth/[path]` | sign-in, sign-up, forgot/reset password, magic link, email code, two factor, accept invitation, OAuth consent, sign-up and account selection |
| `/settings/[path]` | account, security (password, sessions, two factor, deletion, connected apps), organizations, OAuth clients |
| `/organization/[path]` | the active organization: settings, people, teams |
| `/admin/users` | the admin plugin's user management — `admin` role only |

The Better Auth behind them runs **here**, in the Nest container of `src/nest/`, against the API's
database and secret — so the cookie it writes belongs to this origin and is one the API resolves.
Every email those screens make Better Auth send is a notification that this server publishes on the
system's transport (`WEB_TRANSPORT`) and `apps/notificator` delivers; locally it lands in Mailpit, at
http://localhost:8025.

The session this application reads (`useSession()` in `app/_providers/session-provider.tsx`) is the
one better-auth-ui keeps in TanStack Query, prefetched by the layout — so signing in or out in those
screens reaches the header and the pages without a reload.

## Federação

`apps/posts-api` é um **subgraph** — driver `YogaFederationDriver` —, e `/federation` é a única tela
daqui que chama o que nenhuma outra chamaria: `_entities(representations:)`, que é por onde um
roteador de federação resolve uma entidade a partir da chave, e não de uma query. A tela monta o lote
com o que o feed já sabe — um `Post`, o `Author` dele, as `Tag`s — e junta as duas recusas que são a
parte interessante: um autor pedido como `User`, e uma chave que não resolve nada. As duas voltam
`null`, cada uma na sua posição, sem erro. A chamada é anônima de propósito: o roteador não tem
sessão.

O que a federação acrescenta ao schema — `_Any`, a união `_Entity` e `Query._entities` — não está em
nenhum `.graphql` da API: quem o põe lá é o `buildSubgraphSchema`, em tempo de execução. Como o
`codegen` lê o SDL do disco, essa parte está declarada em `federation.graphql`, na raiz deste app, e
entra na lista de schemas do `codegen.ts`. É o contrato do que o servidor serve, escrito onde o
cliente consegue lê-lo — e se ele divergir, o documento que o usa quebra a geração.

## O que o schema daqui não tem

O app veio do `axon-graphql-posts`, e duas coisas não atravessaram porque esta API não as expõe:
`deletePost`/`restorePost` (o soft delete existe no domínio, não no schema) e
`User.accounts`/`Author.bio`. O `codegen` lê `apps/posts-api/src/graphql/**/*.graphql` direto, então
um documento que peça um campo que não existe quebra a geração — que é onde se quer descobrir isso.
