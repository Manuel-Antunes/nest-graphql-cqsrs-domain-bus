import { queueHandler } from '@nestposts/lambda';

import { booted } from './server';

export const handler = queueHandler(booted);
