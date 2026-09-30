import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { CpfSchema } from '../schemas/cpf.schema';

export class Cpf extends ValidatedDto.Scalar(CpfSchema) {
  get formatted(): string {
    return this.value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
}
