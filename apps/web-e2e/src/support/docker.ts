import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const WORKSPACE_ROOT = new URL('../../../..', import.meta.url).pathname;

/** The infrastructure this repository puts in `docker-compose.yml`, and nothing else. */
export class Compose {
  constructor(private readonly root: string = WORKSPACE_ROOT) {}

  async up(...services: string[]): Promise<void> {
    await this.run('up', '-d', '--wait', ...services);
  }

  /**
   * A command inside a compose service, which is how the suite reaches Postgres without needing a
   * client on the host.
   */
  exec(service: string, ...command: string[]): string {
    return execFileSync('docker', ['compose', 'exec', '-T', service, ...command], {
      cwd: this.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  }

  isRunning(service: string): boolean {
    try {
      const ids = execFileSync('docker', ['compose', 'ps', '-q', service], {
        cwd: this.root,
        encoding: 'utf8',
      }).trim();
      if (ids === '') {
        return false;
      }
      return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', ...ids.split('\n')], {
        encoding: 'utf8',
      }).includes('true');
    } catch {
      return false;
    }
  }

  private async run(...args: string[]): Promise<string> {
    const { stdout } = await exec('docker', ['compose', ...args], {
      cwd: this.root,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim();
  }
}
