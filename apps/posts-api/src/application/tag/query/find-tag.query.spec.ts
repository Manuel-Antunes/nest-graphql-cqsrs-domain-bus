import type { TestingModule } from '@nestjs/testing';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';

import {
  createCqrsTestingModule,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenATag } from '../../../../test/support/post-fixtures';
import { FindTagQuery } from './find-tag.query';

describe('FindTagQuery.Handler', () => {
  let module: TestingModule;
  let handler: FindTagQuery.Handler;

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindTagQuery.Handler]);
    handler = module.get(FindTagQuery.Handler);
  });

  afterEach(() => module.close());

  it('gives back the tag that is there', async () => {
    const tag = await givenATag(module, 'Untagged');

    const found = await inRequestContext(module, () =>
      handler.execute(new FindTagQuery.FindTag(tag.id)),
    );

    expect(found!.id.equals(tag.id)).toBe(true);
    expect(found!.name.value).toBe('Untagged');
  });

  it('an unknown id is null, and not an error', async () => {
    const found = await inRequestContext(module, () =>
      handler.execute(new FindTagQuery.FindTag(TagId.generate())),
    );

    expect(found).toBeNull();
  });
});
