import { Injectable } from '@nestjs/common';
import type { Order } from './order';
import type { Payment } from './payment';

/**
 * As portas de persistência do fluxo, indexadas pela chave de idempotência.
 *
 * Classes abstratas, e não interfaces, pelo mesmo motivo do `PostRepository`: uma interface some no
 * runtime e não serve de token de injeção.
 */
@Injectable()
export abstract class OrderRepository {
  abstract save(order: Order): Promise<void>;
  abstract find(key: string): Promise<Order | null>;
}

@Injectable()
export abstract class PaymentRepository {
  abstract save(payment: Payment): Promise<void>;
  abstract find(key: string): Promise<Payment | null>;
}

/**
 * O adapter da POC: um `Map` por processo.
 *
 * Aqui isso é honesto — cada serviço guarda só o que ele mesmo decide (a API guarda pedidos, o
 * pagamentos guarda pagamentos), e o que o teste precisa provar é a coreografia entre eles, não a
 * durabilidade. Num sistema de verdade estes dois seriam bancos diferentes, um por serviço; nada
 * acima desta classe mudaria.
 */
export class InMemoryStore<T extends { key: string }> {
  private readonly rows = new Map<string, T>();

  async save(row: T): Promise<void> {
    this.rows.set(row.key, row);
  }

  async find(key: string): Promise<T | null> {
    return this.rows.get(key) ?? null;
  }
}

@Injectable()
export class InMemoryOrderRepository extends InMemoryStore<Order> implements OrderRepository {}

@Injectable()
export class InMemoryPaymentRepository extends InMemoryStore<Payment> implements PaymentRepository {}
