import type { ExecFileException } from 'node:child_process';
import { execFile } from 'node:child_process';

import { CommandFailedException } from '../../domain/errors/attachment.exceptions';

export interface CommandOutput {
  stdout: string;
  stderr: string;
}

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** Runs an external program with its arguments as a list — never through a shell — and a deadline. */
export class Command {
  static run(
    bin: string,
    args: readonly string[],
    timeout: number,
  ): Promise<CommandOutput> {
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { timeout, killSignal: 'SIGKILL', maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new CommandFailedException(bin, Command.reasonOf(error, stderr), {
                cause: error,
              }),
            );
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });
  }

  private static reasonOf(error: ExecFileException, stderr: string): string {
    if (error.code === 'ENOENT') return 'it is not installed';
    if (error.killed) return 'it ran out of time';
    return stderr.trim().split('\n').pop() || error.message;
  }
}
