/**
 * **lambda** — how this system's Nest applications are entered when AWS is the one calling.
 *
 * Three pieces, and none of them is a framework: {@link bootOnce} starts the application once per
 * container during the init phase, {@link streamingHandler} answers HTTP as a stream through a
 * Function URL, and {@link queueHandler} answers SQS. The applications themselves are unchanged —
 * what a handler here does is hand AWS's calling convention to the same container `main.ts` starts.
 */
export * from './boot';
export * from './queue';
export * from './runtime';
export * from './settle';
export * from './streaming';
