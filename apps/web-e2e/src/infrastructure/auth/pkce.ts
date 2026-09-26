import { createHash, randomBytes } from 'node:crypto';

export class Pkce {
  private constructor(
    readonly verifier: string,
    readonly challenge: string,
  ) {}

  static generate(): Pkce {
    const verifier = randomBytes(32).toString('base64url');
    return new Pkce(
      verifier,
      createHash('sha256').update(verifier).digest('base64url'),
    );
  }
}
