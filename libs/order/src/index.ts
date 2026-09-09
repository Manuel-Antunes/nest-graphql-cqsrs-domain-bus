/**
 * O domínio do pedido e a coreografia que o atravessa — a lib que os **dois** serviços importam.
 * É ela que torna possível "a mesma saga nos dois lados", que é o que dá ao sistema um desenho só.
 */
export * from './application/order-routes';
export * from './application/order.saga';
export * from './application/projection/payment.projection';
export * from './application/command/order.commands';
export * from './application/command/order.handlers';
export * from './application/subscription/on-order-updated.handler';
export * from './application/subscription/on-order-updated.subscription';
export * from './order.providers';
export * from './domain/order';
export * from './domain/order-step';
export * from './domain/order.repository';
export * from './domain/event/order-event';
export * from './domain/exception/order.exceptions';
export * from './domain/payment';
export * from './domain/vo/order-key';
export * from './domain/vo/money';
