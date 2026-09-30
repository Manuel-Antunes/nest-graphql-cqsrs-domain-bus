/* eslint-disable max-classes-per-file */
export class DuplicateContactException extends Error {
  static DEFAULT_MESSAGE = 'DUPLICATE_CONTACT';

  data: unknown;

  constructor(data: unknown) {
    super(DuplicateContactException.DEFAULT_MESSAGE);
    this.data = data;
    this.name = 'DuplicateContactException';
  }

  /** Server or client may assign `message` after construction; otherwise still DEFAULT_MESSAGE. */
  get contactErrorDetail() {
    return this.message === DuplicateContactException.DEFAULT_MESSAGE
      ? null
      : this.message;
  }
}
export class ExceptionWithMessage extends Error {
  data: unknown;

  constructor(data: unknown) {
    super('ERROR_WITH_MESSAGE');
    this.data = data;
    this.name = 'ExceptionWithMessage';
  }
}
