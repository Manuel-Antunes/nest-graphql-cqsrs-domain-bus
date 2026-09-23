import { Session } from '@thallesp/nestjs-better-auth';

import { AuthorPipe } from '../pipes/author.pipe';
import { SessionUserPipe } from '../pipes/session-user.pipe';

export const CurrentUser = () => Session(SessionUserPipe);

export const CurrentAuthor = () => Session(SessionUserPipe, AuthorPipe);
