import { z } from 'zod';

export const CPF_LENGTH = 11;

const checkDigit = (digits: string, weight: number): number => {
  const sum = [...digits.slice(0, weight - 1)].reduce(
    (total, digit, index) => total + Number(digit) * (weight - index),
    0,
  );
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
};

const hasValidCheckDigits = (digits: string): boolean =>
  !/^(\d)\1+$/.test(digits) &&
  checkDigit(digits, 10) === Number(digits[9]) &&
  checkDigit(digits, 11) === Number(digits[10]);

export const CpfSchema = z
  .string({ error: 'cpf must not be empty' })
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(
    z
      .string()
      .length(CPF_LENGTH, `cpf must have ${CPF_LENGTH} digits`)
      .refine(hasValidCheckDigits, 'cpf is not valid'),
  )
  .brand<'Cpf'>();
