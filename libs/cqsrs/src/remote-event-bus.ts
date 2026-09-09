import { Injectable } from '@nestjs/common';
import { type IEvent, ObservableBus } from '@nestjs/cqrs';

/**
 * Os eventos que **aconteceram em outro processo** e chegaram aqui por algum transporte (nesta POC,
 * Redis pub/sub). Um `Observable` deles, e nada mais — quem os coloca aqui é um adapter de
 * infraestrutura; quem os lê é o {@link EventStream}.
 *
 * ## Por que eles não entram no `EventBus`
 * Esta é *a* decisão do sistema distribuído, e ela cabe numa frase: **um evento remoto é notícia, não
 * gatilho.**
 *
 * O `EventBus` do @nestjs/cqrs é onde as sagas e os `@EventsHandler` escutam. Se um evento vindo de
 * outro serviço fosse empurrado para lá, e os dois serviços compartilhassem a mesma saga (que é
 * justamente o que uma lib comum permite), a saga rodaria **duas vezes** para o mesmo fato: uma no
 * serviço onde ele aconteceu, outra em cada serviço que o recebeu. Dois `authorize`, duas cobranças.
 *
 * Separando os dois barramentos, a regra fica estrutural em vez de combinada:
 *
 * - **`EventBus`** — o que aconteceu *aqui*. Alimenta sagas, event handlers e subscriptions. É o
 *   serviço dono do fato que reage a ele, e só ele.
 * - **`RemoteEventBus`** — o que aconteceu *lá*. Alimenta só as subscriptions, pelo `EventStream`.
 *
 * A saga continua a mesma classe, na mesma lib, registrada nos dois serviços — e ainda assim dispara
 * uma vez só, porque o gatilho dela é o barramento local. Sem flag de "sou o dono", sem `if` de
 * origem espalhado pelas sagas.
 */
@Injectable()
export class RemoteEventBus extends ObservableBus<IEvent> {
  /** Entrega um evento recebido de outro processo. Chamado pelo adapter de transporte. */
  publish<TEvent extends IEvent = IEvent>(event: TEvent): void {
    this.subject$.next(event);
  }
}
