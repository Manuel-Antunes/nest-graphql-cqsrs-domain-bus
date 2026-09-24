import { plainTextFromHtml } from './plain-text.plugin';

const compiled = (data: { html?: unknown; text?: unknown }) =>
  new Promise<{ html?: unknown; text?: unknown }>((resolve, reject) => {
    const mail = { data };
    plainTextFromHtml().plugin(mail, (error) =>
      error ? reject(error) : resolve(mail.data),
    );
  });

describe('plainTextFromHtml', () => {
  it('writes the plain-text part from the HTML', async () => {
    await expect(
      compiled({ html: '<p>Hello <b>Ana</b></p>' }),
    ).resolves.toMatchObject({
      text: 'Hello Ana',
    });
  });

  it('reads HTML handed over as a buffer', async () => {
    await expect(
      compiled({ html: Buffer.from('<p>Hi</p>') }),
    ).resolves.toMatchObject({
      text: 'Hi',
    });
  });

  it('keeps a plain-text part the message already has', async () => {
    await expect(
      compiled({ html: '<p>Hi</p>', text: 'written by hand' }),
    ).resolves.toMatchObject({
      text: 'written by hand',
    });
  });

  it('leaves a message with no HTML alone', async () => {
    await expect(compiled({ text: 'only text' })).resolves.toEqual({
      text: 'only text',
    });
  });
});
