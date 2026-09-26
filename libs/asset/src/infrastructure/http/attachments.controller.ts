import type { Type } from '@nestjs/common';
import {
  applyDecorators,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';

import type { AttachmentRoute } from '../attachment.options';
import { AttachmentServer } from './attachment-server';

/**
 * `GET /attachments/:key/:name?variant=thumbnail` — `@jrmc/adonis-attachment`'s `router.attachments()`.
 * The key is an attachment's `keyId`; the name is only there for the URL to end in a file name; a
 * variant that does not exist yet is made before it is sent.
 *
 * Mounted by `AttachmentModule.forRoot({ route: { path, decorators } })`, under that path and with
 * those decorators — `AllowAnonymous()` is what lets it through a global guard.
 */
export class AttachmentsController {
  constructor(
    @Inject(AttachmentServer) private readonly server: AttachmentServer,
  ) {}

  /** The controller, mounted at the route's path and decorated with its decorators. */
  static at(route: AttachmentRoute): Type<AttachmentsController> {
    @Controller(route.path ?? 'attachments')
    @applyDecorators(...(route.decorators ?? []))
    class RoutedAttachmentsController extends AttachmentsController {}
    return RoutedAttachmentsController;
  }

  @Get([':key', ':key/:name'])
  async show(
    @Param('key') key: string,
    @Query('variant') variant?: string,
  ): Promise<StreamableFile> {
    const served = await this.server.serve(key, variant || undefined);
    if (!served) {
      throw new NotFoundException();
    }
    return new StreamableFile(served.stream, {
      type: served.mimeType,
      length: served.size,
      disposition: `inline; filename="${served.name}"`,
    });
  }
}
