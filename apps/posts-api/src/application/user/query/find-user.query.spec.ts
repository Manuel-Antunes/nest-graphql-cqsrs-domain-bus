import type { TestingModule } from '@nestjs/testing';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  createCqrsTestingModule,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAnAuthor,
  givenAUser,
} from '../../../../test/support/post-fixtures';
import { FindUserQuery } from './find-user.query';

describe('FindUserQuery.Handler', () => {
  let module: TestingModule;
  let handler: FindUserQuery.Handler;

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindUserQuery.Handler]);
    handler = module.get(FindUserQuery.Handler);
  });

  afterEach(() => module.close());

  it('gives back the user, whatever capability they carry', async () => {
    const reader = await givenAUser(module, 'reader@example.com', 'reader');

    const found = await inRequestContext(module, () =>
      handler.execute(new FindUserQuery.FindUser(reader.id)),
    );

    expect(found?.email.value).toBe('reader@example.com');
    expect(found?.hasRole(AUTHOR_ROLE)).toBe(false);
  });

  it('an author is a user too — the roles travel with the row, and the type is decided above', async () => {
    const author = await givenAnAuthor(module, 'manuel@example.com');

    const found = await inRequestContext(module, () =>
      handler.execute(new FindUserQuery.FindUser(author.id)),
    );

    expect(found?.hasRole(AUTHOR_ROLE)).toBe(true);
  });

  it('an unknown id is null, and not an error', async () => {
    const found = await inRequestContext(module, () =>
      handler.execute(new FindUserQuery.FindUser(UserId.generate())),
    );

    expect(found).toBeNull();
  });
});
