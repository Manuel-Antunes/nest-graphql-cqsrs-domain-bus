import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { ClientIdentitySchema } from '../schemas/client-identity.schema';
import { SecurityIdentity } from './security-identity';

/**
 * **An OAuth client calling for itself** — a machine, through an access token of the client
 * credentials grant. It acts for no user and is member of no organization: it is bound to ONE, its
 * `activeOrganizationId`, the organization the client was registered for (its `referenceId`), and may
 * do what its scopes grant there and nothing that asks for a user or a member.
 */
export class ClientIdentity extends SecurityIdentity(
  ValidatedDto(ClientIdentitySchema),
) {
  get principal(): string {
    return this.clientId;
  }
}
