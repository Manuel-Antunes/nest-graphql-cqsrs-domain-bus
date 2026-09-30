<script setup>
import { useTemplateRef, onBeforeUnmount, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTrack } from 'dashboard/composables';
import { useStore } from 'dashboard/composables/store';
import { CONVERSATION_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { useConversationFilterContext } from './provider.js';
import { useSnakeCase } from 'dashboard/composables/useTransformKeys';
import { Button } from 'dashboard/components-next/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import Input from 'dashboard/components-next/input/Input.vue';
import ConditionRow from './ConditionRow.vue';

const props = defineProps({
  isFolderView: {
    type: Boolean,
    default: false,
  },
  folderName: {
    type: String,
    default: '',
  },
  align: {
    type: String,
    default: 'start',
  },
});

const emit = defineEmits(['applyFilter', 'updateFolder', 'close']);
const { filterTypes } = useConversationFilterContext();

const filters = defineModel({
  type: Array,
  default: [],
});
const folderNameLocal = ref(props.folderName);

const DEFAULT_FILTER = {
  attributeKey: 'status',
  filterOperator: 'equal_to',
  values: [],
  queryOperator: 'and',
};

const { t } = useI18n();
const store = useStore();

const resetFilter = () => {
  filters.value = [{ ...DEFAULT_FILTER }];
};

const removeFilter = index => {
  if (filters.value.length === 1) {
    resetFilter();
  } else {
    filters.value.splice(index, 1);
  }
};

const addFilter = () => {
  filters.value.push({ ...DEFAULT_FILTER });
};

const conditionsRef = useTemplateRef('conditionsRef');

const isConditionsValid = () => {
  return conditionsRef.value.every(condition => condition.validate());
};

const updateSavedCustomViews = () => {
  if (isConditionsValid()) {
    emit('updateFolder', filters.value, folderNameLocal.value);
  }
};

function validateAndSubmit() {
  if (!isConditionsValid()) {
    return;
  }

  store.dispatch(
    'setConversationFilters',
    useSnakeCase(JSON.parse(JSON.stringify(filters.value)))
  );
  emit('applyFilter', filters.value);
  useTrack(CONVERSATION_EVENTS.APPLY_FILTER, {
    appliedFilters: filters.value.map(filter => ({
      key: filter.attributeKey,
      operator: filter.filterOperator,
      queryOperator: filter.queryOperator,
    })),
  });
}

const filterModalHeaderTitle = computed(() => {
  return !props.isFolderView
    ? t('FILTER.TITLE')
    : t('FILTER.EDIT_CUSTOM_FILTER');
});

onBeforeUnmount(() => emit('close'));

const isOpen = ref(true);

const handleOpenChange = value => {
  isOpen.value = value;
  if (!value) emit('close');
};

// Keep the panel open when the external toggle button is clicked — that button
// (in ChatListHeader) owns the open/close state, so reka should not dismiss here.
const handlePointerDownOutside = event => {
  const target = event.detail?.originalEvent?.target;
  if (target?.closest?.('#toggleConversationFilterButton')) {
    event.preventDefault();
  }
};
</script>

<template>
  <Popover :open="isOpen" @update:open="handleOpenChange">
    <PopoverAnchor />
    <PopoverContent
      disable-portal
      :align="align"
      :side-offset="0"
      class="z-40 w-[750px] max-w-[var(--reka-popover-content-available-width)] overflow-visible border border-n-weak bg-n-alpha-3 backdrop-blur-[100px] shadow-lg rounded-xl p-4 grid gap-4"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @pointer-down-outside="handlePointerDownOutside"
    >
      <h3 class="text-base font-medium leading-6 text-n-slate-12">
        {{ filterModalHeaderTitle }}
      </h3>
      <div v-if="props.isFolderView">
        <div class="border-b border-n-weak pb-6">
          <Input
            v-model="folderNameLocal"
            :label="t('FILTER.FOLDER_LABEL')"
            :placeholder="t('FILTER.INPUT_PLACEHOLDER')"
          />
        </div>
      </div>
      <ul class="grid gap-4 list-none">
        <template v-for="(filter, index) in filters" :key="index">
          <ConditionRow
            v-if="index === 0"
            ref="conditionsRef"
            v-model:attribute-key="filter.attributeKey"
            v-model:filter-operator="filter.filterOperator"
            v-model:values="filter.values"
            :filter-types="filterTypes"
            :show-query-operator="false"
            @remove="removeFilter(index)"
          />
          <ConditionRow
            v-else
            ref="conditionsRef"
            v-model:attribute-key="filter.attributeKey"
            v-model:filter-operator="filter.filterOperator"
            v-model:query-operator="filters[index - 1].queryOperator"
            v-model:values="filter.values"
            show-query-operator
            :filter-types="filterTypes"
            @remove="removeFilter(index)"
          />
        </template>
      </ul>
      <div class="flex flex-wrap gap-2 justify-between">
        <Button variant="link" @click="addFilter">
          {{ $t('FILTER.ADD_NEW_FILTER') }}
        </Button>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" @click="resetFilter">
            {{ t('FILTER.CLEAR_BUTTON_LABEL') }}
          </Button>
          <Button
            v-if="isFolderView"
            :disabled="!folderNameLocal"
            @click="updateSavedCustomViews"
          >
            {{ t('FILTER.UPDATE_BUTTON_LABEL') }}
          </Button>
          <Button v-else @click="validateAndSubmit">
            {{ t('FILTER.SUBMIT_BUTTON_LABEL') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
