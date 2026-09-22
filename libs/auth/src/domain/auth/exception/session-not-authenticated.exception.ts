export class SessionNotAuthenticatedException extends Error {
  constructor(message = 'the request carries no authenticated session') {
    super(message);
    this.name = 'SessionNotAuthenticatedException';
  }
}
