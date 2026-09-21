import { Payload } from '@nestjs/microservices';
import { TransportRequestPipe } from '../inbound/transport-request.pipe';

/**
 * **The request the message belongs to, as a parameter.** The other half of `@TransportEvent()`: one
 * gives the event, this one gives the `AsyncContext` it was published in — rebuilt from the envelope's
 * metadata by the application's {@link RequestContextCodec}.
 *
 * ```ts
 * @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
 * posts(@TransportEvent() event: DomainEvent, @TransportRequest() request?: AsyncContext): Promise<void> {
 *   return this.commandBus.execute(new CompletePost(event), request);   // the same request, across services
 * }
 * ```
 *
 * ## One typing detail, and it is Nest's
 * `@EventPattern` has an overload that types the handler from the pattern, and it constrains every
 * parameter after the first to `unknown` — so a method that takes the request as well needs
 * `@EventPattern<string>(...)`, which selects the plain `MethodDecorator` overload. Without it the
 * compiler reports `TS1241: Unable to resolve signature of method decorator`, which says nothing about
 * the real cause.
 *
 * It is `undefined` when the message carried no request, which is what a service publishing outside
 * one produces — and what a `{ scope: Scope.REQUEST }` handler must tolerate, because a message is not
 * an HTTP call.
 *
 * A controller that hands the event to {@link EventIngestion} does not need it: the ingestion decodes
 * the same context and publishes the event **with** it, so the handlers, the sagas and the commands a
 * saga dispatches are already in that request. This is for the controller that dispatches itself.
 */
export const TransportRequest = (): ParameterDecorator => Payload(TransportRequestPipe);
