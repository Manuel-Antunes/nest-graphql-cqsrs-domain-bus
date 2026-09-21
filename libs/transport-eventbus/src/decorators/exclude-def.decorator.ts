import { EXCLUDE_DEF_METADATA } from '../constants';

/**
 * **This event does not run locally** — it is published through the transports and nowhere else.
 *
 * Upstream's decorator, unchanged in meaning. It is what an *integration* event is: a fact this
 * service states for others, which nothing here reacts to. Without it, an event published on this bus
 * always also reaches the local handlers, sagas and subscriptions.
 *
 * Written as metadata rather than as a substituted class, for the reason in `NOTICE.md`.
 */
export function ExcludeDef(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(EXCLUDE_DEF_METADATA, true, target);
  };
}

export const isExcludedLocally = (event: object): boolean =>
  Reflect.getMetadata(EXCLUDE_DEF_METADATA, event.constructor) === true;
