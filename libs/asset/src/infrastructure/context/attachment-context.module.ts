import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AttachmentContextInterceptor } from './attachment-context.interceptor';
import { AttachmentContextMiddleware } from './attachment-context.middleware';

/** Opens the ambient `AttachmentContext` on every HTTP request, and on every handler call. */
@Module({
  providers: [
    AttachmentContextMiddleware,
    { provide: APP_INTERCEPTOR, useClass: AttachmentContextInterceptor },
  ],
})
export class AttachmentContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AttachmentContextMiddleware).forRoutes('*splat');
  }
}
