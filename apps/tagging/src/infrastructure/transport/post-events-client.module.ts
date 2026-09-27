import { Module } from '@nestjs/common';
import { Inngest } from 'inngest';

import type { AppConfig } from '../../config/app.config';
import { appConfig } from '../../config/app.config';
import type { InngestConfig } from '../../config/inngest.config';
import { inngestConfig } from '../../config/inngest.config';
import { PostEventsClient } from './post-events.client';

@Module({
  providers: [
    {
      provide: Inngest,
      inject: [appConfig.KEY, inngestConfig.KEY],
      useFactory: (app: AppConfig, { client }: InngestConfig) =>
        new Inngest({ id: app.name, ...client }),
    },
    {
      provide: PostEventsClient,
      inject: PostEventsClient.inject,
      useFactory: PostEventsClient.create,
    },
  ],
  exports: [Inngest, PostEventsClient],
})
export class PostEventsClientModule {}
