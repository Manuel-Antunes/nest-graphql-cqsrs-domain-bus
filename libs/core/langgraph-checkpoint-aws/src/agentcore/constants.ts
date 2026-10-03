/** The value a channel event carries when the channel has nothing to store. */
export const EMPTY_CHANNEL_VALUE = '_empty';

/** Base class of every error the AgentCore Memory checkpointer raises. */
export class AgentCoreMemoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** An event read back from AgentCore Memory could not be decoded. */
export class EventDecodingError extends AgentCoreMemoryError {}

/** The runnable config lacks what the checkpointer needs, or the saver was configured inconsistently. */
export class InvalidConfigError extends AgentCoreMemoryError {}

/** An event the checkpoint references was not found in the session. */
export class EventNotFoundError extends AgentCoreMemoryError {}

/** A read capped by `limit` lacks the checkpoint record or a channel it references. */
export class CheckpointReadLimitError extends AgentCoreMemoryError {}
