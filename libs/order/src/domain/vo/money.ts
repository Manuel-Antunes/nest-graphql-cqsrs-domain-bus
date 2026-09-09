import { z } from 'zod';

/** Valor em centavos: inteiro e positivo. Dinheiro em ponto flutuante não é dinheiro. */
export const Amount = z.int().positive({ error: 'amount precisa ser um inteiro positivo (centavos)' }).brand<'Amount'>();
export type Amount = z.infer<typeof Amount>;

/** Acima disso o adquirente recusa — a regra determinística que dá ao teste um caminho de recusa. */
export const AUTHORIZATION_LIMIT = 100_000;
