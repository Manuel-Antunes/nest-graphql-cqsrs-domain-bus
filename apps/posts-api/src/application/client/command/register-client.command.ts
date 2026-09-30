import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Client } from '@nestposts/clients/domain/client/client.entity';
import { ClientRepository } from '@nestposts/clients/domain/client/client.repository';
import type { Address } from '@nestposts/clients/domain/client/vo/address';
import type { ClientDetails } from '@nestposts/clients/domain/client/vo/client-details';
import type { ClientId } from '@nestposts/clients/domain/client/vo/client-id';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { ClientRequest } from '../client-request';

export namespace RegisterClientCommand {
  export class RegisterClient extends Command<ClientId> {
    constructor(
      readonly clientId: ClientId,
      readonly details: ClientDetails,
      readonly address: Address,
      readonly registeredBy: User | null,
    ) {
      super();
    }
  }

  @CommandHandler(RegisterClient, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<RegisterClient> {
    constructor(
      private readonly clients: ClientRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: ClientRequest,
    ) {}

    async execute({
      clientId,
      details,
      address,
      registeredBy,
    }: RegisterClient): Promise<ClientId> {
      const client = this.publisher.mergeObjectContext(
        Client.register(clientId, details, address, registeredBy, new Date()),
        this.request,
      );
      await this.clients.save(client);
      client.commit();
      return client.id;
    }
  }
}
