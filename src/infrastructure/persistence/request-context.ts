import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';

/**
 * Roda algo **dentro de um contexto do ORM**, reaproveitando o da requisição quando há um.
 *
 * O contexto nasce na borda: o middleware que o `MikroOrmModule` registra abre um fork do
 * `EntityManager` por requisição HTTP, e `allowGlobalContext: false` garante que nada rode fora dele
 * — uma consulta sem contexto estoura na hora, em vez de compartilhar identity map entre requisições
 * sem querer.
 *
 * Nem todo caminho, porém, começa numa requisição. São três, e nenhum deles é exótico:
 *
 * 1. o servidor fala com o Better Auth sobre si mesmo (`IdentityProvider.grantRole`), e o Better Auth
 *    responde chamando os hooks de volta — os dois lados tocam o ORM, e nenhum tem uma requisição por
 *    baixo quando a chamada nasce de um teste, de um seed ou de uma rotina;
 * 2. um resolver de campo disparado por uma **subscription**. O middleware é do Express, e a conexão
 *    das subscriptions é um WebSocket: a resolução de `Post.author` num `onPostCreated` roda fora de
 *    qualquer requisição HTTP, e sem isto a primeira consulta é recusada — ver `PostAuthorResolver`;
 * 3. um teste que chame uma porta direto.
 *
 * `getEntityManager()` é o que distingue os casos: havendo contexto, o trabalho entra **nele**, e não
 * num paralelo — que é o que faz o hook enxergar o que a chamada que o disparou acabou de gravar, e o
 * que mantém o identity map da requisição servindo as leituras dela. Não havendo, abre-se um.
 *
 * Aceita o `MikroORM` ou o próprio `EntityManager` raiz porque os dois tipos de chamador existem: o
 * adapter de identidade injeta o ORM (precisa dele para outras coisas), e os repositórios injetam só o
 * `EntityManager`. Pedir o ORM a quem já tem o EM seria uma dependência a mais por nada.
 *
 * Os dois são distinguidos pela **forma**, e não por `instanceof`: um `EntityManager` não tem `em`, e
 * um `MikroORM` tem. A diferença importa porque há testes que passam um ORM dublado — um objeto com
 * `em` e mais nada —, e um `instanceof` o classificaria como EntityManager, silenciosamente.
 */
export function inRequestContext<T>(
  source: MikroORM | EntityManager,
  work: () => Promise<T>,
): Promise<T> {
  const root = (source as MikroORM).em ?? (source as EntityManager);
  return RequestContext.getEntityManager() ? work() : RequestContext.create(root, work);
}
