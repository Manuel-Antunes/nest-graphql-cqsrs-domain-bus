import '../telemetry';

import { scheduledHandler } from '@nestposts/lambda';
import { OutboxHousekeeping } from '@nestposts/outbox-mikro-orm';

import { booted } from './server';

export const handler = scheduledHandler(
  async () => (await booted()).app,
  (app) => app.get(OutboxHousekeeping).sweep(),
);
