import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/** O tamanho da coluna de id das tabelas de autenticação — ver `defineBetterAuthEntities`. */
export const CREDENTIAL_ID_MAX_LENGTH = 64;

/**
 * O id de **quem autenticou**, como o provedor de identidade o conhece (`authUser.id`, no Better
 * Auth). É o que a sessão carrega, e é por ele que a borda encontra o perfil de domínio.
 *
 * Opaco de propósito: o formato é do provedor, não nosso — trocar o Better Auth por outra coisa troca
 * o conteúdo desta string e nada mais. Por isso a única invariante é ser um texto não vazio que caiba
 * na coluna; nada de uuid, que é uma promessa que não é nossa para fazer.
 */
export class CredentialId extends ValidatedDto.Scalar(
  z
    .string({ error: 'id da credencial não pode ser vazio' })
    .trim()
    .min(1, 'id da credencial não pode ser vazio')
    .max(CREDENTIAL_ID_MAX_LENGTH, `id da credencial excede ${CREDENTIAL_ID_MAX_LENGTH} caracteres`)
    .brand<'CredentialId'>(),
) {}
