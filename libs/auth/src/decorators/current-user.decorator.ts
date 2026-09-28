import { AuthorPipe } from '@nestposts/users/pipes/author.pipe';
import { Session } from '@thallesp/nestjs-better-auth';

import { SessionUserPipe } from '../pipes/session-user.pipe';

export const CurrentUser = () => Session(SessionUserPipe);

export const CurrentAuthor = () => Session(SessionUserPipe, AuthorPipe);
