import type { Type } from '@nestjs/common';
import type { IEvent } from '@nestjs/cqrs';
import type { ClientProviderOptions, Transport } from '@nestjs/microservices';

/**
 * Um transporte por onde eventos de domínio saem daqui: qual `ClientProxy` usar e sob que padrão de
 * mensagem. É a tabela que o `@TransportType(Transport.X)` de cada evento consulta.
 */
export interface EventTransport {
  /** O tipo que os eventos nomeiam no `@TransportType`. */
  transport: Transport;
  /** O token do `ClientProxy` (um dos `clients` abaixo). */
  client: string;
  /** O padrão da mensagem — do outro lado, um `@EventPattern`. */
  pattern: string;
}

export interface MessagingOptions {
  /**
   * Quem é este serviço. Vai carimbado em cada evento publicado, e é o que faz um serviço **ignorar
   * o próprio eco**: um transporte de difusão entrega a mensagem a todos os inscritos, inclusive a
   * quem publicou.
   */
  service: string;
  /** Os `ClientProxy` que este serviço usa — para enfileirar commands e para difundir eventos. */
  clients: ClientProviderOptions[];
  /** Para onde os eventos saem, por tipo de transporte. */
  eventTransports: EventTransport[];
  /** Os tipos de evento que atravessam processo. Sem eles não há como reconstruir a classe do outro lado. */
  events: Type<IEvent>[];
}
