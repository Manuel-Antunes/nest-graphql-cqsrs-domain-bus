import { MikroORM } from '@mikro-orm/postgresql';

import { startPostgres } from './postgres';

describe('startPostgres', () => {
  const configured = process.env.POSTGRES_URL;
  const nothingListening =
    'postgresql://nestposts:nestposts@127.0.0.1:1/nestposts';

  const answers = async (clientUrl: string): Promise<boolean> => {
    const orm = await MikroORM.init({
      clientUrl,
      schema: 'public',
      entities: [],
      discovery: { warnWhenNoEntities: false },
    });
    try {
      await orm.em.getConnection().execute('select 1');
      return true;
    } finally {
      await orm.close(true);
    }
  };

  afterEach(() => {
    process.env.POSTGRES_URL = configured;
  });

  it('uses the server already listening, and leaves it alone', async () => {
    const postgres = await startPostgres();

    expect(postgres.clientUrl).toBe(configured);
    await postgres.stop();
    expect(await answers(postgres.clientUrl)).toBe(true);
  });

  it('starts one of its own when the address answers nothing', async () => {
    process.env.POSTGRES_URL = nothingListening;

    const postgres = await startPostgres();

    expect(postgres.clientUrl).not.toBe(nothingListening);
    expect(await answers(postgres.clientUrl)).toBe(true);
    await postgres.stop();
  }, 120000);
});
