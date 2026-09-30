import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

export type SubgraphHeaders = Readonly<Record<string, string>>;

export interface SubgraphHeaderResolver {
  readonly subgraphName?: string;
  resolve(identity: Identity | null, req: unknown): Promise<SubgraphHeaders>;
}
