/**
 * `../telemetry` is imported HERE, in the entry point, and not only in `./server`.
 *
 * The instrumentations work by patching a module as it is REQUIRED, so whatever is required
 * before the SDK starts is never patched — and a handler module's imports are evaluated in the
 * order they are written. With `@nestposts/lambda` first, its import graph reached `pino` before
 * the SDK existed: the logger came back unpatched, no record ever carried a `trace_id`, and the
 * OTel logs pipeline had nothing to export. Nothing failed, and the deployed stack reported
 * traces with no logs beside them.
 *
 * `startTelemetry` is idempotent, so importing it in both places costs nothing and removes the
 * ordering from the list of things that have to stay true by accident.
 */
import '../telemetry';

import { streamingHandler } from '@nestposts/lambda';

import { booted } from './server';

export const handler = streamingHandler(booted);
