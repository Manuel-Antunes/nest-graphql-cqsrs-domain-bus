export class InvalidCalendarEventException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidCalendarEventException';
  }
}
