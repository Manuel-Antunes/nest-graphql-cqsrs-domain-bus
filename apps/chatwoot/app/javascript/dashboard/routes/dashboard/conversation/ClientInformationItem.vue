<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery, useMutation } from '@vue/apollo-composable';
import { gql } from '@apollo/client/core';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import LinkableClientPickerDialog from './Client/LinkableClientPickerDialog.vue';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { emitter } from 'shared/helpers/mitt';

import ClientBasicDetails, {
  ClientBasicDetails_Fragment,
} from './Client/ClientBasicDetails.vue';
import ClientBadges, { ClientBadges_Fragment } from './Client/ClientBadges.vue';
import ServiceRecordsList, {
  ServiceRecordsList_Fragment,
} from './Client/ServiceRecordsList.vue';
import Label from 'next/ui/label/Label.vue';

const props = defineProps({
  contact: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();

const linkableClientPickerRef = ref(null);

const contactId = computed(() => props.contact?.id);

// `Client` is one flat federated entity, so this is a single flat selection —
// the `... on JudgmentCreditor` / `... on Heir` inline fragments are gone along
// with the `Person` interface they narrowed. The kind is just `client.kind`.
const ClientInformationItem_ContactQuery = gql`
  query ClientInformationItem_ContactQuery($id: Mixed!) {
    contacts(where: { column: ID, operator: EQ, value: $id }, first: 1) {
      data {
        id
        ...ServiceRecordsList_Fragment
        client {
          id
          kind
          name
          ...ClientBasicDetails_Fragment
          ...ClientBadges_Fragment
        }
      }
    }
  }
  ${ClientBasicDetails_Fragment}
  ${ClientBadges_Fragment}
  ${ServiceRecordsList_Fragment}
`;

const {
  result: contactResult,
  loading: isLoading,
  error: contactError,
  refetch: refetchContact,
} = useQuery(
  ClientInformationItem_ContactQuery,
  () => ({ id: contactId.value }),
  () => ({ enabled: !!contactId.value })
);

const contactData = computed(
  () => contactResult.value?.contacts?.data?.[0] ?? null
);
const client = computed(() => contactData.value?.client ?? null);
const hasError = computed(() => !!contactError.value);

const openLinkableClientPicker = () => {
  linkableClientPickerRef.value?.open();
};

const refreshClient = async () => {
  await refetchContact();
};

const ClientInformationItem_UnlinkClientMutation = gql`
  mutation ClientInformationItem_UnlinkClientMutation(
    $input: UnlinkContactFromClientInput!
  ) {
    unlinkContactFromClient(input: $input) {
      contact {
        id
      }
    }
  }
`;

const { mutate: unlinkFromClient } = useMutation(
  ClientInformationItem_UnlinkClientMutation
);

const unlinkClient = async () => {
  const c = client.value;
  if (!c) return;

  await unlinkFromClient({
    input: {
      contactId: String(props.contact.id),
      clientId: c.id,
    },
  });

  await refreshClient();
  emitter.emit(BUS_EVENTS.CONTACT_LINKED_PERSON_UPDATED, {
    contactId: props.contact.id,
  });
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="isLoading" class="text-sm text-muted-foreground">
      {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LOADING') }}
    </p>
    <p v-else-if="hasError" class="text-sm text-n-ruby-9">
      {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.ERROR') }}
    </p>
    <div v-else-if="!client" class="flex flex-col gap-2">
      <p class="p-4 text-sm leading-6 text-center text-muted-foreground">
        {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.EMPTY') }}
      </p>
      <Button
        variant="outline"
        class="border-dashed border-muted-foreground text-muted-foreground"
        @click="openLinkableClientPicker"
      >
        <Icon icon="i-lucide-link" />
        {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_CLIENT') }}
      </Button>
    </div>
    <template v-else>
      <div class="min-w-0">
        <Label class="py-1 text-sm font-medium text-n-slate-12">
          {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.NAME') }}
        </Label>
        <span>
          {{ client.name }}
        </span>
      </div>
      <ClientBadges :client="client" />
      <dl class="grid sm:grid-cols-2 grid-cols-1 gap-x-4 gap-y-3 w-full">
        <ClientBasicDetails :client="client" />
      </dl>
      <ServiceRecordsList v-if="contactData" :contact="contactData" />
      <Button variant="outline" @click="unlinkClient">
        <Icon icon="i-lucide-unlink" />
        {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.UNLINK_CLIENT') }}
      </Button>
    </template>
    <LinkableClientPickerDialog
      ref="linkableClientPickerRef"
      :contact-id="props.contact.id"
      @linked="refreshClient"
    />
  </div>
</template>
