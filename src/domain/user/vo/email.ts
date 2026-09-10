import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/**
 * O email de um User. É a **chave de ligação de contas**: quando um token novo chega com um email que
 * já existe localmente, o `UserProvisioning` liga a credencial ao perfil que já está lá em vez de
 * criar outro. Por isso ele é normalizado (trim + lowercase) antes de virar valor: `Manuel@X.com` e
 * `manuel@x.com` são o mesmo `Email` — e o `equals` do value object diz exatamente isso.
 */
export class Email extends ValidatedDto.Scalar(
  z.string().trim().toLowerCase().pipe(z.email('email inválido')).brand<'Email'>(),
) {
  /** O domínio do email, depois do `@`. */
  get domain(): string {
    return this.value.split('@')[1];
  }
}
