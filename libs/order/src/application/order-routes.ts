/**
 * Os dois serviços e as quatro mensagens que atravessam a fronteira entre eles. Uma constante só,
 * numa lib que os dois importam — é o que garante que quem emite e quem escuta falem o mesmo nome.
 */

/** Token do `ClientProxy` do serviço de pagamentos. */
export const PAYMENTS_SERVICE = 'PAYMENTS';
/** Token do `ClientProxy` do serviço da API. */
export const API_SERVICE = 'API';

/** As filas RabbitMQ — uma por serviço, porque um command tem exatamente um dono. */
export const PAYMENTS_QUEUE = 'order.payments';
export const API_QUEUE = 'order.api';

/** Os padrões de mensagem: o que o `EnqueueCommand` nomeia e o `@EventPattern` do outro lado escuta. */
export const OrderPattern = {
  /** API → pagamentos: reserve o valor. */
  AUTHORIZE: 'payment.authorize',
  /** pagamentos → pagamentos: agora cobre. */
  CAPTURE: 'payment.capture',
  /** pagamentos → API: está pago. */
  COMPLETE: 'order.complete',
  /** pagamentos → API: não vai rolar. */
  FAIL: 'order.fail',
} as const;
