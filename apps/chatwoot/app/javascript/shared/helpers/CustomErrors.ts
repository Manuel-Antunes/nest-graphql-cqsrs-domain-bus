/* eslint-disable max-classes-per-file */
export class DuplicateContactException extends Error {
  data: unknown;

  constructor(data: unknown) {
    super('DUPLICATE_CONTACT');
    this.data = data;
    this.name = 'DuplicateContactException';
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
