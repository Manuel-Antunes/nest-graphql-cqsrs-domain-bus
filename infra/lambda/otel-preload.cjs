// The AWS Lambda instrumentation, registered BEFORE the runtime loads the handler.
//
// WHY A PRELOAD AND NOT A LINE IN THE APPLICATION
// ===============================================
// `@opentelemetry/instrumentation-aws-lambda` works by patching the handler MODULE: it resolves the
// file from `_HANDLER` and `LAMBDA_TASK_ROOT` and hooks its `require`. Here that file is the esbuild
// bundle — the very module that calls `startTelemetry()`. By the time the SDK is up, the runtime is
// already halfway through requiring it, the hook is installed too late, and the patch never applies.
//
// `NODE_OPTIONS=--require` is the way out, and it is what AWS's own ADOT layer does with
// `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler`. This file runs before the Lambda runtime itself, so
// the hook is in place long before the handler is loaded.
//
// WHY IT REGISTERS TWO INSTRUMENTATIONS AND NOT THE WHOLE SDK
// ==========================================================
// Only these two have to precede the handler — this one, and `http` for the reason given below;
// everything else is patched as the application's own imports are resolved, which `startTelemetry`
// (`@nestposts/observability`) already covers. Keeping the SDK there keeps ONE list of instrumentations, one exporter choice and one
// place that decides `SimpleSpanProcessor` on Lambda — a second bootstrap here would be a second
// list to keep in step.
//
// `registerInstrumentations` with no provider binds the API's ProxyTracerProvider, which forwards to
// the real one the moment `startTelemetry` registers it. That is what makes the ordering work in
// both directions.
//
// The alternative was `@opentelemetry/auto-instrumentations-node`, which needs no list at all. It is
// 75MB installed, and this function's artifact is already 174MB against a 250MB limit.
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const {
  AwsLambdaInstrumentation,
} = require('@opentelemetry/instrumentation-aws-lambda');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

// WHY `http` IS REGISTERED HERE TOO
// =================================
// Registering the Lambda instrumentation installs the ONE `require` hook every instrumentation
// shares, and that hook caches each module it sees — patched or not. `https` is required long before
// `startTelemetry` runs (the OTLP exporter needs it), so an `HttpInstrumentation` registered there
// finds `https` already cached, unpatched, and is never given it again. Measured on the deployed
// gateway: not one HTTP client span in three days, and every subgraph started a trace of its own,
// because the call carried no `traceparent`. Registered here, it is in place before anything asks
// for `http` or `https`, and `startTelemetry` leaves it out of its own list in a Lambda.
//
// The runtime's own long poll of the Runtime API is not a request anybody wants a span for.
const RUNTIME_API = process.env.AWS_LAMBDA_RUNTIME_API;
const toRuntimeApi = (request) => {
  const host = request.hostname ?? request.host ?? '';
  return (
    Boolean(RUNTIME_API) &&
    (host.includes(':') ? host : `${host}:${request.port}`) === RUNTIME_API
  );
};

// No options on the Lambda instrumentation: the default event context extractor reads
// `event.headers`, which is what carries the `traceparent` the caller put there — so the invocation
// span is already a child of the request that made it rather than the root of a trace of its own.
// The X-Ray header is only consulted for SQS span links, so it never competes with that.
registerInstrumentations({
  instrumentations: [
    new AwsLambdaInstrumentation(),
    new HttpInstrumentation({ ignoreOutgoingRequestHook: toRuntimeApi }),
  ],
});
