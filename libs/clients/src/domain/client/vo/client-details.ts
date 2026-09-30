import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import type { ClientDetailsInput } from '../schemas/client-details.schema';
import { ClientDetailsSchema } from '../schemas/client-details.schema';

export class ClientDetails extends ValidatedDto(ClientDetailsSchema) {
  revisedWith(changes: Partial<ClientDetailsInput>): ClientDetails {
    return ClientDetails.parse({ ...this.snapshot(), ...changes });
  }

  snapshot(): ClientDetailsInput {
    return {
      name: this.name.value,
      kind: this.kind.value,
      cpf: this.cpf.value,
      rg: this.rg,
      birthDate: this.birthDate,
      deathDate: this.deathDate,
      isDeceased: this.isDeceased,
      occupation: this.occupation,
      unionMembership: this.unionMembership,
      notes: this.notes,
      hasPendingLitigation: this.hasPendingLitigation,
      hasRenounced: this.hasRenounced,
      isQualified: this.isQualified,
      documentationComplete: this.documentationComplete,
    };
  }
}
