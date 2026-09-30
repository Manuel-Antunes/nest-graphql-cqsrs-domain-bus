'use client';

import { useState } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import { Input } from '@nestposts/ui/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@nestposts/ui/components/ui/input-group';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { useDebounce } from '@nestposts/ui/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';
import { LinkIcon, SearchIcon, UserPlusIcon } from 'lucide-react';

import { useClientMutations } from '../_hooks/use-client-mutations';
import type { ClientRow } from '../clients';
import { contactSearchOptions } from '../query';

const MIN_SEARCH = 2;

function ContactSearch({ client }: { client: ClientRow }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term.trim(), 300);
  const { linkContact } = useClientMutations();
  const found = useQuery({
    ...contactSearchOptions(debounced),
    enabled: debounced.length >= MIN_SEARCH,
  });
  const contacts = found.data?.contacts.data?.filter(
    (contact) => contact !== null,
  );

  return (
    <div className="space-y-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search Chatwoot contacts by name or email"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        {found.isFetching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </InputGroup>

      {debounced.length >= MIN_SEARCH && contacts?.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No contact in this organization&apos;s Chatwoot matches.
        </p>
      )}

      <ul className="divide-y rounded-md border empty:hidden">
        {contacts?.map((contact) => {
          const linkedElsewhere =
            contact.client && contact.client.id !== client.id;
          const linkedHere = contact.client?.id === client.id;
          return (
            <li
              key={contact.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {contact.name || 'Unnamed contact'}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {[contact.email, contact.phoneNumber]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                  {linkedElsewhere &&
                    ` · linked to ${contact.client?.name ?? 'another client'}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(contact.client) || linkContact.isPending}
                onClick={() =>
                  linkContact.mutate({
                    input: { contactId: contact.id, clientId: client.id },
                  })
                }
              >
                <LinkIcon />
                {linkedHere ? 'Linked' : 'Link'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewContact({ client }: { client: ClientRow }) {
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const { createContact, linkContact } = useClientMutations();
  const busy = createContact.isPending || linkContact.isPending;
  const reachable = Boolean(email.trim() || phoneNumber.trim());

  const create = async () => {
    const created = await createContact.mutateAsync({
      input: {
        name: name.trim() || client.name,
        email: email.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
      },
    });
    const contactId = created.createContact?.contact?.id;
    if (!contactId) return;
    await linkContact.mutateAsync({
      input: { contactId, clientId: client.id },
    });
    setEmail('');
    setPhoneNumber('');
  };

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Input
        aria-label="Contact name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label="Contact email"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        aria-label="Contact phone"
        placeholder="Phone, +5581…"
        value={phoneNumber}
        onChange={(event) => setPhoneNumber(event.target.value)}
      />
      <Button
        className="sm:col-span-3"
        variant="secondary"
        disabled={!reachable || busy}
        onClick={create}
      >
        <UserPlusIcon />
        Create in Chatwoot and link
      </Button>
    </div>
  );
}

export function ContactLinker({ client }: { client: ClientRow }) {
  return (
    <div className="space-y-4">
      <ContactSearch client={client} />
      <NewContact client={client} />
    </div>
  );
}
