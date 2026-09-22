/** What {@link SqsStrategy.status} reports. */
export enum SqsStatus {
  STARTING = 'starting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

/** The events {@link SqsStrategy.on} takes a listener for. */
export enum SqsEventsMap {
  ERROR = 'error',
  LISTENING = 'listening',
  CLOSE = 'close',
}

export type SqsEvents = {
  error: (error: Error) => void;
  listening: () => void;
  close: () => void;
};
