/// <reference types="aws-lambda" />

/**
 * **`awslambda` is a global the Node runtime injects**, not a package: there is nothing to install,
 * nothing to import, and it exists nowhere else — not in a test, not in `node dist/main.js`, not in
 * `sst dev`. `@types/aws-lambda` declares it, which is why the compiler is happy with it everywhere.
 *
 * That is exactly the problem this function exists for. The **type** is available in every file
 * while the **value** is available in one place, so the first call outside Lambda fails with
 * `awslambda is not defined` from a line that typechecked — and the message says nothing about why.
 * Going through here turns that into a sentence.
 *
 * The types come in through a `reference` directive and **not** `import 'aws-lambda'`: a side-effect
 * import is emitted as a `require` of a package that has no runtime half, and the bundler refuses it
 * with `Could not resolve "aws-lambda"` — at deploy time, which is a long way from here.
 */
export const lambdaRuntime = (): typeof awslambda => {
  const runtime = (globalThis as { awslambda?: typeof awslambda }).awslambda;
  if (!runtime) {
    throw new Error(
      'awslambda is not defined: response streaming is a feature of the AWS Lambda Node runtime, ' +
        'and this module is its entry point. Outside Lambda the application is started by main.ts.',
    );
  }
  return runtime;
};
