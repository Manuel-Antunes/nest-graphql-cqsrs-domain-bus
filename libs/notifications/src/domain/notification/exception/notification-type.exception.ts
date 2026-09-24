export class NotificationTypeConflictException extends Error {
  constructor(type: string) {
    super(`the notification type "${type}" is declared by two classes`);
    this.name = 'NotificationTypeConflictException';
  }
}

export class NotificationTypeMissingException extends Error {
  constructor(className: string) {
    super(
      `${className} has no @NotificationType — a notification must declare the type it is stored and delivered under`,
    );
    this.name = 'NotificationTypeMissingException';
  }
}

export class UnknownNotificationTypeException extends Error {
  constructor(readonly type: string) {
    super(
      `no notification class is registered as "${type}" — list it in NotificationChannelsModule.forRoot({ notifications })`,
    );
    this.name = 'UnknownNotificationTypeException';
  }
}
