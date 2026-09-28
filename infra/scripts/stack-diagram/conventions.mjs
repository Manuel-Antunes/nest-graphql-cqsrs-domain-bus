export class SstConventions {
  static SUBSCRIBER = /^sst:aws:\w+Subscriber$/;
  static QUEUE = 'sst:aws:Queue';
  static SQS_QUEUE = 'aws:sqs/queue:Queue';
  static EVENT_SOURCE_MAPPING =
    'aws:lambda/eventSourceMapping:EventSourceMapping';

  homes = new Map();

  constructor(stack) {
    this.stack = stack;
    const subscribers = stack.resources.filter((resource) =>
      SstConventions.SUBSCRIBER.test(resource.type.token),
    );
    for (const subscriber of subscribers) {
      const source = this.#namedAfter(subscriber);
      if (source?.type.token === SstConventions.QUEUE) {
        SstConventions.#readsFrom(subscriber, source);
      }
      if (subscriber.parent?.type.isStack) {
        const home = this.#homeOf(subscriber, source);
        if (home) this.homes.set(subscriber, home);
      }
    }
  }

  static of(stack) {
    return new SstConventions(stack);
  }

  childrenOf(resource) {
    const moved = [...this.homes]
      .filter(([, home]) => home === resource)
      .map(([subscriber]) => subscriber);
    return [
      ...resource.children.filter((child) => !this.homes.has(child)),
      ...moved,
    ];
  }

  #namedAfter(subscriber) {
    return this.stack.resources
      .filter(
        (resource) =>
          resource !== subscriber &&
          resource.children.length > 0 &&
          !SstConventions.SUBSCRIBER.test(resource.type.token) &&
          subscriber.name.startsWith(`${resource.name}Subscriber`),
      )
      .sort((a, b) => b.name.length - a.name.length)[0];
  }

  #homeOf(subscriber, source) {
    if (source?.type.token === SstConventions.QUEUE) return source;
    const queues = new Set(
      SstConventions.#subtree(subscriber)
        .flatMap((resource) => resource.dependencies)
        .map(({ on }) => on)
        .filter(
          (resource) =>
            resource.type.token === SstConventions.SQS_QUEUE &&
            resource.parent?.type.token === SstConventions.QUEUE,
        )
        .map((resource) => resource.parent),
    );
    return queues.size === 1 ? [...queues][0] : source;
  }

  static #readsFrom(subscriber, queue) {
    const source = queue.children.find(
      (child) => child.type.token === SstConventions.SQS_QUEUE,
    );
    if (!source) return;
    for (const mapping of SstConventions.#subtree(subscriber)) {
      if (mapping.type.token !== SstConventions.EVENT_SOURCE_MAPPING) continue;
      const existing = mapping.dependencies.find(({ on }) => on === source);
      if (existing) {
        existing.asserted = true;
        existing.properties = ['eventSourceArn'];
      } else {
        mapping.dependencies.push({
          on: source,
          properties: ['eventSourceArn'],
          asserted: true,
        });
      }
    }
  }

  static #subtree(resource) {
    return [resource, ...resource.children.flatMap(SstConventions.#subtree)];
  }
}
