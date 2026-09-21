import { Injectable, type PipeTransform } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { IncomingRequest } from './incoming-request';

/**
 * **The step that turns the message's metadata back into the request it belongs to** — what
 * `@TransportRequest()` binds to the parameter.
 *
 * The envelope carries what the request *stands for* (a correlation id, a causation id, and whatever
 * the application's `RequestContextCodec` declares in `toAttributes()`), and {@link IncomingRequest}
 * is where that becomes an `AsyncContext` again. Unlike {@link TransportEventPipe} this one has a
 * dependency — the codec is the application's, because what a request means is — and being a provider
 * is how it gets it: Nest resolves a class pipe through the container.
 *
 * A guard cannot use this, because a pipe runs after the guards: it injects {@link IncomingRequest}
 * and reads the same request off the `ExecutionContext`.
 *
 * A controller can then dispatch in the request that opened it, on the other side of the wire:
 *
 * ```ts
 * @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
 * posts(@TransportEvent() event: DomainEvent, @TransportRequest() request?: AsyncContext) {
 *   return this.commandBus.execute(new DoSomething(event), request);
 * }
 * ```
 */
@Injectable()
export class TransportRequestPipe implements PipeTransform<unknown, AsyncContext | undefined> {
  constructor(private readonly incoming: IncomingRequest) {}

  transform(value: unknown): AsyncContext | undefined {
    return this.incoming.from(value);
  }
}
