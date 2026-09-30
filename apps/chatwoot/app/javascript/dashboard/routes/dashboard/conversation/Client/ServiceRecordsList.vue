<script>
import { gql } from '@apollo/client/core';

/**
 * A contact's service records (atendimentos) — the migrated replacement for the
 * old single `JudgmentCreditor.nextServiceFollowUp`. Service records are scoped
 * to the Chatwoot contact, so this is a fragment on `Contact` (fetched via the
 * federated `Contact.serviceRecords` connection as part of the parent contact
 * query — no separate round-trip).
 */
export const ServiceRecordsList_Fragment = gql`
  fragment ServiceRecordsList_Fragment on Contact {
    serviceRecords(paging: { first: 20 }) {
      edges {
        node {
          id
          title
          startDate
          responsible {
            name
          }
        }
      }
    }
  }
`;
</script>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from 'next/ui/label';

const props = defineProps({
  contact: { type: Object, required: true },
});

const emit = defineEmits(['open-record']);

const { t } = useI18n();

const formattedDateTime = value => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
};

/** Numeric timestamp for sorting; records without a valid date sink to the end. */
const toTime = value => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? -Infinity : time;
};

const metaLine = record =>
  [formattedDateTime(record.startDate), record.responsible?.name]
    .filter(Boolean)
    .join(' · ');

/**
 * Every linked record (not just upcoming ones — migrated atendimentos are
 * historical), most recent first, capped to a short list. Clicking a record
 * deep-links to the full atendimentos screen scrolled to that entry.
 */
const records = computed(() =>
  (props.contact?.serviceRecords?.edges ?? [])
    .map(edge => edge?.node)
    .filter(Boolean)
    .sort((a, b) => toTime(b.startDate) - toTime(a.startDate))
    .slice(0, 5)
);
</script>

<template>
  <div class="flex flex-col gap-2 min-w-0">
    <Label class="text-sm font-medium text-n-slate-12">
      {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.SERVICE_RECORDS') }}
    </Label>
    <p v-if="records.length === 0" class="text-sm text-n-slate-11">
      {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.SERVICE_RECORDS_EMPTY') }}
    </p>
    <ul v-else class="flex flex-col gap-1">
      <li v-for="record in records" :key="record.id" class="min-w-0">
        <button
          type="button"
          class="flex flex-col w-full gap-0.5 px-2 py-1.5 -mx-2 text-left rounded-md transition-colors hover:bg-n-slate-3"
          @click="emit('open-record', record.id)"
        >
          <span class="block text-sm font-medium truncate">
            {{ record.title }}
          </span>
          <span v-if="metaLine(record)" class="text-xs text-n-slate-11">
            {{ metaLine(record) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
