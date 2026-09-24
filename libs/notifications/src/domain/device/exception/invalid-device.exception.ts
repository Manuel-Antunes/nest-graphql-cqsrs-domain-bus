export class InvalidDeviceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidDeviceException';
  }
}
