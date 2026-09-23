import type { Provider } from '@nestjs/common';

import { EventLog, MikroOrmEventLog } from './event-log';

/**
 * **What a service that keeps a log binds.** One provider, because there is one thing to bind now: the
 * store, the feed, the sink that filled one and the writer that filled the other were four objects
 * answering to one table.
 */
export const eventLogProviders: Provider[] = [
  { provide: EventLog, useClass: MikroOrmEventLog },
];
