# web

O cliente de teste da `posts-api`: Next.js (app router) + Apollo, para ver a API de fora.

```bash
pnpm db:setup                      # o esquema e a tag padrão
npx nx serve @nestposts/posts-api  # a API em :3000
npx nx serve @nestposts/web        # este app em :4200
```

`NEXT_PUBLIC_API_URL` (padrão `http://localhost:3000`) é a única configuração: dela saem o endpoint
GraphQL, o socket das subscriptions e as rotas do Better Auth.

## Por onde os dados passam

**Queries e mutations vão por `/api/graphql`**, um route handler deste app. Não é enfeite: é ele que
põe o cookie da sessão na requisição de saída, e é por isso que o cookie nunca chega ao código de
cliente.

**Subscriptions não passam por ali.** Um route handler responde a uma requisição, e uma subscription é
um socket — o browser abre `ws://…/graphql` direto na API, com `graphql-ws`, que é o que ela fala. Dá
para fazer isso porque `onPostCreated` e `onPostUpdated` são `@AllowAnonymous`: não há sessão a
reencaminhar.

**A sessão é do Better Auth, e mora no servidor do Next.** O cookie que a API devolve é para o domínio
dela, não para o deste app; então o `signIn` guarda esse cookie num cookie httpOnly próprio e o proxy o
devolve para cima. Não há claims para ler deste lado — o cookie é opaco —, então quem responde o que a
sessão é continua sendo a API (`/api/auth/get-session`), e o papel que ela devolve é o que decide se
esta pessoa escreve.

## O que o schema daqui não tem

O app veio do `axon-graphql-posts`, e três coisas não atravessaram porque esta API não as expõe:
federação (não há subgraph aqui), `deletePost`/`restorePost` (o soft delete existe no domínio, não no
schema) e `User.accounts`/`Author.bio`. O `codegen` lê `apps/posts-api/src/graphql/**/*.graphql`
direto, então um documento que peça um campo que não existe quebra a geração — que é onde se quer
descobrir isso.
