import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { Workspace } from '../environment/workspace';
import { Poll } from '../support/poll';

export class HttpHealth {
  readonly description: string;

  constructor(
    private readonly probe: () => Promise<boolean>,
    url: string,
  ) {
    this.description = `${url} respondendo`;
  }

  isReady(): Promise<boolean> {
    return this.probe();
  }
}

/** What starts one application, and from where. */
export class Launch {
  private constructor(
    readonly command: string,
    readonly args: string[],
    readonly cwd: string,
  ) {}

  /** `next start` from the application's own directory, which is how the Next server is served. */
  static next(name: string, port: number): Launch {
    return new Launch(
      'npx',
      ['next', 'start', '-p', String(port)],
      Workspace.path('apps', name),
    );
  }

  /** A Rails command of `apps/chatwoot`, through its own locked Gemfile. */
  static rails(...args: string[]): Launch {
    return new Launch(
      'bundle',
      ['exec', 'rails', ...args],
      Workspace.path('apps', 'chatwoot'),
    );
  }

  /** The Vite dev server Chatwoot's dashboard loads its modules from. */
  static vite(): Launch {
    return new Launch('bin/vite', ['dev'], Workspace.path('apps', 'chatwoot'));
  }
}

/**
 * One application, running as its own **process**.
 *
 * It is the web and Chatwoot, on purpose: both are under the browser, and keeping them processes keeps
 * a failure one `tail` away instead of one `docker build` away.
 */
export class Service {
  private child?: ChildProcess;

  constructor(
    readonly name: string,
    private readonly launch: Launch,
    private readonly readiness: HttpHealth,
    private readonly environment: NodeJS.ProcessEnv,
    private readonly logDirectory: string,
  ) {}

  /** Runs to completion — a one-shot, like a database task — and fails with its log when it fails. */
  async run(): Promise<void> {
    this.start();
    const code = await new Promise<number | null>((resolve) =>
      this.child?.on('exit', resolve),
    );
    this.child = undefined;
    if (code !== 0) {
      throw new Error(`${this.name} exited with code ${code}\n${this.tail()}`);
    }
  }

  start(): void {
    mkdirSync(this.logDirectory, { recursive: true });
    writeFileSync(this.logFile, '');
    this.child = spawn(this.launch.command, this.launch.args, {
      cwd: this.launch.cwd,
      env: { ...process.env, ...this.environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const record = (chunk: Buffer) =>
      appendFileSync(this.logFile, chunk.toString());
    this.child.stdout?.on('data', record);
    this.child.stderr?.on('data', record);
  }

  async waitUntilReady(seconds = 120): Promise<void> {
    for (let attempt = 0; attempt < seconds; attempt++) {
      if (await this.readiness.isReady()) {
        return;
      }
      if (this.child?.exitCode !== null && this.child?.exitCode !== undefined) {
        throw new Error(
          `${this.name} morreu na partida — o processo saiu com código ${this.child.exitCode}\n${this.tail()}`,
        );
      }
      await Poll.pause(1000);
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
