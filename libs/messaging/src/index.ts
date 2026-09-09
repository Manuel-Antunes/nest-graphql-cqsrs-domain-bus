/**
 * A mensageria entre os serviços: **cada evento escolhe os seus transportes** (`@TransportType`), e
 * os commands vão por fila (`EnqueueCommand`). Nada aqui sabe o que é um pedido.
 */
export * from './constants';
export * from './enqueue.command';
export * from './enqueue.handler';
export * from './event-registry';
export * from './messaging-config';
export * from './messaging-options';
export * from './messaging.module';
export * from './transport/inbound-event.dispatcher';
export * from './transport/notification-events.controller';
export * from './transport/transport-event-bus';
export * from './transport/transport-type.decorator';
export * from './transport/transport.constants';
