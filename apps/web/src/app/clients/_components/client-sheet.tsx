'use client';

import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@nestposts/ui/components/ui/alert-dialog';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button, buttonVariants } from '@nestposts/ui/components/ui/button';
import { Separator } from '@nestposts/ui/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@nestposts/ui/components/ui/sheet';
import {
  ExternalLinkIcon,
  MessagesSquareIcon,
  PencilIcon,
  Trash2Icon,
  UnlinkIcon,
} from 'lucide-react';

import { Chatwoot } from '@/lib/chatwoot';

import { useClientMutations } from '../_hooks/use-client-mutations';
import type { ClientContact, ClientRow } from '../clients';
import {
  CLIENT_KIND_LABELS,
  CLIENT_STATUS_LABELS,
  ClientFormat,
} from '../clients';
import type { ClientPermissions } from './clients-view';
import { ContactLinker } from './contact-linker';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  );
}

function LinkedContact({
  client,
  contact,
  canUnlink,
}: {
  client: ClientRow;
  contact: ClientContact;
  canUnlink: boolean;
}) {
  const { unlinkContact } = useClientMutations();
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {contact.name || 'Unnamed contact'}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {[contact.email, contact.phoneNumber].filter(Boolean).join(' · ') ||
            '—'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={Chatwoot.supportPathOf(contact.dashboardPath)}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          <ExternalLinkIcon />
          Open in Chatwoot
        </Link>
        {canUnlink && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Unlink ${contact.name ?? 'contact'}`}
            disabled={unlinkContact.isPending}
            onClick={() =>
              unlinkContact.mutate({
                input: { contactId: contact.id, clientId: client.id },
              })
            }
          >
            <UnlinkIcon />
          </Button>
        )}
      </div>
    </li>
  );
}

export function ClientSheet({
  client,
  permissions,
  onClose,
  onEdit,
}: {
  client: ClientRow | null;
  permissions: ClientPermissions;
  onClose: () => void;
  onEdit: (client: ClientRow) => void;
}) {
  const { deleteClient } = useClientMutations();
  const contacts = client ? ClientFormat.contactsOf(client) : [];

  return (
    <Sheet open={client !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {client && (
          <>
            <SheetHeader>
              <SheetTitle>{client.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>{ClientFormat.cpf(client.cpf)}</span>
                <Badge variant="secondary">
                  {CLIENT_KIND_LABELS[client.kind]}
                </Badge>
                <Badge variant={client.isActive ? 'default' : 'outline'}>
                  {CLIENT_STATUS_LABELS[client.status]}
                </Badge>
                {client.isDeceased && <Badge variant="outline">Deceased</Badge>}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4">
              <dl className="grid grid-cols-2 gap-4">
                <Detail label="RG" value={client.rg} />
                <Detail label="Occupation" value={client.occupation} />
                <Detail
                  label="Birth date"
                  value={ClientFormat.date(client.birthDate)}
                />
                <Detail
                  label="Death date"
                  value={
                    client.deathDate
                      ? ClientFormat.date(client.deathDate)
                      : null
                  }
                />
                <Detail label="Labor union" value={client.unionMembership} />
                <Detail label="Registered by" value={client.createdBy?.name} />
                <div className="col-span-2">
                  <Detail
                    label="Address"
                    value={ClientFormat.address(client.address)}
                  />
                </div>
                <div className="col-span-2 flex flex-wrap gap-1.5">
                  {client.isQualified && (
                    <Badge variant="outline">Qualified</Badge>
                  )}
                  {client.documentationComplete && (
                    <Badge variant="outline">Documentation complete</Badge>
                  )}
                  {client.hasPendingLitigation && (
                    <Badge variant="outline">Other litigation pending</Badge>
                  )}
                  {client.hasRenounced && (
                    <Badge variant="destructive">Renounced</Badge>
                  )}
                </div>
                {client.notes && (
                  <div className="col-span-2">
                    <Detail
                      label="Notes"
                      value={
                        <span className="whitespace-pre-wrap">
                          {client.notes}
                        </span>
                      }
                    />
                  </div>
                )}
              </dl>

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessagesSquareIcon className="size-4 text-muted-foreground" />
                  <h3 className="font-medium">Chatwoot contacts</h3>
                </div>
                {contacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No contact is linked to this client yet.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {contacts.map((contact) => (
                      <LinkedContact
                        key={contact.id}
                        client={client}
                        contact={contact}
                        canUnlink={permissions.canUpdate}
                      />
                    ))}
                  </ul>
                )}
                {permissions.canUpdate && <ContactLinker client={client} />}
              </section>
            </div>

            <SheetFooter className="flex-row justify-end">
              {permissions.canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={<Button variant="ghost" className="mr-auto" />}
                  >
                    <Trash2Icon />
                    Remove
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {client.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The client is removed from this organization. Their
                        Chatwoot contacts and conversations stay in Chatwoot.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={async () => {
                          await deleteClient.mutateAsync({ id: client.id });
                          onClose();
                        }}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {permissions.canUpdate && (
                <Button onClick={() => onEdit(client)}>
                  <PencilIcon />
                  Edit
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
