/** O command apontou para um Post que não existe — o equivalente do `EntityNotFoundException` do Axon. */
export class PostNotFoundException extends Error {
  constructor(readonly postId: string) {
    super(`post ${postId} não existe`);
    this.name = 'PostNotFoundException';
  }
}
