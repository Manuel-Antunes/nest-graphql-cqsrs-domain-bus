import { Writable } from 'node:stream';
import type { LoggerOptions } from 'pino';
import { pino } from 'pino';

import { loggingParams } from './logging';

describe('the logging parameters', () => {
  const recordOf = (entry: Record<string, unknown>) => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { redact } = loggingParams({ serviceName: 'spec', pretty: false })
      .pinoHttp as LoggerOptions;
    pino({ redact }, destination).info(entry, 'request completed');
    return JSON.parse(lines[0]);
  };

  it('never writes a credential a request or a response carried', () => {
    const record = recordOf({
      req: {
        headers: {
          host: 'gateway',
          cookie: 'better-auth.session_token=secret',
          authorization: 'Bearer secret',
          'x-api-key': 'secret',
        },
      },
      res: { headers: { 'set-cookie': ['better-auth.session_token=secret'] } },
    });

    expect(JSON.stringify(record)).not.toContain('secret');
    expect(record.req.headers).toEqual({
      host: 'gateway',
      cookie: '[redacted]',
      authorization: '[redacted]',
      'x-api-key': '[redacted]',
    });
    expect(record.res.headers['set-cookie']).toBe('[redacted]');
  });
});
