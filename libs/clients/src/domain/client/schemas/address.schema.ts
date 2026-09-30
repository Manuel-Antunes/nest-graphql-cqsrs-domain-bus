import { z } from 'zod';

export const ADDRESS_FIELD_MAX_LENGTH = 200;

const AddressLineSchema = z
  .string()
  .trim()
  .max(
    ADDRESS_FIELD_MAX_LENGTH,
    `exceeds ${ADDRESS_FIELD_MAX_LENGTH} characters`,
  )
  .nullish()
  .transform((line) => line || null);

export const AddressSchema = z.object({
  street: AddressLineSchema,
  number: AddressLineSchema,
  complement: AddressLineSchema,
  city: AddressLineSchema,
  state: AddressLineSchema,
  zipCode: AddressLineSchema,
});

export type AddressInput = z.input<typeof AddressSchema>;
