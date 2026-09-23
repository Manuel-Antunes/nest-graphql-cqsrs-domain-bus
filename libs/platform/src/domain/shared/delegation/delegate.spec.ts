import { BrokenDelegationException } from './broken-delegation.exception';
import { Delegate } from './delegate';

class Party {
  constructor(readonly name: string) {}

  greet(): string {
    return `hi, ${this.name}`;
  }
}

class Ledger {
  readonly entries: string[] = [];

  constructor(readonly owner: Party) {}

  record(entry: string): void {
    this.entries.push(entry);
  }

  get total(): number {
    return this.entries.length;
  }
}

class Diary {
  constructor(readonly owner: Party) {}

  note(what: string): string {
    return `noted: ${what}`;
  }
}

const Accountable = Delegate(Party, {
  name: 'Accountable',
  to: Ledger,
  as: 'ledger',
  from: 'owner',
  forwarding: ['record', 'total'],
});

const Noting = Delegate(Party, {
  name: 'Noting',
  to: Diary,
  as: 'diary',
  from: 'owner',
  forwarding: ['note'],
});

describe('Delegate', () => {
  it('forwards a method to the delegate, arguments and all', () => {
    const party = new Party('manuel');
    const ledger = new Ledger(party);

    Accountable.cast(party, ledger).record('first');

    expect(ledger.entries).toEqual(['first']);
  });

  it('forwards a getter as a getter, not as a method', () => {
    const subject = new Party('manuel');
    const ledger = new Ledger(subject);
    const party = Accountable.cast(subject, ledger);

    ledger.record('first');

    expect(party.total).toBe(1);
  });

  it('casting keeps the same object and everything the subject already did', () => {
    const subject = new Party('manuel');

    const party = Accountable.cast(subject, new Ledger(subject));

    expect(party).toBe(subject);
    expect(party.greet()).toBe('hi, manuel');
    expect(party.name).toBe('manuel');
  });

  it('the cast object is an instance of both the delegating class and the subject', () => {
    const subject = new Party('manuel');

    const party = Accountable.cast(subject, new Ledger(subject));

    expect(party).toBeInstanceOf(Accountable);
    expect(party).toBeInstanceOf(Party);
    expect(new Party('outro')).not.toBeInstanceOf(Accountable);
  });

  it('the delegate hangs on the declared property, without becoming state of the subject', () => {
    const subject = new Party('manuel');
    const ledger = new Ledger(subject);

    const party = Accountable.cast(subject, ledger);

    expect(party.ledger).toBe(ledger);
    expect(Object.keys(party)).not.toContain('ledger');
    expect(JSON.parse(JSON.stringify(party))).toEqual({ name: 'manuel' });
  });

  it('the constructor keeps pointing at the subject, so whoever looks it up finds the subject', () => {
    const subject = new Party('manuel');

    const party = Accountable.cast(subject, new Ledger(subject));

    expect(party.constructor).toBe(Party);
    expect(Accountable.name).toBe('Accountable');
  });

  it('over builds the same class for the same base, and a new one on top of another', () => {
    expect(Accountable.delegation.over(Party)).toBe(Accountable);
    expect(Accountable.delegation.over(Party)).toBe(
      Accountable.delegation.over(Party),
    );

    const both = Noting.delegation.over(Accountable);

    expect(both).not.toBe(Noting);
    expect(both.prototype).toBeInstanceOf(Accountable);
  });

  it('stacking two delegations answers for both', () => {
    const both = Noting.delegation.over(Accountable);
    const subject = new Party('manuel');
    Accountable.delegation.attach(subject, new Ledger(subject));
    Noting.delegation.attach(subject, new Diary(subject));
    Object.setPrototypeOf(subject, both.prototype);

    const party = subject as InstanceType<typeof Accountable> &
      InstanceType<typeof Noting>;
    party.record('first');

    expect(party.note('later')).toBe('noted: later');
    expect(party.total).toBe(1);
    expect(party).toBeInstanceOf(Accountable);
  });

  describe('resolvendo o sujeito a partir do delegado', () => {
    it('resolves the delegate into the cast subject, following the declared back-reference', () => {
      const subject = new Party('manuel');
      const ledger = new Ledger(subject);

      const party = Accountable.delegation.resolve(ledger) as InstanceType<
        typeof Accountable
      >;

      expect(party).toBe(subject);
      expect(party).toBeInstanceOf(Accountable);
      expect(party.total).toBe(0);
    });

    it('resolving twice lands on the same object: casting is idempotent', () => {
      const subject = new Party('manuel');
      const ledger = new Ledger(subject);

      expect(Accountable.delegation.resolve(ledger)).toBe(
        Accountable.delegation.resolve(ledger),
      );
    });
  });

  describe('the contract, checked when the mixin is built', () => {
    it('refuses a forwarding key the delegate does not declare', () => {
      class Wallet {
        constructor(readonly owner: Party) {}
      }

      expect(() =>
        Delegate(Party, {
          name: 'Broken',
          to: Wallet,
          as: 'wallet',
          from: 'owner',
          forwarding: ['settle' as keyof Wallet],
        }),
      ).toThrow(BrokenDelegationException);
    });

    it('refuses a delegate that already backs another delegation', () => {
      expect(() =>
        Delegate(Party, {
          name: 'Twice',
          to: Ledger,
          as: 'other',
          from: 'owner',
          forwarding: ['record'],
        }),
      ).toThrow(/already backs a delegation/);
    });
  });
});
