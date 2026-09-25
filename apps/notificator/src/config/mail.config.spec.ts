import { mailConfig } from './mail.config';

describe('mailConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends to Mailpit on localhost by default', () => {
    vi.stubEnv('MAIL_TRANSPORT', undefined);
    vi.stubEnv('MAIL_SMTP_URL', undefined);
    vi.stubEnv('MAIL_FROM', undefined);

    expect(mailConfig()).toEqual({
      transport: 'smtp://localhost:1025',
      from: 'Nest Posts <no-reply@nestposts.local>',
    });
  });

  it('sends through SES v2 in the configured region', async () => {
    vi.stubEnv('MAIL_TRANSPORT', 'ses');
    vi.stubEnv('MAIL_SES_REGION', 'sa-east-1');
    vi.stubEnv('MAIL_FROM', 'no-reply@example.com');

    const ses = (
      mailConfig().transport as {
        SES: { sesClient: { config: { region: () => Promise<string> } } };
      }
    ).SES;

    await expect(ses.sesClient.config.region()).resolves.toBe('sa-east-1');
  });

  it('renders and keeps the message with the json transport', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'json');

    expect(mailConfig().transport).toEqual({ jsonTransport: true });
  });

  it('refuses a transport it does not know', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'pigeon');

    expect(() => mailConfig()).toThrow();
  });
});
