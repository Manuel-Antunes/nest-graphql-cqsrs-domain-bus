import { Address } from './address';
import { ClientDetails } from './client-details';
import { Cpf } from './cpf';

describe('Cpf', () => {
  it('keeps the eleven digits of a valid CPF, however it was typed', () => {
    expect(Cpf.parse('529.982.247-25').value).toBe('52998224725');
    expect(Cpf.parse('52998224725').formatted).toBe('529.982.247-25');
  });

  it('refuses a CPF whose check digits do not add up', () => {
    expect(Cpf.safeParse('529.982.247-26').success).toBe(false);
  });

  it('refuses a CPF of one repeated digit, which passes the arithmetic', () => {
    expect(Cpf.safeParse('111.111.111-11').success).toBe(false);
  });

  it('refuses anything that is not eleven digits', () => {
    expect(Cpf.safeParse('5299822472').success).toBe(false);
  });
});

describe('ClientDetails', () => {
  const minimal = { name: 'Maria Oliveira', cpf: '529.982.247-25' };

  it('fills what was not said: a judgment creditor, alive, with every flag down', () => {
    const details = ClientDetails.parse(minimal);

    expect(details.kind.value).toBe('JUDGMENT_CREDITOR');
    expect(details.isDeceased).toBe(false);
    expect(details.rg).toBeNull();
    expect(details.hasRenounced).toBe(false);
  });

  it('refuses a death date without the client being deceased', () => {
    const result = ClientDetails.safeParse({
      ...minimal,
      deathDate: new Date('2020-01-01T00:00:00.000Z'),
    });

    expect(result.success).toBe(false);
  });

  it('refuses a death before the birth', () => {
    const result = ClientDetails.safeParse({
      ...minimal,
      isDeceased: true,
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      deathDate: new Date('1980-01-01T00:00:00.000Z'),
    });

    expect(result.success).toBe(false);
  });

  it('revises only what it is told to', () => {
    const revised = ClientDetails.parse(minimal).revisedWith({
      occupation: 'Teacher',
    });

    expect(revised.occupation).toBe('Teacher');
    expect(revised.name.value).toBe('Maria Oliveira');
    expect(revised.cpf.value).toBe('52998224725');
  });
});

describe('Address', () => {
  it('reads a blank line as no line at all', () => {
    expect(Address.parse({ city: '  ', state: 'PE' }).snapshot()).toEqual({
      street: null,
      number: null,
      complement: null,
      city: null,
      state: 'PE',
      zipCode: null,
    });
  });
});
