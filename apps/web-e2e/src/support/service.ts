import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKSPACE_ROOT } from './docker';
import { sleep } from './posts-api';

export interface Readiness {
  isReady(log: () => string): Promise<boolean>;
  readonly description: string;
}

export class HttpHealth implements Readiness {
  readonly description: string;

  constructor(private readonly probe: () => Promise<boolean>, url: string) {
    this.description = `${url} respondendo`;
  }

  isReady(): Promise<boolean> {
    return this.probe();
  }
}

export class LogLine implements Readiness {
  readonly description: string;

  constructor(private readonly needle: string) {
    this.description = `a linha "${needle}" no log`;
  }

  async isReady(log: () => string): Promise<boolean> {
    return log().includes(this.needle);
  }
}

/** What starts one application, and from where. */
export interface Launch {
  readonly command: string;
  readonly args: string[];
  readonly cwd?: string;
}

/** `node apps/<name>/dist/main.js` — the command a container would run for a Nest application. */
export const nestApplication = (name: string): Launch => ({
  command: 'node',
  args: [join('apps', name, 'dist', 'main.js')],
});

/** `next start` from the application's own directory, which is how the Next server is served. */
export const nextApplication = (name: string, port: number): Launch => ({
  command: 'npx',
  args: ['next', 'start', '-p', String(port)],
  cwd: join(WORKSPACE_ROOT, 'apps', name),
});

/**
 * One application, running as its own **process**.
 *
 * None of them is a compose service on purpose: what this suite has to prove is the whole system
 * across real processes, and the repository builds its applications with `tsc` and `next build`
 * rather than images. Packaging them would put a Dockerfile between the test and the thing under
 * test without proving anything more.
 */
export class Service {
  private child?: ChildProcess;

  constructor(
    readonly name: string,
    private readonly launch: Launch,
    private readonly readiness: Readiness,
    private readonly environment: NodeJS.ProcessEnv,
    private readonly logDirectory: string,
  ) {}

  start(): void {
    mkdirSync(this.logDirectory, { recursive: true });
    writeFileSync(this.logFile, '');
    this.child = spawn(this.launch.command, this.launch.args, {
      cwd: this.launch.cwd ?? WORKSPACE_ROOT,
      env: { ...process.env, ...this.environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const record = (chunk: Buffer) => appendFileSync(this.logFile, chunk.toString());
    this.child.stdout?.on('data', record);
    this.child.stderr?.on('data', record);
  }

  async waitUntilReady(seconds = 120): Promise<void> {
    for (let attempt = 0; attempt < seconds; attempt++) {
      if (await this.readiness.isReady(() => this.log)) {
        return;
      }
      if (this.child?.exitCode !== null && this.child?.exitCode !== undefined) {
        throw new Error(
          `${this.name} morreu na partida — o processo saiu com código ${this.child.exitCode}\n${this.tail()}`,
        );
      }
      await sleep(1000);
    }
    throw new Error(
      `${this.name} não subiu em ${seconds}s (esperava ${this.readiness.description}):\n${this.tail()}`,
    );
  }

  /**
   * Kills the process **group**, not the process.
   *
   * `next start` is `npx` with the server as a child, so killing the one we spawned leaves the server
   * holding the port — and the next run fails with `EADDRINUSE` on a port nothing appears to own.
   */
  stop(): void {
    const child = this.child;
    this.child = undefined;
    if (!child?.pid) {
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }

  get log(): string {
    try {
      return readFileSync(this.logFile, 'utf8');
    } catch {
      return '';
    }
  }

  tail(lines = 25): string {
    return this.log
      .split('\n')
      .filter((line) => !/^\s+at /.test(line))
      .slice(-lines)
      .join('\n');
  }

  private get logFile(): string {
    return join(this.logDirectory, `${this.name}.log`);
  }
}
