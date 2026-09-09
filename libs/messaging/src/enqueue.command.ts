import { Command } from '@nestjs/cqrs';

/**
 * "Mande este trabalho para aquele serviço." O único command que atravessa a fronteira de um
 * processo — e o que dá à saga coreografada um vocabulário só, independente de transporte.
 *
 * Uma saga do @nestjs/cqrs é `Observable<evento> → Observable<command>`. Num processo só, o command
 * que sai dela é executado ali mesmo. Num sistema distribuído o passo seguinte é de outro serviço, e
 * a saga não deveria conhecer nem `ClientProxy`, nem RabbitMQ, nem fila: ela emite um `EnqueueCommand`
 * dizendo **para quem** e **o quê**, e quem sabe falar com o RabbitMQ é o handler dele.
 *
 * É o que mantém a mesma saga rodando nos dois serviços sem que ela saiba onde está.
 */
export class EnqueueCommand extends Command<void> {
  constructor(
    /** O serviço de destino — o token do `ClientProxy` registrado no `MessagingModule`. */
    readonly service: string,
    /** O padrão da mensagem, que do outro lado é um `@EventPattern`. */
    readonly pattern: string,
    /** O corpo. Primitivos: isto vai virar JSON numa fila. */
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
