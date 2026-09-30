'use client';

import { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@nestposts/ui/components/ui/button';
import { Checkbox } from '@nestposts/ui/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nestposts/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@nestposts/ui/components/ui/form';
import { Input } from '@nestposts/ui/components/ui/input';
import { MaskedInput } from '@nestposts/ui/components/ui/masked-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nestposts/ui/components/ui/select';
import { Textarea } from '@nestposts/ui/components/ui/textarea';
import type { FieldPath } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type {
  ClientKind,
  ClientStatus,
  CreateClientInput,
} from '@/gql/graphql';

import { useClientMutations } from '../_hooks/use-client-mutations';
import type { ClientRow } from '../clients';
import {
  CLIENT_KIND_LABELS,
  CLIENT_KINDS,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
} from '../clients';

const CPF_DIGITS = 11;

const ClientFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    cpf: z
      .string()
      .refine(
        (cpf) => cpf.replace(/\D/g, '').length === CPF_DIGITS,
        `A CPF has ${CPF_DIGITS} digits`,
      ),
    kind: z.enum(CLIENT_KINDS as [ClientKind, ...ClientKind[]]),
    status: z.enum(CLIENT_STATUSES as [ClientStatus, ...ClientStatus[]]),
    rg: z.string(),
    birthDate: z.string(),
    deathDate: z.string(),
    isDeceased: z.boolean(),
    occupation: z.string(),
    unionMembership: z.string(),
    notes: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    hasPendingLitigation: z.boolean(),
    hasRenounced: z.boolean(),
    isQualified: z.boolean(),
    documentationComplete: z.boolean(),
  })
  .refine((form) => !form.deathDate || form.isDeceased, {
    message: 'A client with a death date is deceased',
    path: ['isDeceased'],
  })
  .refine(
    (form) =>
      !form.birthDate || !form.deathDate || form.deathDate >= form.birthDate,
    {
      message: 'The death date cannot precede the birth date',
      path: ['deathDate'],
    },
  );

type ClientForm = z.infer<typeof ClientFormSchema>;

type TextField = Extract<
  FieldPath<ClientForm>,
  | 'rg'
  | 'occupation'
  | 'unionMembership'
  | 'street'
  | 'number'
  | 'complement'
  | 'city'
  | 'state'
>;

type Flag = Extract<
  FieldPath<ClientForm>,
  | 'hasPendingLitigation'
  | 'hasRenounced'
  | 'isQualified'
  | 'documentationComplete'
>;

const FLAGS: ReadonlyArray<{ name: Flag; label: string }> = [
  { name: 'isQualified', label: 'Qualified' },
  { name: 'documentationComplete', label: 'Documentation complete' },
  { name: 'hasPendingLitigation', label: 'Other litigation pending' },
  { name: 'hasRenounced', label: 'Renounced their rights' },
];

class ClientFormValues {
  static of(client: ClientRow | null): ClientForm {
    return {
      name: client?.name ?? '',
      cpf: client?.cpf ?? '',
      kind: client?.kind ?? 'JUDGMENT_CREDITOR',
      status: client?.status ?? 'ACTIVE',
      rg: client?.rg ?? '',
      birthDate: ClientFormValues.dayOf(client?.birthDate),
      deathDate: ClientFormValues.dayOf(client?.deathDate),
      isDeceased: client?.isDeceased ?? false,
      occupation: client?.occupation ?? '',
      unionMembership: client?.unionMembership ?? '',
      notes: client?.notes ?? '',
      street: client?.address.street ?? '',
      number: client?.address.number ?? '',
      complement: client?.address.complement ?? '',
      city: client?.address.city ?? '',
      state: client?.address.state ?? '',
      zipCode: client?.address.zipCode ?? '',
      hasPendingLitigation: client?.hasPendingLitigation ?? false,
      hasRenounced: client?.hasRenounced ?? false,
      isQualified: client?.isQualified ?? false,
      documentationComplete: client?.documentationComplete ?? false,
    };
  }

  static toInput(form: ClientForm): CreateClientInput {
    const text = (value: string) => value.trim() || null;
    return {
      name: form.name.trim(),
      cpf: form.cpf.replace(/\D/g, ''),
      kind: form.kind,
      rg: text(form.rg),
      birthDate: ClientFormValues.instantOf(form.birthDate),
      deathDate: ClientFormValues.instantOf(form.deathDate),
      isDeceased: form.isDeceased,
      occupation: text(form.occupation),
      unionMembership: text(form.unionMembership),
      notes: text(form.notes),
      address: {
        street: text(form.street),
        number: text(form.number),
        complement: text(form.complement),
        city: text(form.city),
        state: text(form.state),
        zipCode: text(form.zipCode),
      },
      hasPendingLitigation: form.hasPendingLitigation,
      hasRenounced: form.hasRenounced,
      isQualified: form.isQualified,
      documentationComplete: form.documentationComplete,
    };
  }

  private static dayOf(instant: string | null | undefined): string {
    return instant ? instant.slice(0, 10) : '';
  }

  private static instantOf(day: string): string | null {
    return day ? `${day}T00:00:00.000Z` : null;
  }
}

export function ClientFormDialog({
  client,
  open,
  onOpenChange,
}: {
  client: ClientRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formId = useId();
  const { createClient, updateClient } = useClientMutations();
  const form = useForm<ClientForm>({
    resolver: zodResolver(ClientFormSchema),
    values: ClientFormValues.of(client),
  });
  const saving = createClient.isPending || updateClient.isPending;

  const submit = form.handleSubmit(async (values) => {
    const input = ClientFormValues.toInput(values);
    if (client) {
      await updateClient.mutateAsync({
        input: { ...input, id: client.id, status: values.status },
      });
    } else {
      await createClient.mutateAsync({ input });
    }
    onOpenChange(false);
  });

  const textField = (name: TextField, label: string, className?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const dateField = (name: 'birthDate' | 'deathDate', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="date" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const flagField = (name: Flag | 'isDeceased', label: string) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-2">
          <FormControl>
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          </FormControl>
          <FormLabel className="font-normal">{label}</FormLabel>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>
            A client belongs to the active organization. Their Chatwoot contacts
            are linked from the client&apos;s page.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id={formId} onSubmit={submit} className="grid gap-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <MaskedInput mask="999.999.999-99" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {textField('rg', 'RG')}
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kind</FormLabel>
                    <Select
                      items={CLIENT_KINDS.map((kind) => ({
                        value: kind,
                        label: CLIENT_KIND_LABELS[kind],
                      }))}
                      value={field.value}
                      onValueChange={(kind) => kind && field.onChange(kind)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CLIENT_KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {CLIENT_KIND_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {client && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        items={CLIENT_STATUSES.map((status) => ({
                          value: status,
                          label: CLIENT_STATUS_LABELS[status],
                        }))}
                        value={field.value}
                        onValueChange={(status) =>
                          status && field.onChange(status)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CLIENT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {CLIENT_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {textField('occupation', 'Occupation')}
              {textField('unionMembership', 'Labor union')}
              {dateField('birthDate', 'Birth date')}
              {dateField('deathDate', 'Death date')}
            </section>

            <section className="grid gap-4 sm:grid-cols-6">
              {textField('street', 'Street', 'sm:col-span-4')}
              {textField('number', 'Number', 'sm:col-span-2')}
              {textField('complement', 'Complement', 'sm:col-span-3')}
              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Zip code</FormLabel>
                    <FormControl>
                      <MaskedInput mask="99999-999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {textField('city', 'City', 'sm:col-span-4')}
              {textField('state', 'State', 'sm:col-span-2')}
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              {flagField('isDeceased', 'Deceased')}
              {FLAGS.map((flag) => flagField(flag.name, flag.label))}
            </section>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={saving}>
            {client ? 'Save changes' : 'Register client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
