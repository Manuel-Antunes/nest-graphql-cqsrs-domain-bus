export class OrganizationNotSelectedException extends Error {
  constructor(message = 'the session has no active organization') {
    super(message);
    this.name = 'OrganizationNotSelectedException';
  }
}
