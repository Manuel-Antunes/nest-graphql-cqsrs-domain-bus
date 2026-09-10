import { Subscription } from './subscription';

/**
 * A mensagem de subscription, sozinha — sem bus, sem Nest.
 *
 * Duas coisas moram nela, e as duas são regra de aplicação: o **critério** (o dado: quais eventos
 * interessam) e o **filtro** (a regra: o que aquele critério quer dizer diante de um evento). A
 * terceira, a `key`, é o que faz o `SubscriptionBus` reconhecer dois pedidos como o mesmo pedido — e
 * é a que mais pede teste, porque um erro nela não quebra nada visivelmente: só faz dois assinantes
 * iguais custarem duas inscrições no `EventBus`, ou pior, faz dois pedidos **diferentes** dividirem
 * um stream e um deles receber eventos que não pediu.
 */
describe('Subscription', () => {
  class CounterEvent {
    constructor(
      readonly topic: string,
      readonly value: number,
    ) {}
  }

  /** Sem critério: `TCriteria` é `void`, e o construtor pode ser chamado vazio. */
  class OnAnyCounter extends Subscription<CounterEvent> {}

  /** Com critério: o filtro é escrito ao lado da mensagem que ele filtra. */
  class OnCounter extends Subscription<CounterEvent, { topic?: string | null }> {
    override match(event: CounterEvent): boolean {
      return !this.criteria.topic || event.topic === this.criteria.topic;
    }
  }

  describe('o filtro', () => {
    it('sem override, passa tudo — uma subscription sem critério não filtra nada', () => {
      // Arrange / Act / Assert
      expect(new OnAnyCounter().match(new CounterEvent('a', 1))).toBe(true);
    });

    it('com critério, recorta pelo que a subclasse decidiu', () => {
      // Arrange
      const onlyA = new OnCounter({ topic: 'a' });

      // Assert
      expect(onlyA.match(new CounterEvent('a', 1))).toBe(true);
      expect(onlyA.match(new CounterEvent('b', 2))).toBe(false);
    });

    it('um critério vazio quer dizer "todos"', () => {
      // Arrange
      const all = new OnCounter({});

      // Assert
      expect(all.match(new CounterEvent('a', 1))).toBe(true);
      expect(all.match(new CounterEvent('b', 2))).toBe(true);
    });
  });

  describe('a chave', () => {
    it('leva o nome do tipo e o critério serializado', () => {
      // Assert
      expect(new OnCounter({ topic: 'a' }).key).toBe('OnCounter({"topic":"a"})');
      expect(new OnAnyCounter().key).toBe('OnAnyCounter(void)');
    });

    it('dois pedidos iguais têm a mesma chave — é o que faz o bus reusar o stream', () => {
      // Assert
      expect(new OnCounter({ topic: 'a' }).key).toBe(new OnCounter({ topic: 'a' }).key);
      expect(new OnAnyCounter().key).toBe(new OnAnyCounter().key);
    });

    it('a ordem em que o critério foi montado não muda a chave', () => {
      // Arrange
      class OnPair extends Subscription<CounterEvent, { topic: string; from: number }> {}

      // Assert
      expect(new OnPair({ topic: 'a', from: 1 }).key).toBe(new OnPair({ from: 1, topic: 'a' }).key);
    });

    it('um critério ausente e um undefined são o mesmo pedido', () => {
      // Assert
      expect(new OnCounter({}).key).toBe(new OnCounter({ topic: undefined }).key);
    });

    it('critérios diferentes têm chaves diferentes — inclusive null e ausente', () => {
      // Assert
      expect(new OnCounter({ topic: 'a' }).key).not.toBe(new OnCounter({ topic: 'b' }).key);
      expect(new OnCounter({ topic: null }).key).not.toBe(new OnCounter({}).key);
    });

    /**
     * O tipo entra na chave. Sem isso, duas subscriptions de eventos diferentes pedidas com o mesmo
     * critério (o vazio, por exemplo) colidiriam e dividiriam um stream só.
     */
    it('duas subscriptions de tipos diferentes não colidem no mesmo critério', () => {
      // Arrange
      class OnOther extends Subscription<CounterEvent, { topic?: string | null }> {}

      // Assert
      expect(new OnOther({ topic: 'a' }).key).not.toBe(new OnCounter({ topic: 'a' }).key);
    });
  });

  it('o critério fica acessível a quem o recebeu, como veio', () => {
    // Arrange
    const criteria = { topic: 'a' };

    // Assert
    expect(new OnCounter(criteria).criteria).toBe(criteria);
    expect(new OnAnyCounter().criteria).toBeUndefined();
  });
});
