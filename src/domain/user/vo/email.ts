import { ValidatedDto } from '../../../validated-dto/mixins';
import { EmailSchema } from '../schemas/email.schema';

export class Email extends ValidatedDto.Scalar(EmailSchema) {
  get domain(): string {
    return this.value.split('@')[1];
  }
}
