export class CopilotKitRoutes {
  static readonly SERVED =
    /^\/(info|agent\/[^/]+\/run|agent\/[^/]+\/stop\/[^/]+)\/?$/;

  static isServed(request: Request, basePath: string): boolean {
    const path = new URL(request.url).pathname;
    return (
      path.startsWith(basePath) &&
      CopilotKitRoutes.SERVED.test(path.slice(basePath.length))
    );
  }
}
