<script>
import { gql } from '@apollo/client/core';

/**
 * `Client` is a single flat type, so one fragment covers every client — the
 * inline `... on Heir` fragment the old `Person` interface needed is gone.
 */
export const LinkableClientRow_ClientFragment = gql`
  fragment LinkableClientRow_ClientFragment on Client {
    id
    kind
    name
    cpf
  }
`;
</script>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  client: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
});

defineEmits(['select']);

const { t } = useI18n();

const kindLabel = computed(() => {
  const kind = props.client?.kind;
  if (!kind) return '';
  return t(`CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.TYPE_${kind}`);
});

const subtitle = computed(() => props.client.cpf || '');
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border border-n-strong bg-n-alpha-2 px-3 py-2 text-left transition hover:border-n-brand hover:bg-n-alpha-3 disabled:cursor-not-allowed disabled:opacity-60"
    :disabled="disabled"
    @click="$emit('select', client)"
  >
    <div
      class="flex w-full min-w-0 items-center gap-2 text-sm font-medium text-n-slate-12"
    >
      <span class="truncate">{{ client.name }}</span>
      <span
        v-if="kindLabel"
        class="max-w-[45%] truncate rounded-full bg-n-alpha-3 px-2 py-0.5 text-[11px] uppercase tracking-wide text-n-slate-11"
      >
        {{ kindLabel }}
      </span>
    </div>
    <div class="w-full truncate text-xs text-n-slate-11">
      {{ subtitle }}
    </div>
  </button>
</template>
