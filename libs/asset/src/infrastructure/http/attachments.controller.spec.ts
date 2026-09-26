import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable, UseInterceptors } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { DatabaseModule, MikroORM } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';

import { Attachment } from '../../domain/asset/attachment';
import { AttachmentModule } from '../attachment.module';
import {
  ATTACHMENT_TEST_ENTITIES,
  TestPostSchema,
  UppercaseConverter,
} from '../testing/attachment-test-entities';
import { TestDisks } from '../testing/test-disks';

@Injectable()
class MarkedRoute implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<FastifyReply>()
      .header('x-route', 'attachments');
    return next.handle();
  }
}

describe('the attachments route', () => {
  let app: NestFastifyApplication;
  let orm: AnyMikroORM;

  const get = (url: string) =>
    app.getHttpAdapter().getInstance().inject({ method: 'GET', url });

  const insertPost = async (cover: Attachment) => {
    const em = orm.em.fork();
    const post = em.create(
      TestPostSchema as never,
      {
        title: 'route',
        cover,
      } as never,
    ) as any;
    await em.persist(post).flush();
    return post;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({
          ...testDatabaseConfig(
            { entities: ATTACHMENT_TEST_ENTITIES as never[] },
            'asset_route',
          ),
          exclusive: true,
        }),
        TestSchemaModule.forRoot(),
        TestDisks.module(),
        AttachmentModule.forRoot({
          secret: 'route-secret',
          converters: { upper: new UppercaseConverter() },
          route: { path: 'files', decorators: [UseInterceptors(MarkedRoute)] },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ maxParamLength: 1024 }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    orm = app.get(MikroORM);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves an attachment by its key id, under the path and decorators it was given', async () => {
    const post = await insertPost(
      await Attachment.fromBuffer(Buffer.from('hello'), 'hello.txt'),
    );

    const response = await get(`/files/${post.cover.keyId}/hello.txt`);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['x-route']).toBe('attachments');
    expect(response.body).toBe('hello');
  });

  it('makes the variant it is asked for, and serves it', async () => {
    const post = await insertPost(
      await Attachment.fromBuffer(Buffer.from('quiet'), 'quiet.txt'),
    );

    const response = await get(`/files/${post.cover.keyId}?variant=upper`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('QUIET');
  });

  it('answers 404 for a key id it did not seal, or a variant nothing makes', async () => {
    const post = await insertPost(
      await Attachment.fromBuffer(Buffer.from('x'), 'x.txt'),
    );

    expect((await get('/files/forged')).statusCode).toBe(404);
    expect(
      (await get(`/files/${post.cover.keyId}?variant=unknown`)).statusCode,
    ).toBe(404);
  });
});
