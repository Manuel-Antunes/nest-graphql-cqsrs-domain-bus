import { WebAuth } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Better Auth's own endpoints, served by this application.
 *
 * Sign-in, sign-out, the OAuth screens and the organization endpoints answer on the web's origin, so
 * the browser's cookie belongs to the origin it is already talking to and no CSRF `origin` has to be
 * forged by a server calling another server.
 */
const handle = (request: Request): Promise<Response> => WebAuth.handle(request);

export const GET = handle;
export const POST = handle;
