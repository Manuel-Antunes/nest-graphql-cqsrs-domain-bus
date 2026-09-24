import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ModulesContainer } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NOTIFICATIONS_NAMESPACE } from '@nestposts/notifications/domain/notifications.namespace';
import { registeredEventTypes } from '@nestposts/platform/domain/shared/event-type';
import { POSTS_NAMESPACE } from '@nestposts/posts/domain/post/event/posts.namespace';
import { OutboxRouting } from '@nestposts/transport-eventbus';

import { AppModule } from '../src/app.module';

const SOURCE = join(process.cwd(), 'src');

const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(directory, entry.name))
      : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
        ? [join(directory, entry.name)]
        : [],
  );

const providersOf = (container: ModulesContainer): Set<string> => {
  const names = new Set<string>();
  for (const module of container.values()) {
    for (const provider of module.providers.values()) {
      if (provider.metatype?.name) {
        names.add(provider.metatype.name);
      }
    }
  }
  return names;
};

describe('the wiring that fails silently', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await module.init();
  });

  afterAll(() => module.close());

  it('registers every event handler and saga the application layer declares', async () => {
    const declared: string[] = [];
    for (const file of filesUnder(join(SOURCE, 'application'))) {
      const exported = (await import(file)) as Record<string, unknown>;
      const source = Object.values(exported);
      for (const candidate of source) {
        if (typeof candidate !== 'function') {
          continue;
        }
        const listens =
          Reflect.getMetadata('__eventsHandler__', candidate) !== undefined ||
          Object.getOwnPropertyNames(candidate.prototype ?? {}).some(
            (member) =>
              Reflect.getMetadata('__saga__', candidate.prototype, member) !==
              undefined,
          );
        if (listens) {
          declared.push(candidate.name);
        }
      }
    }
    const registered = providersOf(module.get(ModulesContainer));

    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => !registered.has(name))).toEqual([]);
  });

  it('gives every event of the post lifecycle a name on the wire', () => {
    const names = registeredEventTypes()
      .filter((metadata) => metadata.namespace === 'posts')
      .map((metadata) => metadata.qualifiedName)
      .sort();

    expect(names).toEqual([
      'posts.PostCreated',
      'posts.PostDeleted',
      'posts.PostPreCreated',
      'posts.PostRestored',
      'posts.PostUpdated',
    ]);
  });

  it('publishes the posts and the notifications namespaces, and only them', () => {
    expect(module.get(OutboxRouting).describe()).toEqual([
      `PostEventsPublisher ← [${POSTS_NAMESPACE}, ${NOTIFICATIONS_NAMESPACE}]`,
    ]);
  });
});
