<script setup>
import { computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { gql } from '@apollo/client/core';

import ClientBadges, { ClientBadges_Fragment } from './ClientBadges.vue';

const props = defineProps({
  contact: { type: Object, required: true },
});

const contactId = computed(() => props.contact?.id);

const ContactClientBadges_ContactQuery = gql`
  query ContactClientBadges_ContactQuery($id: Mixed!) {
    contacts(where: { column: ID, operator: EQ, value: $id }, first: 1) {
      data {
        id
        client {
          __typename
          ...ClientBadges_Fragment
        }
      }
    }
  }
  ${ClientBadges_Fragment}
`;

const { result: contactResult } = useQuery(
  ContactClientBadges_ContactQuery,
  () => ({ id: contactId.value }),
  () => ({ enabled: !!contactId.value })
);

const client = computed(
  () => contactResult.value?.contacts?.data?.[0]?.client ?? null
);
</script>

<template>
  <ClientBadges v-if="client" :client="client" />
</template>
