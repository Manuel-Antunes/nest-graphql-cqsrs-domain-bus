/** Um `CreatePostCommand` chegou com um id que já tem Post. */
export class PostAlreadyExistsException extends Error {
  constructor(readonly postId: string) {
    super(`post ${postId} já existe`);
    this.name = 'PostAlreadyExistsException';
  }
}
