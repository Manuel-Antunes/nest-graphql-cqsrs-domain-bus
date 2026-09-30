<script setup>
import { computed, defineModel, h, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import FilterSelect from './inputs/FilterSelect.vue';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import { DatePicker } from 'dashboard/components-next/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

import { useSnakeCase } from 'dashboard/composables/useTransformKeys';
import { validateSingleFilter } from 'dashboard/helper/validations.js';
import Icon from 'next/icon/Icon.vue';

// filterTypes: import('vue').ComputedRef<FilterType[]>
const { filterTypes } = defineProps({
  showQueryOperator: { type: Boolean, default: false },
  filterTypes: { type: Array, required: true },
});

const emit = defineEmits(['remove']);
const { t } = useI18n();
const showErrors = ref(false);

const attributeKey = defineModel('attributeKey', {
  type: String,
  required: true,
});

const values = defineModel('values', {
  type: [String, Number, Array, Object],
  required: true,
});

const filterOperator = defineModel('filterOperator', {
  type: String,
  required: true,
});

const queryOperator = defineModel('queryOperator', {
  type: String,
  required: false,
  default: undefined,
  validator: value => ['and', 'or'].includes(value),
});

const getFilterFromFilterTypes = key =>
  filterTypes.find(filterObj => filterObj.attributeKey === key);

const currentFilter = computed(() =>
  getFilterFromFilterTypes(attributeKey.value)
);

// `multiSelect` stores values as an array of `{ id, name }`; AsyncSelect speaks
// in arrays of id strings, so we map between the two shapes here.
const multiSelectValues = computed(() =>
  Array.isArray(values.value) ? values.value.map(v => String(v.id)) : []
);
const onMultiSelectUpdate = ids => {
  values.value = (currentFilter.value?.options ?? [])
    .filter(option => ids.includes(String(option.id)))
    .map(option => ({ id: option.id, name: option.name }));
};

const getOperator = (filter, selectedOperator) => {
  const operatorFromOptions = filter.filterOperators.find(
    operator => operator.value === selectedOperator
  );

  if (!operatorFromOptions) {
    return filter.filterOperators[0];
  }

  return operatorFromOptions;
};

const currentOperator = computed(() =>
  getOperator(currentFilter.value, filterOperator.value)
);

const getInputType = (operator, filter) =>
  operator.inputOverride ?? filter.inputType;

const inputType = computed(() =>
  getInputType(currentOperator.value, currentFilter.value)
);

const queryOperatorOptions = computed(() => {
  return [
    {
      label: t(`FILTER.QUERY_DROPDOWN_LABELS.AND`),
      value: 'and',
      icon: h('span', { class: 'i-lucide-ampersands !text-primary' }),
    },
    {
      label: t(`FILTER.QUERY_DROPDOWN_LABELS.OR`),
      value: 'or',
      icon: h('span', { class: 'i-woot-logic-or !text-primary' }),
    },
  ];
});

const booleanOptions = computed(() => [
  { id: true, name: t('FILTER.ATTRIBUTE_LABELS.TRUE') },
  { id: false, name: t('FILTER.ATTRIBUTE_LABELS.FALSE') },
]);

const validationError = computed(() => {
  // TOOD: Migrate validateSingleFilter to use camelcase and then remove useSnakeCase here too
  return validateSingleFilter(
    useSnakeCase({
      attributeKey: attributeKey.value,
      filterOperator: filterOperator.value,
      values: values.value,
    })
  );
});

const inputFieldType = computed(() => {
  if (inputType.value === 'date') return 'date';
  if (inputType.value === 'number') return 'number';
  return 'text';
});

const resetModelOnAttributeKeyChange = newAttributeKey => {
  /**
   * Resets the filter values and operator when the attribute key changes. This ensures that
   * the values and operator remain compatible with the new attribute type. For example,
   * switching from a text field to a multi-select should reset the value from '' (empty string)
   * to an empty array.
   */
  const filter = getFilterFromFilterTypes(newAttributeKey);
  const newOperator = getOperator(filter, filterOperator.value);
  const newInputType = getInputType(newOperator, filter);
  if (newInputType === 'multiSelect') {
    values.value = [];
  } else if (
    ['searchSelect', 'asyncSelect', 'booleanSelect'].includes(newInputType)
  ) {
    values.value = {};
  } else {
    values.value = '';
  }
  filterOperator.value = newOperator.value;
};

watch([attributeKey, values, filterOperator], () => {
  showErrors.value = false;
});

const validate = () => {
  showErrors.value = true;
  return !validationError.value;
};

defineExpose({ validate });
</script>

<template>
  <li class="list-none">
    <div
      class="flex flex-wrap items-center gap-2 rounded-md"
      :class="{
        'animate-wiggle': showErrors && validationError,
      }"
    >
      <FilterSelect
        v-if="showQueryOperator"
        v-model="queryOperator"
        variant="faded"
        hide-icon
        :options="queryOperatorOptions"
      />
      <FilterSelect
        v-model="attributeKey"
        variant="faded"
        :options="filterTypes"
        @update:model-value="resetModelOnAttributeKeyChange"
      />
      <FilterSelect
        v-model="filterOperator"
        variant="ghost"
        :options="currentFilter.filterOperators"
      />
      <template v-if="currentOperator.hasInput">
        <AsyncSelect
          v-if="inputType === 'multiSelect'"
          :key="`multi-${attributeKey}`"
          multi
          :model-value="multiSelectValues"
          :options="currentFilter.options"
          :get-option-value="option => String(option.id)"
          :get-option-label="option => option.name"
          :label="currentFilter.label"
          :placeholder="t('FILTER.INPUT_PLACEHOLDER')"
          disable-portal
          width="14rem"
          popover-align="start"
          @update:model-value="onMultiSelectUpdate"
        />
        <AsyncSelect
          v-else-if="inputType === 'asyncSelect'"
          :key="attributeKey"
          :model-value="values?.id != null ? String(values.id) : ''"
          :options="currentFilter.options"
          :get-option-value="option => String(option.id)"
          :get-option-label="option => option.name"
          :label="currentFilter.label"
          :placeholder="t('FILTER.INPUT_PLACEHOLDER')"
          disable-portal
          width="14rem"
          popover-align="start"
          trigger-class="h-9"
          @update:model-value="
            v =>
              (values =
                currentFilter.options?.find(o => String(o.id) === v) ?? null)
          "
        />
        <Select
          v-else-if="inputType === 'searchSelect'"
          :modal="false"
          :model-value="values?.id != null ? String(values.id) : ''"
          @update:model-value="
            v =>
              (values =
                currentFilter.options?.find(o => String(o.id) === v) ?? null)
          "
        >
          <SelectTrigger>
            <SelectValue :placeholder="t('FILTER.INPUT_PLACEHOLDER')" />
          </SelectTrigger>
          <SelectContent disable-portal>
            <SelectItem
              v-for="option in currentFilter.options"
              :key="option.id"
              :value="String(option.id)"
              >{{ option.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          v-else-if="inputType === 'booleanSelect'"
          :modal="false"
          :model-value="values?.id != null ? String(values.id) : ''"
          @update:model-value="
            v => (values = booleanOptions.find(o => String(o.id) === v) ?? null)
          "
        >
          <SelectTrigger>
            <SelectValue :placeholder="t('FILTER.INPUT_PLACEHOLDER')" />
          </SelectTrigger>
          <SelectContent disable-portal>
            <SelectItem
              v-for="option in booleanOptions"
              :key="String(option.id)"
              :value="String(option.id)"
            >
              {{ option.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <DatePicker
          v-else-if="inputType === 'date'"
          v-model="values"
          class="h-9 w-[14rem]"
        />
        <Input
          v-else
          v-model="values"
          :type="inputFieldType"
          class="max-w-[14rem]"
          :placeholder="t('FILTER.INPUT_PLACEHOLDER')"
        />
      </template>
      <Button variant="destructive" size="icon" @click.stop="emit('remove')">
        <Icon icon="i-lucide-trash" />
      </Button>
    </div>
    <span v-if="showErrors && validationError" class="text-sm text-n-ruby-11">
      {{ t(`FILTER.ERRORS.${validationError}`) }}
    </span>
  </li>
</template>
