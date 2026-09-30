<script setup>
import { useTemplateRef, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTrack } from 'dashboard/composables';
import { useStore } from 'dashboard/composables/store';
import { CONTACTS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { useContactFilterContext } from './contactProvider.js';
import { useSnakeCase } from 'dashboard/composables/useTransformKeys';

import { Button } from 'dashboard/components-next/ui/button';
import ConditionRow from './ConditionRow.vue';
import { Input } from 'dashboard/components-next/ui/input';

const props = defineProps({
  isSegmentView: { type: Boolean, default: false },
  segmentName: { type: String, default: '' },
});

const emit = defineEmits(['applyFilter', 'updateSegment', 'clearFilters']);
const { filterTypes } = useContactFilterContext();

const filters = defineModel({
  type: Array,
  default: [],
});
const segmentNameLocal = ref(props.segmentName);

const DEFAULT_FILTER = {
  attributeKey: 'name',
  filterOperator: 'equal_to',
  values: '',
  queryOperator: 'and',
  attributeModel: 'standard',
};

const { t } = useI18n();
const store = useStore();

const resetFilter = () => {
  emit('clearFilters');
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

const updateSavedSegment = () => {
  if (isConditionsValid()) {
    emit('updateSegment', filters.value, segmentNameLocal.value);
  }
};

function validateAndSubmit() {
  if (!isConditionsValid()) return;

  store.dispatch(
    'contacts/setContactFilters',
    useSnakeCase(JSON.parse(JSON.stringify(filters.value)))
  );
  emit('applyFilter', filters.value);
  useTrack(CONTACTS_EVENTS.APPLY_FILTER, {
    appliedFilters: filters.value.map(filter => ({
      key: filter.attributeKey,
      operator: filter.filterOperator,
      queryOperator: filter.queryOperator,
    })),
  });
}

const filterModalHeaderTitle = computed(() => {
  return !props.isSegmentView
    ? t('CONTACTS_LAYOUT.FILTER.TITLE')
    : t('CONTACTS_LAYOUT.FILTER.EDIT_SEGMENT');
});
</script>

<template>
  <div class="min-w-96 lg:w-[750px] grid gap-6 p-6">
    <h3 class="text-base font-medium leading-6 text-n-slate-12">
      {{ filterModalHeaderTitle }}
    </h3>
    <div v-if="props.isSegmentView">
      <div class="pb-6 border-b border-n-weak">
        <Input
          v-model="segmentNameLocal"
          :label="$t('CONTACTS_LAYOUT.FILTER.SEGMENT.LABEL')"
          :placeholder="t('CONTACTS_LAYOUT.FILTER.SEGMENT.INPUT_PLACEHOLDER')"
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
    <div class="flex justify-between gap-2">
      <Button variant="link" @click="addFilter">
        {{ $t('CONTACTS_LAYOUT.FILTER.BUTTONS.ADD_FILTER') }}
      </Button>
      <div class="flex gap-2 flex-shrink-0">
        <Button variant="outline" @click="resetFilter">
          {{ $t('CONTACTS_LAYOUT.FILTER.BUTTONS.CLEAR_FILTERS') }}
        </Button>
        <Button
          v-if="isSegmentView"
          :disabled="!segmentNameLocal"
          @click="updateSavedSegment"
        >
          {{ $t('CONTACTS_LAYOUT.FILTER.BUTTONS.UPDATE_SEGMENT') }}
        </Button>
        <Button v-else @click="validateAndSubmit">
          {{ $t('CONTACTS_LAYOUT.FILTER.BUTTONS.APPLY_FILTERS') }}
        </Button>
      </div>
    </div>
  </div>
</template>
