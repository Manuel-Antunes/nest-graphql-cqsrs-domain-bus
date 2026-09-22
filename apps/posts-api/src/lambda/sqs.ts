import { queueHandler } from '@nestposts/lambda';
import { booted } from './server';

export const handler = queueHandler(async () => (await booted()).consumer);
