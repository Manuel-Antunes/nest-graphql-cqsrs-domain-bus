import { Controller, Get, Header } from '@nestjs/common';

import { Supergraph } from './supergraph';

@Controller()
export class SupergraphSchemaController {
  constructor(private readonly supergraph: Supergraph) {}

  @Get('graphql/schema.graphql')
  @Header('content-type', 'text/plain; charset=utf-8')
  apiSchema(): string {
    return this.supergraph.apiSchema();
  }
}
