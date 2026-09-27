import '../telemetry';

import { scheduledHandler } from '@nestposts/lambda';
import { OutboxHousekeeping } from '@nestposts/transport-eventbus';

import { booted } from './server';

export const handler = scheduledHandler(booted, (app) =>
  app.get(OutboxHousekeeping).sweep(),
);
