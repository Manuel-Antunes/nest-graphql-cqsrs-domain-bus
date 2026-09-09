import { OrderPattern, CompleteOrderCommand, FailOrderCommand } from '@app/order';
import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventPattern, Payload } from '@nestjs/microservices';

/**
 * A **outra** borda da API: a fila `order.api`.
 *
 * O serviço da API não é só um servidor GraphQL — ele é um participante da coreografia, e recebe de
 * volta o que o pagamentos decidiu. É por isso que ele sobe como aplicação híbrida (HTTP + RabbitMQ):
 * a mesma aplicação, dois protocolos de entrada, um `CommandBus` só.
 */
@Controller()
export class OrderMessagingController {
  private readonly logger = new Logger(OrderMessagingController.name);

  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern(OrderPattern.COMPLETE)
  async complete(@Payload() payload: { key: string; receiptId: string }): Promise<void> {
    this.logger.log(`← ${OrderPattern.COMPLETE} ${payload.key}`);
    await this.commandBus.execute(new CompleteOrderCommand(payload.key, payload.receiptId));
  }

  @EventPattern(OrderPattern.FAIL)
  async fail(@Payload() payload: { key: string; reason: string }): Promise<void> {
    this.logger.log(`← ${OrderPattern.FAIL} ${payload.key}`);
    await this.commandBus.execute(new FailOrderCommand(payload.key, payload.reason));
  }
}
