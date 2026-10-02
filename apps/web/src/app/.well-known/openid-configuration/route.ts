import { WebAuth } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (request: Request): Promise<Response> =>
  WebAuth.handle(request);
