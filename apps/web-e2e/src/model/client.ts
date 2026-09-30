import { Unique } from '../support/unique';

export interface ClientDraft {
  readonly name: string;
  /** Eleven digits whose check digits add up: the platform refuses any other. */
  readonly cpf: string;
}

export interface ContactDraft {
  readonly name: string;
  readonly email: string;
}

/**
 * A client nobody else in the run has: the name carries the run's suffix, and the CPF is drawn at
 * random with its two check digits computed, because a CPF is one client per organization.
 */
export class ClientDrafts {
  static fresh(name: string): ClientDraft {
    return { name: `${name} ${Unique.suffix()}`, cpf: ClientDrafts.cpf() };
  }

  static contactOf(client: ClientDraft): ContactDraft {
    return {
      name: `${client.name} on WhatsApp`,
      email: `contact-${Unique.suffix()}@example.com`,
    };
  }

  static cpf(): string {
    const base = Array.from({ length: 9 }, (_, index) =>
      index === 0
        ? 1 + Math.floor(Math.random() * 9)
        : Math.floor(Math.random() * 10),
    );
    const first = ClientDrafts.checkDigit(base);
    const second = ClientDrafts.checkDigit([...base, first]);
    return [...base, first, second].join('');
  }

  static formatted(cpf: string): string {
    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  private static checkDigit(digits: readonly number[]): number {
    const weight = digits.length + 1;
    const sum = digits.reduce(
      (total, digit, index) => total + digit * (weight - index),
      0,
    );
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  }
}
