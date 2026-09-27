/**
 * The web's outbox has no relay loop: `apps/web` runs in OpenNext's function, frozen between
 * requests, so what a failed publish left in the outbox — a broker that was down, a function that
 * froze mid-publish — is published by the next request that commits, or by this. It asks the web to
 * sweep its outbox every minute, through the one route that does it (`/api/outbox/sweep`), with the
 * secret both sides derive from `AuthSecret`.
 *
 * It fails loudly on anything but a 2xx, so the schedule's own retries and alarms see it.
 */
export const handler = async (): Promise<unknown> => {
  const url = process.env.WEB_OUTBOX_SWEEP_URL;
  const secret = process.env.WEB_OUTBOX_SWEEP_SECRET;
  if (!url || !secret) {
    throw new Error(
      'WEB_OUTBOX_SWEEP_URL and WEB_OUTBOX_SWEEP_SECRET must both be set',
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!response.ok) {
    throw new Error(`the web's outbox sweep answered ${response.status}`);
  }
  return response.json();
};
