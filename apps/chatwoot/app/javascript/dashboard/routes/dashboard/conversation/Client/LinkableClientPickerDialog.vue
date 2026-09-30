<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery, useMutation } from '@vue/apollo-composable';
import { useIntersectionObserver } from '@vueuse/core';
import { gql } from '@apollo/client/core';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import { Input } from 'next/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'next/ui/select';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { emitter } from 'shared/helpers/mitt';

import LinkableClientRow, {
  LinkableClientRow_ClientFragment,
} from './LinkableClientRow.vue';

const props = defineProps({
  contactId: {
    type: [String, Number],
    required: true,
  },
});

const emit = defineEmits(['linked']);

const { t } = useI18n();

const PAGE_LIMIT = 10;

// Sentinel for "no `ClientKind` filter" — `Select` needs a non-empty value.
const ALL_KINDS = 'ALL';

const searchQuery = ref('');
const debouncedQuery = ref('');
const kindFilter = ref(ALL_KINDS);
const isDialogOpen = ref(false);
const isSaving = ref(false);
let searchTimeout = null;

const kindOptions = computed(() => [
  {
    value: ALL_KINDS,
    label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.TYPE_ALL'),
  },
  {
    value: 'JUDGMENT_CREDITOR',
    label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.TYPE_JUDGMENT_CREDITOR'),
  },
  {
    value: 'HEIR',
    label: t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.TYPE_HEIR'),
  },
]);

// The bespoke `people(filter: PersonsFilterInput)` root is gone with the legal
// module. `clients` is the nestjs-query CRUD root generated from `client.graphql`,
// so the free-text search becomes an explicit `or` over the filterable columns.
const LinkableClientPickerDialog_ClientsQuery = gql`
  query LinkableClientPickerDialog_ClientsQuery(
    $filter: ClientFilter!
    $paging: OffsetPaging!
  ) {
    clients(filter: $filter, paging: $paging) {
      nodes {
        ...LinkableClientRow_ClientFragment
      }
      pageInfo {
        hasNextPage
      }
      totalCount
    }
  }
  ${LinkableClientRow_ClientFragment}
`;

const buildFilter = () => {
  const and = [];
  const search = debouncedQuery.value;
  if (search) {
    and.push({
      or: [{ name: { iLike: `%${search}%` } }, { cpf: { iLike: `%${search}%` } }],
    });
  }
  if (kindFilter.value !== ALL_KINDS) {
    and.push({ kind: { eq: kindFilter.value } });
  }
  return and.length ? { and } : {};
};

const queryVariables = computed(() => ({
  filter: buildFilter(),
  paging: { limit: PAGE_LIMIT, offset: 0 },
}));

const {
  result,
  loading: isLoading,
  fetchMore,
} = useQuery(LinkableClientPickerDialog_ClientsQuery, queryVariables, () => ({
  enabled: isDialogOpen.value,
}));

const linkableClients = computed(() => result.value?.clients?.nodes ?? []);
const hasNextPage = computed(
  () => result.value?.clients?.pageInfo?.hasNextPage ?? false
);

const hasSearched = computed(
  () => isDialogOpen.value && (!isLoading.value || !!result.value)
);

const isLoadingMore = ref(false);
const loadMoreSentinel = ref(null);

const loadMore = async () => {
  if (!hasNextPage.value || isLoadingMore.value || isLoading.value) return;
  isLoadingMore.value = true;
  try {
    await fetchMore({
      variables: {
        ...queryVariables.value,
        paging: {
          limit: PAGE_LIMIT,
          offset: linkableClients.value.length,
        },
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult?.clients) return prev;
        return {
          clients: {
            ...fetchMoreResult.clients,
            nodes: [...prev.clients.nodes, ...fetchMoreResult.clients.nodes],
          },
        };
      },
    });
  } finally {
    isLoadingMore.value = false;
  }
};

useIntersectionObserver(loadMoreSentinel, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});

// One flat `Client` id space, so one mutation links an exequente or a herdeiro
// alike — no branching on a concrete type.
const LinkableClientPickerDialog_LinkClientMutation = gql`
  mutation LinkableClientPickerDialog_LinkClientMutation(
    $input: LinkContactToClientInput!
  ) {
    linkContactToClient(input: $input) {
      contact {
        id
      }
    }
  }
`;

const { mutate: linkToClient } = useMutation(
  LinkableClientPickerDialog_LinkClientMutation
);

const open = () => {
  resetState();
  isDialogOpen.value = true;
};

const close = () => {
  isDialogOpen.value = false;
};

const resetState = () => {
  clearTimeout(searchTimeout);
  searchQuery.value = '';
  debouncedQuery.value = '';
  kindFilter.value = ALL_KINDS;
  isSaving.value = false;
};

const handleSelect = async client => {
  if (!client || isSaving.value) return;

  isSaving.value = true;

  try {
    await linkToClient({
      input: {
        contactId: String(props.contactId),
        clientId: client.id,
      },
    });
    emitter.emit(BUS_EVENTS.CONTACT_LINKED_PERSON_UPDATED, {
      contactId: props.contactId,
    });
    emit('linked', client);
    close();
    resetState();
  } finally {
    isSaving.value = false;
  }
};

watch(searchQuery, value => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    debouncedQuery.value = value.trim();
  }, 250);
});

onBeforeUnmount(() => {
  clearTimeout(searchTimeout);
});

defineExpose({ open, close });
</script>

<template>
  <Dialog
    :open="isDialogOpen"
    @update:open="
      val => {
        if (!val) close();
      }
    "
  >
    <DialogContent class="flex flex-col max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{
            t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.DESCRIPTION')
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4 px-4 py-4">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{
              t(
                'CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.SEARCH_LABEL'
              )
            }}
          </span>
          <Input
            v-model="searchQuery"
            type="search"
            :placeholder="
              t(
                'CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.SEARCH_PLACEHOLDER'
              )
            "
          />
        </label>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-n-slate-12">
            {{
              t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.TYPE_LABEL')
            }}
          </span>
          <Select v-model="kindFilter">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in kindOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="min-h-40 rounded-lg border border-n-strong bg-n-solid-2 p-3">
          <p v-if="isLoading" class="mb-0 text-sm text-n-slate-11">
            {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.LOADING') }}
          </p>
          <p
            v-else-if="hasSearched && !linkableClients.length"
            class="mb-0 text-sm text-n-slate-11"
          >
            {{ t('CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.EMPTY') }}
          </p>
          <div
            v-else
            class="flex max-h-64 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1"
          >
            <LinkableClientRow
              v-for="client in linkableClients"
              :key="client.id"
              :client="client"
              :disabled="isSaving"
              @select="handleSelect"
            />
            <div
              v-if="hasNextPage"
              ref="loadMoreSentinel"
              class="flex justify-center py-2 text-xs text-n-slate-11"
            >
              <span v-if="isLoadingMore">
                {{
                  t(
                    'CONTACTS_LAYOUT.DETAILS.LINKED_PERSON.LINK_DIALOG.LOADING_MORE'
                  )
                }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
