'use client';

import { useState } from 'react';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nestposts/ui/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@nestposts/ui/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@nestposts/ui/components/ui/table';
import { useDebounce } from '@nestposts/ui/hooks/use-debounce';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  MessagesSquareIcon,
  PlusIcon,
  SearchIcon,
  UsersRoundIcon,
} from 'lucide-react';

import type {
  ClientFilterInput,
  ClientKind,
  ClientStatus,
} from '@/gql/graphql';

import type { ClientRow } from '../clients';
import {
  CLIENT_KIND_LABELS,
  CLIENT_KINDS,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  ClientFormat,
} from '../clients';
import { clientsOptions } from '../query';
import { ClientFormDialog } from './client-form-dialog';
import { ClientSheet } from './client-sheet';

export interface ClientPermissions {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
}

const ANY = 'ANY';

type Editing = { client: ClientRow | null } | null;

export function ClientsView({
  permissions,
}: {
  permissions: ClientPermissions;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ClientKind | typeof ANY>(ANY);
  const [status, setStatus] = useState<ClientStatus | typeof ANY>(ANY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const debouncedSearch = useDebounce(search.trim(), 300);

  const filter: ClientFilterInput = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(kind !== ANY ? { kind } : {}),
    ...(status !== ANY ? { status } : {}),
  };
  const { data, isFetching } = useQuery({
    ...clientsOptions(filter),
    placeholderData: keepPreviousData,
  });

  const clients = data?.clients.edges.map((edge) => edge.node) ?? [];
  const selected = clients.find((client) => client.id === selectedId) ?? null;
  const filtering = Boolean(debouncedSearch) || kind !== ANY || status !== ANY;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-56 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by name or CPF"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <Select
          items={[
            { value: ANY, label: 'Every kind' },
            ...CLIENT_KINDS.map((value) => ({
              value,
              label: CLIENT_KIND_LABELS[value],
            })),
          ]}
          value={kind}
          onValueChange={(value) => value && setKind(value)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every kind</SelectItem>
            {CLIENT_KINDS.map((value) => (
              <SelectItem key={value} value={value}>
                {CLIENT_KIND_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: ANY, label: 'Every status' },
            ...CLIENT_STATUSES.map((value) => ({
              value,
              label: CLIENT_STATUS_LABELS[value],
            })),
          ]}
          value={status}
          onValueChange={(value) => value && setStatus(value)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every status</SelectItem>
            {CLIENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {CLIENT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {permissions.canCreate && (
          <Button onClick={() => setEditing({ client: null })}>
            <PlusIcon />
            New client
          </Button>
        )}
      </div>

      {clients.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRoundIcon />
            </EmptyMedia>
            <EmptyTitle>
              {filtering ? 'No client matches' : 'No client yet'}
            </EmptyTitle>
            <EmptyDescription>
              {filtering
                ? 'Try another name, CPF or filter.'
                : 'Register the people this organization represents, then link their Chatwoot contacts.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className={`rounded-lg border transition-opacity ${isFetching ? 'opacity-70' : ''}`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const contacts = ClientFormat.contactsOf(client);
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setSelectedId(client.id)}
                      >
                        {client.name}
                      </button>
                      <p className="text-muted-foreground text-xs">
                        {[client.occupation, client.address.city]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ClientFormat.cpf(client.cpf)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {CLIENT_KIND_LABELS[client.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? 'default' : 'outline'}>
                        {CLIENT_STATUS_LABELS[client.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                        <MessagesSquareIcon className="size-3.5" />
                        {contacts.length}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {data?.clients.totalCount ?? clients.length} client(s)
      </p>

      <ClientSheet
        client={selected}
        permissions={permissions}
        onClose={() => setSelectedId(null)}
        onEdit={(client) => setEditing({ client })}
      />
      <ClientFormDialog
        client={editing?.client ?? null}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}
