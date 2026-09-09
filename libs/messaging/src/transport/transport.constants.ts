/** Metadata gravada na *classe do evento*: para quais transportes ele é difundido. */
export const EVENT_TRANSPORTS_METADATA = '__eventTransports__';
/** Metadata gravada na *classe do evento*: não publicar no `EventBus` local. */
export const EXCLUDE_LOCAL_METADATA = '__excludeLocalBus__';

/**
 * Os dois padrões de mensagem por onde os eventos de domínio trafegam. Um por *intenção*, e não por
 * transporte — o transporte é consequência:
 *
 * - **notificação**: "aconteceu isto, quem quiser saber que saiba". Pub/sub, todos recebem, e perder
 *   uma é sobreviver (a próxima leitura corrige). É o que alimenta subscriptions e projeções.
 * - **durável**: "isto não pode se perder". Fila, um consumidor, com ack. É o que se usa quando o
 *   evento move dinheiro ou dispara trabalho que ninguém vai refazer.
 */
export const NOTIFICATION_EVENT_PATTERN = 'domain-event.notification';
export const DURABLE_EVENT_PATTERN = 'domain-event.durable';

/** Token do `ClientProxy` por onde saem as **notificações** (difusão). */
export const EVENTS_NOTIFY_CLIENT = 'EVENTS_NOTIFY';
/** Token do `ClientProxy` por onde saem os eventos **duráveis** (fila com ack). */
export const EVENTS_DURABLE_CLIENT = 'EVENTS_DURABLE';
