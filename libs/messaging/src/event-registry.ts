import { Injectable, type Type } from '@nestjs/common';
import type { IEvent } from '@nestjs/cqrs';

/** O que trafega no transporte: o fato, mais quem o publicou e de que tipo ele é. */
export interface EventEnvelope {
  /** O serviço que publicou — usado para descartar o próprio eco. */
  origin: string;
  /** O nome da classe do evento; a chave do registro. */
  name: string;
  /** Os campos do evento. Vira JSON no transporte. */
  payload: Record<string, unknown>;
}

/** Uma string que é exatamente uma data ISO-8601 — o que o `JSON.stringify` faz com um `Date`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Devolve as datas que o JSON transformou em texto. */
function reviveDates<T>(value: T): T {
  if (typeof value === 'string') {
    return (ISO_DATE.test(value) ? new Date(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(reviveDates) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveDates(item)])) as T;
  }
  return value;
}

/**
 * Nome da classe ↔ classe do evento, e o envelope que atravessa o processo.
 *
 * ## Por que reconstruir a classe importa
 * Do outro lado do transporte chega JSON. Se ele fosse entregue como objeto solto,
 * `ofType(PaymentAuthorizedEvent)` — que é um `instanceof` — não reconheceria nada, e o
 * `instanceof OrderEvent` da subscription também não. Então a desserialização não faz `JSON.parse` e
 * pronto: ela **recria a instância da classe certa**, com `Object.create(Tipo.prototype)`.
 *
 * (É onde a lib original tropeça: o `@TransportEvent()` dela monta uma classe anônima *renomeada*
 * para o nome do evento, o que engana quem olha o `constructor.name` mas falha em todo `instanceof`.
 * Sagas e subscriptions ficariam mudas.)
 *
 * `Object.create` em vez do construtor de propósito: um construtor valida e pode ter efeitos, e um
 * evento que já aconteceu não se valida de novo — ele se reconstrói. É o mesmo princípio do
 * `loadFromHistory`: reidratar não é decidir.
 *
 * ## Datas
 * `JSON` não tem tipo data; um `Date` vira string ISO na ida. Na volta, toda string que *é* uma data
 * ISO-8601 completa volta a ser `Date`. É uma heurística, e é a mesma que qualquer camada de
 * transporte JSON acaba adotando — vale saber que ela existe: um campo de texto cujo conteúdo seja
 * exatamente uma data ISO voltaria como `Date`.
 */
@Injectable()
export class EventRegistry {
  private readonly byName = new Map<string, Type<IEvent>>();

  register(...types: Type<IEvent>[]): this {
    types.forEach((type) => this.byName.set(type.name, type));
    return this;
  }

  /** Os tipos registrados — para diagnóstico e para os testes. */
  get known(): string[] {
    return [...this.byName.keys()];
  }

  /** O evento pronto para viajar. Quem serializa para JSON é o transporte. */
  envelope(event: IEvent, origin: string): EventEnvelope {
    return {
      origin,
      name: Object.getPrototypeOf(event).constructor.name,
      payload: { ...(event as Record<string, unknown>) },
    };
  }

  /** `undefined` quando o tipo não é conhecido aqui — um serviço não precisa conhecer todo evento. */
  restore(envelope: EventEnvelope): IEvent | undefined {
    const type = this.byName.get(envelope.name);
    if (!type) {
      return undefined;
    }
    return Object.assign(Object.create(type.prototype), reviveDates(envelope.payload)) as IEvent;
  }
}
