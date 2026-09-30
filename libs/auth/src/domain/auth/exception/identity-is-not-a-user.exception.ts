export class IdentityIsNotAUserException extends Error {
  constructor(
    message = 'the caller is an OAuth client, which acts for no user and is member of no organization',
  ) {
    super(message);
    this.name = 'IdentityIsNotAUserException';
  }
}
