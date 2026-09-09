import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EnqueueCommand } from './enqueue.command';

/**
 * O handler do `EnqueueCommand`: acha o `ClientProxy` do serviço nomeado e emite a mensagem.
 *
 * É a única classe do sistema que sabe que existe um RabbitMQ. A saga emite o command; isto aqui o
 * transforma numa mensagem de fila.
 *
 * O proxy é resolvido pelo `ModuleRef` em vez de injetado no construtor porque o destino é **dado**,
 * não estrutura: um handler injetado por `@Inject('PAYMENTS')` só saberia falar com pagamentos, e
 * seriam N handlers para N serviços. Assim há um só, e acrescentar um destino é acrescentar um
 * cliente na configuração do módulo.
 *
 * `emit` devolve um `Observable` frio — sem inscrever, nada é enviado. O `lastValueFrom` inscreve e
 * espera o envio terminar, o que faz um erro de publicação virar um erro do command em vez de um
 * silêncio.
 */
@CommandHandler(EnqueueCommand)
export class EnqueueCommandHandler implements ICommandHandler<EnqueueCommand> {
  private readonly logger = new Logger(EnqueueCommandHandler.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async execute(command: EnqueueCommand): Promise<void> {
    const client = this.moduleRef.get<ClientProxy>(command.service, { strict: false });
    this.logger.log(`→ ${command.service}: ${command.pattern} ${JSON.stringify(command.payload)}`);
    await lastValueFrom(client.emit(command.pattern, command.payload), { defaultValue: undefined });
  }
}
