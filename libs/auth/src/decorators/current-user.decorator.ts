import { AuthorPipe } from '@nestposts/users/pipes/author.pipe';

import { IdentityUserPipe } from '../pipes/identity-user.pipe';
import { CurrentIdentity } from './current-identity.decorator';

export const CurrentUser = () => CurrentIdentity(IdentityUserPipe);

export const CurrentAuthor = () =>
  CurrentIdentity(IdentityUserPipe, AuthorPipe);
