import { createHash, timingSafeEqual } from 'node:crypto';
import { OutboxHousekeeping } from '@nestposts/transport-eventbus';

import { env } from '@/env.mjs';
import { Nest } from '@/nest/container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

const authorized = (request: Request, secret: string): boolean => {
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '');
  return given !== undefined && timingSafeEqual(digest(given), digest(secret));
};

export async function POST(request: Request): Promise<Response> {
  const secret = env.WEB_OUTBOX_SWEEP_SECRET;
  if (!secret) {
    return new Response(null, { status: 404 });
  }
  if (!authorized(request, secret)) {
    return new Response(null, { status: 401 });
  }
  const housekeeping = await Nest.get(OutboxHousekeeping);
  return Response.json(await housekeeping.sweep());
}
