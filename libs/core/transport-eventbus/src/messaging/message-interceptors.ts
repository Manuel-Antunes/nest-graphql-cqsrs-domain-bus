import type { ProcessingContext } from '../unit-of-work/processing-context';
import type {
  MessageDispatchInterceptor,
  MessageHandlerInterceptor,
} from './interception';
import { InterceptorChains } from './interception';
import type { Message } from './message';

/**
 * **The application's interceptors, in the order they run** — Axon 5's dispatch and handler
 * interceptor registries, resolved. `TransportEventBusModule` builds it: `CorrelationDataInterceptor`
 * first, then the trace, then whatever the application declared in `dispatchInterceptors` and
 * `handlerInterceptors`.
 */
export class MessageInterceptors {
  constructor(
    readonly dispatchInterceptors: readonly MessageDispatchInterceptor[],
    readonly handlerInterceptors: readonly MessageHandlerInterceptor[],
  ) {}

  /** The message as the dispatch interceptors leave it. */
  dispatch<M extends Message>(
    message: M,
    context: ProcessingContext | undefined,
  ): M {
    return InterceptorChains.dispatch(
      this.dispatchInterceptors as readonly MessageDispatchInterceptor<M>[],
      message,
      context,
    );
  }

  /** `handler`, behind the handler interceptors. */
  handle<M extends Message>(
    message: M,
    context: ProcessingContext,
    handler: (message: M, context: ProcessingContext) => Promise<unknown>,
  ): Promise<unknown> {
    return InterceptorChains.handle(
      this.handlerInterceptors as readonly MessageHandlerInterceptor<M>[],
      message,
      context,
      handler,
    );
  }
}
