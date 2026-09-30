import type { ClientId } from '../vo/client-id';

export class ClientNotFoundException extends Error {
  constructor(readonly clientId: ClientId) {
    super(`client ${clientId} does not exist`);
    this.name = 'ClientNotFoundException';
  }
}
