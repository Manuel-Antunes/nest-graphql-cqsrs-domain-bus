import 'server-only';

import { Module } from '@nestjs/common';
import { Inngest } from 'inngest';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { InngestConfig } from './config/inngest.config';
import { inngestConfig } from './config/inngest.config';
import { WebEventsClient } from './web-events.client';

@Module({
  providers: [
    {
      provide: Inngest,
      inject: [appConfig.KEY, inngestConfig.KEY],
      useFactory: (app: AppConfig, { client }: InngestConfig) =>
        new Inngest({ id: app.name, ...client }),
    },
    {
      provide: WebEventsClient,
      inject: WebEventsClient.inject,
      useFactory: WebEventsClient.create,
    },
  ],
  exports: [Inngest, WebEventsClient],
})
export class WebEventsClientModule {}
