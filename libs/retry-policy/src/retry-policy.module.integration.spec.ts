/**
 * Integration test for `RetryPolicyModule.forRoot(...)` as the APP ROOT wires
 * it, over a real NestJS microservice (in-memory transport).
 *
 * What it guards is the invariant the configurable module rests on: the feature
 * module that declares the controller does NOT import `RetryPolicyModule` — it
 * can't, only the composition root knows which transport's `exceptionProducer`
 * to pass. Nest still instantiates `MaxRetriesInterceptor` / `MaxRetriesFilter`
 * in THAT module's context (enhancers are resolved from the declaring module's
 * injectables), so they only resolve `EXCEPTION_PRODUCER` / `MAX_RETRIES`
 * because the root registration is GLOBAL. Import it non-globally and this
 * spec fails at boot with "Nest can't resolve dependencies of MaxRetriesFilter"
 * — which is exactly the production wiring of `events-processor`,
 * `natasha-runner` and `email-companion-runner`.
 *
 * The transport stand-in mirrors the sibling controller specs: `MemoryServer`
 * has no redelivery, so the producer re-emits the event to simulate SQS's
 * `ApproximateReceiveCount++` while reusing the same base
 * `ExceptionProducer.produceException` policy production runs.
 */

import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import { Controller, type INestMicroservice, Module } from '@nestjs/common';
import type { RpcArgumentsHost } from '@nestjs/common/internal';
import {
  EventPattern,
  type MicroserviceOptions,
  Payload,
} from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExceptionProducer } from './base-exeception-producer';
import { RetryPolicy } from './decorators/retry-policy.decorator';
import {
  EXCEPTION_PRODUCER,
  MAX_RETRIES,
  RetryPolicyModule,
} from './retry-policy.module';

const RETRY_PATTERN = 'test.retry-policy-module.flaky';

/** Payload shape — carries the pattern so the producer can re-emit it. */
interface RetryJob {
  pattern: string;
}

const retryState: {
  invocations: number;
  skipped: number;
  onSkip?: () => void;
} = { invocations: 0, skipped: 0 };

/**
 * In-memory stand-in for a transport producer: counts attempts per pattern and
 * re-emits the event (the `MemoryServer` won't redeliver on its own).
 */
class MemoryRetrySimulatorProducer extends ExceptionProducer {
  private readonly attempts = new Map<string, number>();

  constructor(private readonly memory: MemoryServer) {
    super();
  }

  getRetryCountFromContext(host: RpcArgumentsHost): number {
    return this.attempts.get(host.getData<RetryJob>().pattern) ?? 0;
  }

  protected commitOffset(): Promise<void> {
    return Promise.resolve();
  }

  protected handleNonRetryableException(): unknown {
    return undefined;
  }

  protected handleRetryAfterException(): unknown {
    return undefined;
  }

  protected handleGenericException(
    _exception: unknown,
    host: RpcArgumentsHost,
  ): unknown {
    const job = host.getData<RetryJob>();
    this.attempts.set(job.pattern, (this.attempts.get(job.pattern) ?? 0) + 1);
    // Defer the re-emit so the current delivery's filter chain finishes first
    // (mirrors SQS redelivering on a later poll, not re-entrantly).
    setImmediate(() => {
      void this.memory.emit(job.pattern, job);
    });
    return undefined;
  }
}

@Controller()
class FlakyRetryController {
  @EventPattern(RETRY_PATTERN)
  @RetryPolicy({
    maxRetries: 2,
    skipHandler: async () => {
      retryState.skipped += 1;
      retryState.onSkip?.();
    },
  })
  async handle(@Payload() _job: RetryJob): Promise<void> {
    retryState.invocations += 1;
    throw new Error('flaky handler always fails');
  }
}

/**
 * The feature module, wired exactly like `LegalMsModule` / `NatashaModule`:
 * it opts its handler into the policy but imports NOTHING to get it.
 */
@Module({ controllers: [FlakyRetryController] })
class FlakyFeatureModule {}

describe('RetryPolicyModule.forRoot (app-root wiring)', () => {
  let memory: MemoryServer;
  let moduleRef: TestingModule;
  let microservice: INestMicroservice;
  let producer: MemoryRetrySimulatorProducer;

  beforeAll(async () => {
    memory = new MemoryServer();
    producer = new MemoryRetrySimulatorProducer(memory);

    moduleRef = await Test.createTestingModule({
      imports: [
        RetryPolicyModule.forRoot({
          exceptionProducer: producer,
          defaultMaxRetries: 7,
        }),
        FlakyFeatureModule,
      ],
    }).compile();

    microservice = moduleRef.createNestMicroservice<MicroserviceOptions>({
      strategy: memory,
    });
    await microservice.listen();
  });

  afterAll(async () => {
    await microservice?.close();
    await moduleRef?.close();
  });

  it('applies the policy to a controller whose module never imported it', async () => {
    retryState.invocations = 0;
    retryState.skipped = 0;
    const skipped = new Promise<void>((resolve) => {
      retryState.onSkip = resolve;
    });

    await memory.emit(RETRY_PATTERN, { pattern: RETRY_PATTERN });
    await skipped;
    // Settle any trailing microtasks/setImmediate before asserting.
    await new Promise((r) => setImmediate(r));

    // @RetryPolicy maxRetries=2 ⇒ 3 total deliveries (attempts 0,1 retry; 2 skips).
    expect(retryState.invocations).toBe(3);
    expect(retryState.skipped).toBe(1);
  }, 30_000);

  it('publishes the options it was given as EXCEPTION_PRODUCER / MAX_RETRIES', () => {
    expect(moduleRef.get(EXCEPTION_PRODUCER, { strict: false })).toBe(producer);
    // The fallback for handlers that don't set one via `@RetryPolicy`.
    expect(moduleRef.get(MAX_RETRIES, { strict: false })).toBe(7);
  });
});
