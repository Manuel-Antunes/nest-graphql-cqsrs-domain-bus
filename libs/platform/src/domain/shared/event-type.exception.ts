export class EventTypeConflictException extends Error {
  constructor(
    readonly qualifiedName: string,
    readonly registered: string,
    readonly incoming: string,
  ) {
    super(
      `${qualifiedName} is declared by ${registered} and by ${incoming}. A qualified name is what ` +
        `identifies an event on the wire: two classes under one name means whoever receives it ` +
        `cannot know which one it is.`,
    );
    this.name = 'EventTypeConflictException';
  }
}

export class EventTypeMissingException extends Error {
  constructor(readonly target: string) {
    super(
      `${target} has no @EventType. An event without a namespace, a name and a version has no ` +
        `identity outside this process, and nothing can be routed or reconstructed from it.`,
    );
    this.name = 'EventTypeMissingException';
  }
}
