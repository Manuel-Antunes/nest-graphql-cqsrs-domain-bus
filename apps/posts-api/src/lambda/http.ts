import { streamingHandler } from '@nestposts/lambda';
import { booted } from './server';

export const handler = streamingHandler(booted);
