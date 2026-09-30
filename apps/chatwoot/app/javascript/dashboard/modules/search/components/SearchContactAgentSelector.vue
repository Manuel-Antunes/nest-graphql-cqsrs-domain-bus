<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { debounce } from '@chatwoot/utils';
import { useMapGetter } from 'dashboard/composables/store.js';
import { createContactSearcher } from 'dashboard/components-next/NewConversation/helpers/composeConversationHelper';
import { useCamelCase } from 'dashboard/composables/useTransformKeys';
import { fetchContactDetails } from '../helpers/searchHelper';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  label: { type: String, required: true },
});

const emit = defineEmits(['change']);

const searchContacts = createContactSearcher();

const FROM_TYPE = {
  CONTACT: 'contact',
  AGENT: 'agent',
};

const modelValue = defineModel({ type: String, default: null });

const { t } = useI18n();

const searchQuery = ref('');
const searchedContacts = ref([]);
const isSearching = ref(false);
const selectedContact = ref(null);

const agentsList = useMapGetter('agents/getVerifiedAgents');

const createMenuItem = (item, type, isAgent = false) => {
  const transformed = useCamelCase(item, { deep: true });
  const value = `${type}:${transformed.id}`;
  return {
    label: transformed.name,
    value,
    type,
    thumbnail: {
      name: transformed.name,
      src: isAgent ? transformed.avatarUrl : transformed.thumbnail,
    },
    ...(isAgent
      ? {}
      : { description: transformed.email || transformed.phoneNumber }),
    isSelected: modelValue.value === value,
  };
};

const agentsSection = computed(() => {
  const agents =
    agentsList.value?.map(agent =>
      createMenuItem(agent, FROM_TYPE.AGENT, true)
    ) || [];
  return searchQuery.value
    ? agents.filter(agent =>
        agent.label.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    : agents;
});

const contactsSection = computed(
  () =>
    searchedContacts.value?.map(contact =>
      createMenuItem(contact, FROM_TYPE.CONTACT)
    ) || []
);

const menuSections = computed(() => [
  {
    title: t('SEARCH.FILTERS.CONTACTS'),
    items: contactsSection.value,
    isLoading: isSearching.value,
    emptyState: t('SEARCH.FILTERS.NO_CONTACTS'),
  },
  {
    title: t('SEARCH.FILTERS.AGENTS'),
    items: agentsSection.value,
    emptyState: t('SEARCH.FILTERS.NO_AGENTS'),
  },
]);

const selectedLabel = computed(() => {
  if (!modelValue.value) return props.label;

  const [type, id] = modelValue.value.split(':');
  const numericId = Number(id);

  if (type === FROM_TYPE.CONTACT) {
    if (selectedContact.value?.id === numericId) {
      return `${props.label}: ${selectedContact.value.name}`;
    }
    const contact = searchedContacts.value?.find(c => c.id === numericId);
    if (contact) return `${props.label}: ${contact.name}`;
  } else if (type === FROM_TYPE.AGENT) {
    const agent = agentsList.value?.find(a => a.id === numericId);
    if (agent) return `${props.label}: ${agent.name}`;
  }

  return `${props.label}: ${numericId}`;
});

const debouncedSearch = debounce(async query => {
  if (!query) {
    searchedContacts.value = selectedContact.value
      ? [selectedContact.value]
      : [];
    isSearching.value = false;
    return;
  }

  try {
    const contacts = await searchContacts(query, { skipMinLength: true });

    // null means the request was aborted (a newer search is in-flight),
    if (contacts === null) return;

    // Add selected contact to top if not already in results
    const allContacts = selectedContact.value
      ? [
          selectedContact.value,
          ...contacts.filter(c => c.id !== selectedContact.value.id),
        ]
      : contacts;

    searchedContacts.value = allContacts;
    isSearching.value = false;
  } catch {
    isSearching.value = false;
  }
}, 300);

const performSearch = query => {
  searchQuery.value = query;
  if (query) {
    searchedContacts.value = selectedContact.value
      ? [selectedContact.value]
      : [];
    isSearching.value = true;
  }
  debouncedSearch(query);
};

const onDropdownOpen = () => {
  searchQuery.value = '';
  searchedContacts.value = selectedContact.value ? [selectedContact.value] : [];
};

const handleAction = item => {
  if (modelValue.value === item.value) {
    modelValue.value = null;
    selectedContact.value = null;
  } else {
    modelValue.value = item.value;

    if (item.type === FROM_TYPE.CONTACT) {
      const [, id] = item.value.split(':');
      selectedContact.value = {
        id: Number(id),
        name: item.label,
        thumbnail: item.thumbnail?.src,
      };
    } else {
      selectedContact.value = null;
    }
  }

  emit('change');
};

const resolveContactName = async () => {
  if (!modelValue.value) return;

  const [type, id] = modelValue.value.split(':');
  if (type !== FROM_TYPE.CONTACT) return;

  const numericId = Number(id);
  if (selectedContact.value?.id === numericId) return;

  const contact = await fetchContactDetails(numericId);
  if (contact) {
    selectedContact.value = {
      id: contact.id,
      name: contact.name,
      thumbnail: contact.thumbnail,
    };
    if (!searchedContacts.value.some(c => c.id === contact.id)) {
      searchedContacts.value.push(selectedContact.value);
    }
  }
};

watch(() => modelValue.value, resolveContactName, { immediate: true });
</script>

<template>
  <DropdownMenu
    @update:open="
      val => {
        if (val) onDropdownOpen();
      }
    "
  >
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="!px-2 max-w-full">
        <span class="truncate">{{ selectedLabel }}</span>
        <Icon icon="i-lucide-chevron-down" class="ml-1 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64 max-h-80 overflow-y-auto">
      <div class="sticky top-0 bg-n-alpha-3 backdrop-blur-sm mb-1">
        <InputGroup>
          <InputGroupAddon>
            <span class="i-lucide-search size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            :value="searchQuery"
            type="search"
            :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
            @input="performSearch($event.target.value)"
          />
        </InputGroup>
      </div>
      <template
        v-for="(section, sIndex) in menuSections"
        :key="section.title || sIndex"
      >
        <DropdownMenuSeparator v-if="sIndex > 0" />
        <DropdownMenuLabel>{{ section.title }}</DropdownMenuLabel>
        <div
          v-if="section.isLoading"
          class="flex items-center justify-center py-2"
        >
          <Spinner class="size-6" />
        </div>
        <div
          v-else-if="!section.items.length"
          class="text-sm text-n-slate-11 px-2 py-1.5"
        >
          {{ section.emptyState }}
        </div>
        <DropdownMenuItem
          v-for="item in section.items"
          :key="item.value"
          :class="item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''"
          @select="handleAction(item)"
        >
          <Avatar
            v-if="item.thumbnail"
            :name="item.thumbnail.name"
            :src="item.thumbnail.src"
            :size="20"
            rounded-full
          />
          <span class="min-w-0 truncate">{{ item.label }}</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
