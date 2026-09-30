import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { ClientRepository } from '@nestposts/clients/domain/client/client.repository';
import { ClientNotFoundException } from '@nestposts/clients/domain/client/exception/client-not-found.exception';
import type { ClientId } from '@nestposts/clients/domain/client/vo/client-id';

import { ClientRequest } from '../client-request';

export namespace RemoveClientCommand {
  export class RemoveClient extends Command<void> {
    constructor(readonly clientId: ClientId) {
      super();
    }
  }

  @CommandHandler(RemoveClient, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<RemoveClient> {
    constructor(
      private readonly clients: ClientRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: ClientRequest,
    ) {}

    async execute({ clientId }: RemoveClient): Promise<void> {
      const client = await this.clients.findById(clientId);
      if (!client) {
        throw new ClientNotFoundException(clientId);
      }
      this.publisher
        .mergeObjectContext(client, this.request)
        .remove(new Date());
      await this.clients.remove(client);
      client.commit();
    }
  }
}
