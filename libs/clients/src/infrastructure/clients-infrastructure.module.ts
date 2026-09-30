import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { ClientRepository } from '../domain/client/client.repository';
import { ClientEntitySchema } from './persistence/entities/client-orm.entity';
import { MikroOrmClientRepository } from './persistence/repositories/mikro-orm-client.repository';

export const clientsEntities = [ClientEntitySchema];

@Module({
  imports: [DatabaseModule.forFeature(clientsEntities)],
  providers: [
    { provide: ClientRepository, useClass: MikroOrmClientRepository },
  ],
  exports: [ClientRepository],
})
export class ClientsInfrastructureModule {}
