# web

O cliente de teste da `posts-api`: Next.js (app router) + Apollo Client, para ver a API de fora.

```bash
pnpm db:setup                      # o esquema e a tag padrão
npx nx serve @nestposts/posts-api  # a API em :3000
npx nx serve @nestposts/web        # este app em :4200
```

`NEXT_PUBLIC_API_URL` (padrão `http://localhost:3000`) é a única configuração: dela saem o endpoint
GraphQL, o socket das subscriptions e as rotas do Better Auth.

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

**A sessão é do Better Auth, e mora no servidor do Next.** O cookie que a API devolve é para o domínio
dela, não para o deste app; então o `signIn` guarda esse cookie num cookie httpOnly próprio e o proxy o
devolve para cima. Não há claims para ler deste lado — o cookie é opaco —, então quem responde o que a
sessão é continua sendo a API (`/api/auth/get-session`), e o papel que ela devolve é o que decide se
esta pessoa escreve.

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
