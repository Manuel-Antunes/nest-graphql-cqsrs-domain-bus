export enum InngestStatus {
  STARTING = 'starting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

export enum InngestEventsMap {
  ERROR = 'error',
  LISTENING = 'listening',
  CLOSE = 'close',
}

export type InngestEvents = {
  error: (error: Error) => void;
  listening: () => void;
  close: () => void;
};
