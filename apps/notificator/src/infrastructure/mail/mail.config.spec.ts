import { mailSettingsFromEnv } from './mail.config';

describe('mailSettingsFromEnv', () => {
  it('sends to Mailpit on localhost by default', () => {
    expect(mailSettingsFromEnv({})).toEqual({
      transport: 'smtp://localhost:1025',
      from: 'Nest Posts <no-reply@nestposts.local>',
    });
  });

  it('sends through SES v2 in the configured region', async () => {
    const { transport } = mailSettingsFromEnv({
      MAIL_TRANSPORT: 'ses',
      MAIL_SES_REGION: 'sa-east-1',
      MAIL_FROM: 'no-reply@example.com',
    });
    const ses = (
      transport as {
        SES: { sesClient: { config: { region: () => Promise<string> } } };
      }
    ).SES;

    await expect(ses.sesClient.config.region()).resolves.toBe('sa-east-1');
  });

  it('renders and keeps the message with the json transport', () => {
    expect(mailSettingsFromEnv({ MAIL_TRANSPORT: 'json' }).transport).toEqual({
      jsonTransport: true,
    });
  });

  it('refuses a transport it does not know', () => {
    expect(() => mailSettingsFromEnv({ MAIL_TRANSPORT: 'pigeon' })).toThrow();
  });
});
