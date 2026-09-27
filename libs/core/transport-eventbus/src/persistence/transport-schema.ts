/**
 * **The schema the transport's own tables live in**: the outbox, its dead letters, the inbox and the
 * event log.
 *
 * They are the transport's bookkeeping, not a tenant's data — one outbox for every message this system
 * owes a broker, one inbox for every message it receives, one log for every event it keeps — so they
 * are pinned here, created with the system
 * migrations, and never wait on a tenant's schema to exist. What a row still says about tenancy, the
 * log says in a column: the tenant it was written in.
 */
export const TRANSPORT_SCHEMA = 'transport';
