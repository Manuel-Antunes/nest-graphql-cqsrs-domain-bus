<script>
import { gql } from '@apollo/client/core';
import Badge from 'next/ui/badge/Badge.vue';

export const ClientBadges_Fragment = gql`
  fragment ClientBadges_Fragment on Client {
    kind
    status
    isDeceased
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

// `ClientKind` values (JUDGMENT_CREDITOR | HEIR) are unchanged from the old
// `PersonType`, so they still map 1:1 onto the existing `TYPE_*` translation
// keys — the flattening cost us no locale churn.
const kindLabel = computed(() => {
  const kind = props.client?.kind;
  if (!kind) return null;
  return t(`CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.TYPE_${kind}`);
});

const statusLabel = computed(() => {
  const s = props.client?.status;
  if (!s) return null;
  return t(`CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.STATUS_${s}`);
});
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <Badge v-if="kindLabel" variant="outline">
      {{ kindLabel }}
    </Badge>
    <Badge v-if="statusLabel" variant="outline">
      {{ statusLabel }}
    </Badge>
    <Badge v-if="client.isDeceased" variant="destructive">
      {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.IS_DECEASED') }}
    </Badge>
  </div>
</template>
