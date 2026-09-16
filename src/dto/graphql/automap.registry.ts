import { createDecoratorRegistry } from '../../validated-dto/schemas/registries';

/**
 * O registry dos decorators do **mapeador**, para os DTOs gerados.
 *
 * Num DTO gerado não existe propriedade para decorar: quem declara o campo é o schema Zod. O
 * `ValidatedDto` já resolve isso para o class-transformer e o class-validator, e o `DECORATOR_REGISTRY`
 * é o gancho por onde qualquer outro decorator de campo entra — é por ele que o `@AutoMap()` chega.
 *
 * ## Por que um registry próprio, e não o global
 * Porque é ele que diz **de quem** é aquele decorator. O global é o quintal de todo mundo: um
 * decorator pendurado lá vale para qualquer DTO gerado a partir daquele schema, e não há como
 * perguntar depois quem o pôs. Este aqui tem dono e tem escopo — o que está nele é mapeamento, e
 * quem o lê são as classes que o declaram no `ValidatedDto(schema, { DECORATOR_REGISTRY })`.
 *
 * O isolamento não exclui o global: o `ValidatedDto` mistura os dois ao montar a classe, então um
 * decorator global continua valendo para um DTO que usa este registry.
 *
 * ## Um `AutoMap()` por campo
 * O decorator guarda o tipo do campo que decora na primeira vez que roda, então **não** reaproveite a
 * mesma instância em dois campos: escreva `[AutoMap()]` em cada um. Pelo mesmo motivo, campos de value
 * object passam por `field({ decorators })` em vez de decorar o `field()` puro — aquele é cacheado por
 * classe e dividido por todos os DTOs que embutem o mesmo value object.
 */
export const AUTOMAP_REGISTRY = createDecoratorRegistry();
