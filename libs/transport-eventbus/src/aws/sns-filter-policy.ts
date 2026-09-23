import type { Type } from '@nestjs/common';
import { requireEventTypeOf } from '@nestposts/platform/domain/shared/event-type';

import {
  AWS_NAMESPACE_ATTRIBUTE,
  AWS_ORIGIN_ATTRIBUTE,
  AWS_QUALIFIED_NAME_ATTRIBUTE,
} from './aws-message';

/** One clause of a policy: a value to match, or one of SNS's operators. */
export type SnsFilterTerm =
  string | { readonly 'anything-but': readonly string[] };

/**
 * A subscription's filter policy, in the shape SNS takes it: **OR within an attribute, AND across
 * attributes**.
 */
export type SnsFilterPolicyDocument = Record<string, readonly SnsFilterTerm[]>;

/**
 * **The binding, for SNS** — the same declaration `@EventPattern(EventAddress.everyEventOf(…))` makes
 * on the consumer, written as the policy the subscription is created with.
 *
 * On RabbitMQ a consumer's binding and its handler's pattern are one string, so they cannot disagree.
 * On AWS they are two things in two places: the handler pattern lives in the controller and the filter
 * policy lives in the infrastructure (`sst.config.ts`). Building the second from the same namespace or
 * the same event class is what keeps them the same fact — a namespace renamed in `@EventType` takes
 * the subscription with it, instead of leaving a queue quietly bound to a name nothing publishes under
 * any more.
 *
 * ```ts
 * SnsFilterPolicy.everyEventOf(POSTS_NAMESPACE)            // { namespace: ['posts'] }
 * SnsFilterPolicy.everyEventOf(PostCreatedEvent)           // { qualifiedName: ['posts.PostCreated'] }
 * SnsFilterPolicy.merge(
 *   SnsFilterPolicy.everyEventOf(POSTS_NAMESPACE),
 *   SnsFilterPolicy.exceptFrom('tagging'),                 // …and not this service's own echo
 * )
 * ```
 *
 * ## Why {@link exceptFrom} is worth having even though the origin mark already exists
 * Because the mark is read *after* delivery: the message is stored, delivered, read, deserialized and
 * then dropped, and every one of those steps is paid for. A service that binds a namespace it also
 * publishes to gets its own events back — which is normal, and what the mark exists for — but there is
 * no reason to pay for them when the subscription can decline them. The mark stays the guard; this is
 * the economy.
 */
export class SnsFilterPolicy {
  /** Every event of a namespace, or every instance of one event class. */
  static everyEventOf(namespace: string): SnsFilterPolicyDocument;
  static everyEventOf(event: Type<object>): SnsFilterPolicyDocument;
  static everyEventOf(target: string | Type<object>): SnsFilterPolicyDocument {
    return typeof target === 'string'
      ? { [AWS_NAMESPACE_ATTRIBUTE]: [target] }
      : {
          [AWS_QUALIFIED_NAME_ATTRIBUTE]: [
            requireEventTypeOf(target).qualifiedName,
          ],
        };
  }

  /**
   * The same, named rather than imported: `'posts.PostCreated'`.
   *
   * It is for **infrastructure** — an SST config, a provisioning script — which should not import a
   * domain event class to read one string off it. Application code has the class in hand and should
   * pass it, so that renaming the event moves its subscriptions with it.
   */
  static everyEventNamed(qualifiedName: string): SnsFilterPolicyDocument {
    return { [AWS_QUALIFIED_NAME_ATTRIBUTE]: [qualifiedName] };
  }

  /** Everything except what these services published — a service declining its own echo. */
  static exceptFrom(...applicationNames: string[]): SnsFilterPolicyDocument {
    return { [AWS_ORIGIN_ATTRIBUTE]: [{ 'anything-but': applicationNames }] };
  }

  /**
   * Several policies as one. Terms under the same attribute are **alternatives** (SNS ORs them), and
   * different attributes are **conditions** (SNS ANDs them) — which is the same reading a topic
   * exchange gives two bindings on one queue.
   */
  static merge(
    ...policies: SnsFilterPolicyDocument[]
  ): SnsFilterPolicyDocument {
    const merged: Record<string, SnsFilterTerm[]> = {};
    for (const policy of policies) {
      for (const [attribute, terms] of Object.entries(policy)) {
        merged[attribute] = [...(merged[attribute] ?? []), ...terms];
      }
    }
    return merged;
  }
}
