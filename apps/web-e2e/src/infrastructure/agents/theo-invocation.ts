import type { JWTPayload } from 'jose';

export interface TheoInvocation {
  readonly claims: JWTPayload;
  readonly signedByTheWeb: boolean;
  readonly threadId: string;
  readonly session: string | null;
  readonly asked: string;
}
