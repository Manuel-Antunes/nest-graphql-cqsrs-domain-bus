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
// WHY IT REGISTERS THE INSTRUMENTATION AND NOT THE WHOLE SDK
// =========================================================
// Only this one instrumentation has to precede the handler; everything else is patched as the
// application's own imports are resolved, which `startTelemetry` (`@nestposts/observability`) already
// covers. Keeping the SDK there keeps ONE list of instrumentations, one exporter choice and one
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

// No options: the default event context extractor reads `event.headers`, which is what carries the
// `traceparent` the Next server put there — so the invocation span is already a child of the
// browser-side request rather than the root of a trace of its own. The X-Ray header is only
// consulted for SQS span links, so it never competes with that.
registerInstrumentations({
  instrumentations: [new AwsLambdaInstrumentation()],
});
