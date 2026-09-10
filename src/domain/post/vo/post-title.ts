import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

export const POST_TITLE_MAX_LENGTH = 200;

/**
 * Título do Post. A invariante ("não vazio, no máximo 200 caracteres") e a normalização (`trim`)
 * moram no schema, não espalhadas pela entidade ou pelos handlers; a classe é o value object que sai
 * dele — só o `parse` produz um, então um `PostTitle` que existe é sempre válido.
 */
export class PostTitle extends ValidatedDto.Scalar(
  z
    .string({ error: 'title não pode ser vazio' })
    .trim()
    .min(1, 'title não pode ser vazio')
    .max(POST_TITLE_MAX_LENGTH, `title excede ${POST_TITLE_MAX_LENGTH} caracteres`)
    .brand<'PostTitle'>(),
) {
  /** O tamanho do título. Pergunta do valor, respondida pelo valor. */
  get length(): number {
    return this.value.length;
  }
}
