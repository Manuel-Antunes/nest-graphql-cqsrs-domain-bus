<script>
import { gql } from '@apollo/client/core';
import { Label } from 'next/ui/label';

/**
 * The common client fields. `Client` is a FLAT entity — the old
 * `JudgmentCreditorDetails` / `HeirDetails` split is gone, because the
 * exequente/herdeiro-specific fields (union, cases, relationship, percentage)
 * no longer exist. What kind of client this is now lives in `kind`, rendered as
 * a badge by `ClientBadges`.
 */
export const ClientBasicDetails_Fragment = gql`
  fragment ClientBasicDetails_Fragment on Client {
    cpf
    rg
    occupation
    birthDate
    deathDate
    unionMembership
  }
`;
</script>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  client: { type: Object, required: true },
});

const { t } = useI18n();

const formattedDate = value => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const PLACEHOLDER = '-';
const display = value =>
  value === null || value === undefined || value === '' ? PLACEHOLDER : value;

const rows = computed(() => {
  const c = props.client;
  return [
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.CPF'),
      value: display(c.cpf),
    },
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.RG'),
      value: display(c.rg),
    },
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.OCCUPATION'),
      value: display(c.occupation),
    },
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.BIRTH_DATE'),
      value: display(formattedDate(c.birthDate)),
    },
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.DEATH_DATE'),
      value: display(formattedDate(c.deathDate)),
    },
    {
      label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.UNION'),
      value: display(c.unionMembership),
    },
  ];
});
</script>

<template>
  <div v-for="row in rows" :key="row.label" class="min-w-0">
    <Label>
      {{ row.label }}
    </Label>
    <span class="inline-flex text-sm gap-1">
      {{ row.value }}
    </span>
  </div>
</template>
