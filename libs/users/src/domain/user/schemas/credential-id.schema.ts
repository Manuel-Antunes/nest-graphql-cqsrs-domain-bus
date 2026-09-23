import { z } from 'zod';

export const CREDENTIAL_ID_MAX_LENGTH = 64;

export const CredentialIdSchema = z
  .string({ error: 'id da credencial não pode ser vazio' })
  .trim()
  .min(1, 'id da credencial não pode ser vazio')
  .max(
    CREDENTIAL_ID_MAX_LENGTH,
    `id da credencial excede ${CREDENTIAL_ID_MAX_LENGTH} caracteres`,
  )
  .brand<'CredentialId'>();
