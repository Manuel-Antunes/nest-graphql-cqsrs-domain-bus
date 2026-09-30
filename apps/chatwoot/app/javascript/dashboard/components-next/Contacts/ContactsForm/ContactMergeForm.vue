<script setup>
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import Icon from 'next/icon/Icon.vue';
import Badge from 'next/ui/badge/Badge.vue';
import Label from 'next/ui/label/Label.vue';
import { useI18n } from 'vue-i18n';

defineProps({
  selectedContact: {
    type: Object,
    required: true,
  },
  primaryContactId: {
    type: [Number, null],
    default: null,
  },
  primaryContactList: {
    type: Array,
    default: () => [],
  },
  isSearching: {
    type: Boolean,
    default: false,
  },
  hasError: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:primaryContactId', 'search']);

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <Label>
          {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PRIMARY') }}
        </Label>
        <Badge variant="success">
          {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PRIMARY_HELP_LABEL') }}
        </Badge>
      </div>
      <AsyncSelect
        id="inbox"
        use-api-results
        :model-value="primaryContactId"
        :options="primaryContactList"
        :empty-state="
          isSearching
            ? t('CONTACTS_LAYOUT.SIDEBAR.MERGE.IS_SEARCHING')
            : t('CONTACTS_LAYOUT.SIDEBAR.MERGE.EMPTY_STATE')
        "
        :search-placeholder="
          t('CONTACTS_LAYOUT.SIDEBAR.MERGE.SEARCH_PLACEHOLDER')
        "
        :placeholder="t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PLACEHOLDER')"
        :has-error="hasError"
        :message="errorMessage"
        class="[&>div>button]:bg-n-alpha-black2"
        @update:model-value="value => emit('update:primaryContactId', value)"
        @search="query => emit('search', query)"
      />
    </div>

    <div class="relative flex justify-center items-center">
      <Icon
        icon="i-lucide-move-up"
        class="absolute size-5 -bottom-6 text-input"
      />
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <Label>
          {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PARENT') }}
        </Label>
        <Badge variant="destructive">
          {{ t('CONTACTS_LAYOUT.SIDEBAR.MERGE.PARENT_HELP_LABEL') }}
        </Badge>
      </div>
      <div
        class="border border-n-strong h-[60px] gap-2 flex items-center rounded-xl p-3"
      >
        <Avatar
          :name="selectedContact.name || ''"
          :src="selectedContact.thumbnail || ''"
          :size="32"
          rounded-full
        />
        <div class="flex flex-col w-full min-w-0 gap-1">
          <span class="text-sm leading-4 truncate text-n-slate-11">
            {{ selectedContact.name }}
          </span>
          <span class="text-sm leading-4 truncate text-n-slate-11">
            {{ selectedContact.email }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
