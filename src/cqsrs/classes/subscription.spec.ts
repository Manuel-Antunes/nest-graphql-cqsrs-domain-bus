import { Subscription } from './subscription';

describe('Subscription', () => {
  class CounterEvent {
    constructor(
      readonly topic: string,
      readonly value: number,
    ) {}
  }

  class OnAnyCounter extends Subscription<CounterEvent> {}

  class OnCounter extends Subscription<CounterEvent, { topic?: string | null }> {
    override match(event: CounterEvent): boolean {
      return !this.criteria.topic || event.topic === this.criteria.topic;
    }
  }

  describe('o filtro', () => {
    it('sem override, passa tudo — uma subscription sem critério não filtra nada', () => {
      expect(new OnAnyCounter().match(new CounterEvent('a', 1))).toBe(true);
    });

    it('com critério, recorta pelo que a subclasse decidiu', () => {
      const onlyA = new OnCounter({ topic: 'a' });

      expect(onlyA.match(new CounterEvent('a', 1))).toBe(true);
      expect(onlyA.match(new CounterEvent('b', 2))).toBe(false);
    });

    it('um critério vazio quer dizer "todos"', () => {
      const all = new OnCounter({});

      expect(all.match(new CounterEvent('a', 1))).toBe(true);
      expect(all.match(new CounterEvent('b', 2))).toBe(true);
    });
  });

  describe('a chave', () => {
    it('leva o nome do tipo e o critério serializado', () => {
      expect(new OnCounter({ topic: 'a' }).key).toBe('OnCounter({"topic":"a"})');
      expect(new OnAnyCounter().key).toBe('OnAnyCounter(void)');
    });

    it('dois pedidos iguais têm a mesma chave — é o que faz o bus reusar o stream', () => {
      expect(new OnCounter({ topic: 'a' }).key).toBe(new OnCounter({ topic: 'a' }).key);
      expect(new OnAnyCounter().key).toBe(new OnAnyCounter().key);
    });

    it('a ordem em que o critério foi montado não muda a chave', () => {
      class OnPair extends Subscription<CounterEvent, { topic: string; from: number }> {}

      expect(new OnPair({ topic: 'a', from: 1 }).key).toBe(new OnPair({ from: 1, topic: 'a' }).key);
    });

    it('um critério ausente e um undefined são o mesmo pedido', () => {
      expect(new OnCounter({}).key).toBe(new OnCounter({ topic: undefined }).key);
    });

    it('critérios diferentes têm chaves diferentes — inclusive null e ausente', () => {
      expect(new OnCounter({ topic: 'a' }).key).not.toBe(new OnCounter({ topic: 'b' }).key);
      expect(new OnCounter({ topic: null }).key).not.toBe(new OnCounter({}).key);
    });

    it('duas subscriptions de tipos diferentes não colidem no mesmo critério', () => {
      class OnOther extends Subscription<CounterEvent, { topic?: string | null }> {}

      expect(new OnOther({ topic: 'a' }).key).not.toBe(new OnCounter({ topic: 'a' }).key);
    });
  });

  it('o critério fica acessível a quem o recebeu, como veio', () => {
    const criteria = { topic: 'a' };

    expect(new OnCounter(criteria).criteria).toBe(criteria);
    expect(new OnAnyCounter().criteria).toBeUndefined();
  });
});
