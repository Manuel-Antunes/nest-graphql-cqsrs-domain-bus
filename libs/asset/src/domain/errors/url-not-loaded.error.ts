export class UrlNotLoadedError extends Error {
  constructor(message = 'Asset URL not loaded') {
    super(message);
    this.name = 'UrlNotLoadedError';
  }
}
