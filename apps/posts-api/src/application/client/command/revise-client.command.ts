import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { ClientRepository } from '@nestposts/clients/domain/client/client.repository';
import { ClientNotFoundException } from '@nestposts/clients/domain/client/exception/client-not-found.exception';
import type { AddressInput } from '@nestposts/clients/domain/client/schemas/address.schema';
import type { ClientDetailsInput } from '@nestposts/clients/domain/client/schemas/client-details.schema';
import { Address } from '@nestposts/clients/domain/client/vo/address';
import type { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import type { ClientStatus } from '@nestposts/clients/domain/client/vo/client-status';

import { ClientRequest } from '../client-request';

export namespace ReviseClientCommand {
  export interface Changes {
    readonly details?: Partial<ClientDetailsInput>;
    readonly address?: AddressInput;
    readonly status?: ClientStatus;
  }

  export class ReviseClient extends Command<void> {
    constructor(
      readonly clientId: ClientId,
      readonly changes: Changes,
    ) {
      super();
    }
  }

  @CommandHandler(ReviseClient, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<ReviseClient> {
    constructor(
      private readonly clients: ClientRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: ClientRequest,
    ) {}

    async execute({ clientId, changes }: ReviseClient): Promise<void> {
      const client = await this.clients.findById(clientId);
      if (!client) {
        throw new ClientNotFoundException(clientId);
      }
      this.publisher.mergeObjectContext(client, this.request).revise(
        {
          details:
            changes.details && client.details.revisedWith(changes.details),
          address:
            changes.address &&
            Address.parse({ ...client.address.snapshot(), ...changes.address }),
          status: changes.status,
        },
        new Date(),
      );
      await this.clients.save(client);
      client.commit();
    }
  }
}
