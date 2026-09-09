import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AuthorizePaymentCommand, CapturePaymentCommand, OrderPattern } from '@app/order';

/**
 * A borda do serviço de pagamentos: RabbitMQ em vez de HTTP.
 *
 * O papel é exatamente o de um resolver GraphQL do outro serviço — traduzir o protocolo para um
 * command e entregar ao `CommandBus`. Nenhuma regra aqui; a única diferença é que o "protocolo" é uma
 * mensagem de fila.
 *
 * `@EventPattern`, e não `@MessagePattern`: quem mandou não espera resposta. A resposta, quando vem,
 * vem como *outro evento*, pelo Redis — é isso que faz a coreografia ser coreografia, e não RPC
 * disfarçado.
 */
@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern(OrderPattern.AUTHORIZE)
  async authorize(@Payload() payload: { key: string; orderId: string; amount: number }): Promise<void> {
    this.logger.log(`← ${OrderPattern.AUTHORIZE} ${payload.key}`);
    await this.commandBus.execute(new AuthorizePaymentCommand(payload.key, payload.orderId, payload.amount));
  }

  @EventPattern(OrderPattern.CAPTURE)
  async capture(@Payload() payload: { key: string }): Promise<void> {
    this.logger.log(`← ${OrderPattern.CAPTURE} ${payload.key}`);
    await this.commandBus.execute(new CapturePaymentCommand(payload.key));
  }
}
