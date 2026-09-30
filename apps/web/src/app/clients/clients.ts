import type { ClientKind, ClientStatus, ClientsQuery } from '@/gql/graphql';

export type ClientRow = ClientsQuery['clients']['edges'][number]['node'];

export type ClientContact = NonNullable<
  NonNullable<ClientRow['contacts']['nodes']>[number]
>;

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  JUDGMENT_CREDITOR: 'Judgment creditor',
  HEIR: 'Heir',
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  ARCHIVED: 'Archived',
};

export const CLIENT_KINDS = Object.keys(CLIENT_KIND_LABELS) as ClientKind[];

export const CLIENT_STATUSES = Object.keys(
  CLIENT_STATUS_LABELS,
) as ClientStatus[];

export class ClientFormat {
  static cpf(digits: string): string {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  static date(value: string | null | undefined): string {
    return value
      ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' })
      : '—';
  }

  static address(address: ClientRow['address']): string {
    const street = [address.street, address.number, address.complement]
      .filter(Boolean)
      .join(', ');
    const place = [address.city, address.state].filter(Boolean).join(' / ');
    return [street, place, address.zipCode].filter(Boolean).join(' — ') || '—';
  }

  static contactsOf(client: ClientRow): ClientContact[] {
    return (client.contacts.nodes ?? []).filter(
      (contact): contact is ClientContact => contact !== null,
    );
  }
}
