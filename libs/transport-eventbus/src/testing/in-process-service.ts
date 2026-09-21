import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { INestMicroservice, ModuleMetadata } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';

/** A microservice running in this process, and the server a {@link MemoryClient} delivers to. */
export interface InProcessService {
  readonly app: INestMicroservice;
  readonly server: MemoryServer;
}

/**
 * **One service, started the way production starts it**, on
 * [`MemoryServer`](https://github.com/camcima/nestjs-memory-microservices) — so a spec exercises the
 * controllers, their guards, interceptors and filters, and not a method call.
 *
 * ## Why not `createTestingMicroservice` from that package
 * Because it starts the application with `init()`, and in Nest 12 `NestMicroservice.init()` runs the
 * bootstrap hooks **twice**: `super.init()` calls them, and the `registerModules()` that follows calls
 * them again when nothing has set its `wasInitHookCalled` flag. Twice through `onApplicationBootstrap`
 * is twice through the CQRS explorer, which binds every `@EventsHandler` twice — and the symptom is
 * every event handled twice, in a suite that is there to prove one delivery is one thing.
 *
 * `listen()` is the path `NestFactory.createMicroservice(...)` takes and it registers once, which is
 * both correct and the thing worth exercising.
 *
 * ## It also takes a module that is already compiled
 * Which is how a spec replaces a destination's client: `Test.createTestingModule({ imports: [AppModule]
 * }).overrideProvider(POST_EVENTS_CLIENT).useFactory(...)` and then `startInProcessService(module)`.
 */
export const startInProcessService = async (
  source: ModuleMetadata | TestingModule,
): Promise<InProcessService> => {
  const server = new MemoryServer();
  const module = isCompiled(source) ? source : await Test.createTestingModule(source).compile();
  const app = module.createNestMicroservice<MicroserviceOptions>({ strategy: server });

  await app.listen();

  return { app, server };
};

const isCompiled = (source: ModuleMetadata | TestingModule): source is TestingModule =>
  typeof (source as TestingModule).createNestMicroservice === 'function';
