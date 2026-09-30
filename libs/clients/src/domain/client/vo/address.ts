import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import type { AddressInput } from '../schemas/address.schema';
import { AddressSchema } from '../schemas/address.schema';

export class Address extends ValidatedDto(AddressSchema) {
  static empty(): Address {
    return Address.parse({});
  }

  snapshot(): AddressInput {
    return {
      street: this.street,
      number: this.number,
      complement: this.complement,
      city: this.city,
      state: this.state,
      zipCode: this.zipCode,
    };
  }
}
