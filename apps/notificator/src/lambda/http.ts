import '../telemetry';

import { streamingHandler } from '@nestposts/lambda';

import { booted } from './http-server';

export const handler = streamingHandler(booted);
