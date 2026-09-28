import type { ProcessingContext } from '../unit-of-work/processing-context';
import type { Message } from './message';

/** The rest of the dispatch chain, from one interceptor's point of view. */
export interface MessageDispatchInterceptorChain<M extends Message = Message> {
  proceed(message: M, context: ProcessingContext | undefined): M;
}

/**
 * **What sees every message as it is dispatched** — Axon 5's `MessageDispatchInterceptor`: an event
 * as it is published, a command as it is sent. It may change the message — add metadata, most of the
 * time — and hands it on with `chain.proceed`.
 *
 * It runs **synchronously**, at the moment of dispatch: an `aggregate.commit()` is not awaited by
 * anybody, and what it publishes must be what it staged, not what a promise decides later. The
 * context is the one the dispatcher runs in, `undefined` outside any unit of work.
 *
 * ```ts
 * @Injectable()
 * export class StampRegion implements MessageDispatchInterceptor {
 *   interceptOnDispatch(message: Message, context: ProcessingContext | undefined, chain: MessageDispatchInterceptorChain) {
 *     return chain.proceed(message.andMetadata({ region: 'eu' }), context);
 *   }
 * }
 * ```
 */
export interface MessageDispatchInterceptor<M extends Message = Message> {
  interceptOnDispatch(
    message: M,
    context: ProcessingContext | undefined,
    chain: MessageDispatchInterceptorChain<M>,
  ): M;
}

/** The rest of the handling chain, from one interceptor's point of view. */
export interface MessageHandlerInterceptorChain<M extends Message = Message> {
  proceed(message: M, context: ProcessingContext): Promise<unknown>;
}

/**
 * **What sees every message as it is handled** — Axon 5's `MessageHandlerInterceptor`: a command in
 * its unit of work, an event delivered to the subscribing handlers, an event a transport delivered, an
 * event a streaming processing group receives from the outbox. It may hand the chain a different
 * message, or a branch of the context holding something the handlers should see — which is how the
 * correlation data of the message being handled reaches whatever its handler dispatches.
 */
export interface MessageHandlerInterceptor<M extends Message = Message> {
  interceptOnHandle(
    message: M,
    context: ProcessingContext,
    chain: MessageHandlerInterceptorChain<M>,
  ): Promise<unknown>;
}

/** Builds the chains, the first interceptor outermost — as Axon builds them. */
export class InterceptorChains {
  static dispatch<M extends Message>(
    interceptors: readonly MessageDispatchInterceptor<M>[],
    message: M,
    context: ProcessingContext | undefined,
  ): M {
    const at = (index: number): MessageDispatchInterceptorChain<M> => ({
      proceed: (current, currentContext) =>
        index < interceptors.length
          ? interceptors[index].interceptOnDispatch(
              current,
              currentContext,
              at(index + 1),
            )
          : current,
    });
    return at(0).proceed(message, context);
  }

  static handle<M extends Message>(
    interceptors: readonly MessageHandlerInterceptor<M>[],
    message: M,
    context: ProcessingContext,
    handler: (message: M, context: ProcessingContext) => Promise<unknown>,
  ): Promise<unknown> {
    const at = (index: number): MessageHandlerInterceptorChain<M> => ({
      proceed: async (current, currentContext) =>
        index < interceptors.length
          ? interceptors[index].interceptOnHandle(
              current,
              currentContext,
              at(index + 1),
            )
          : handler(current, currentContext),
    });
    return at(0).proceed(message, context);
  }
}
