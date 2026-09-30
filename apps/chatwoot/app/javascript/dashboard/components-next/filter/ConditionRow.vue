<script setup>
import { computed, h, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import FilterSelect from './inputs/FilterSelect.vue';
import MultiTextInput from './inputs/MultiTextInput.vue';
import EmojiIcon from 'dashboard/components-next/emoji-icon-picker/EmojiIcon.vue';
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
  const operatorFromOptions = filter?.filterOperators?.find(
    operator => operator.value === selectedOperator
  );

  if (!operatorFromOptions) {
    return filter?.filterOperators?.[0];
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

const selectOption = (options, value) => {
  const option = options?.find(o => String(o.id) === value);
  return option ? { id: option.id, name: option.name } : null;
};

const asyncOptions = ref([]);

const selectedAsyncOptions = computed(() =>
  values.value?.id != null
    ? [{ id: values.value.id, name: values.value.name }]
    : []
);

const searchAsyncOptions = async query => {
  if (!query?.trim()) return selectedAsyncOptions.value;
  let results;
  try {
    results = await currentFilter.value.searchOptions(query);
  } catch {
    results = [];
  }
  if (results !== null) asyncOptions.value = results;
  return asyncOptions.value;
};

const onAsyncSearchSelect = value => {
  values.value = selectOption(
    [...asyncOptions.value, ...selectedAsyncOptions.value],
    value
  );
};

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
  if (['multiSelect', 'multiText'].includes(newInputType)) {
    values.value = [];
  } else if (
    [
      'searchSelect',
      'asyncSelect',
      'asyncSearchSelect',
      'booleanSelect',
    ].includes(newInputType)
  ) {
    values.value = {};
  } else {
    values.value = '';
  }
  asyncOptions.value = [];
  filterOperator.value = newOperator.value;
};

watch([attributeKey, values, filterOperator], () => {
  showErrors.value = false;
});

const validate = () => {
  showErrors.value = true;
  return !validationError.value;
};

const resetValidation = () => {
  showErrors.value = false;
};

defineExpose({ validate, resetValidation });
</script>

<template>
  <li class="list-none">
    <div
      class="flex flex-wrap gap-2 rounded-md"
      :class="{
        'animate-wiggle': showErrors && validationError,
        'items-start': inputType === 'multiText',
        'items-center': inputType !== 'multiText',
      }"
    >
      <FilterSelect
        v-if="showQueryOperator"
        v-model="queryOperator"
        variant="faded"
        hide-icon
        class="shrink-0"
        :options="queryOperatorOptions"
      />
      <FilterSelect
        v-model="attributeKey"
        variant="faded"
        class="shrink-0"
        :options="filterTypes"
        @update:model-value="resetModelOnAttributeKeyChange"
      />
      <FilterSelect
        v-model="filterOperator"
        variant="ghost"
        class="shrink-0"
        :options="currentFilter?.filterOperators"
      />
      <div
        :class="
          currentOperator?.hasInput
            ? 'flex items-start gap-2 min-w-0'
            : 'contents'
        "
      >
        <template v-if="currentOperator?.hasInput">
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
          >
            <template #option="{ option }">
              <EmojiIcon
                v-if="option.emoji"
                :value="option.emoji"
                :color="option.iconColor"
                class="flex-shrink-0 size-4"
              />
              <span
                v-else-if="option.color"
                class="flex-shrink-0 rounded-full size-1.5"
                :style="{ backgroundColor: option.color }"
              />
              <Icon v-else-if="option.icon" :icon="option.icon" />
              <span class="truncate">{{ option.name }}</span>
            </template>
          </AsyncSelect>
          <AsyncSelect
            v-else-if="['asyncSelect', 'searchSelect'].includes(inputType)"
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
              v => (values = selectOption(currentFilter.options, v))
            "
          >
            <template #option="{ option }">
              <EmojiIcon
                v-if="option.emoji"
                :value="option.emoji"
                :color="option.iconColor"
                class="flex-shrink-0 size-4"
              />
              <span
                v-else-if="option.color"
                class="flex-shrink-0 rounded-full size-1.5"
                :style="{ backgroundColor: option.color }"
              />
              <Icon v-else-if="option.icon" :icon="option.icon" />
              <span class="truncate">{{ option.name }}</span>
            </template>
          </AsyncSelect>
          <AsyncSelect
            v-else-if="inputType === 'asyncSearchSelect'"
            :key="`async-${attributeKey}`"
            :model-value="values?.id != null ? String(values.id) : ''"
            :fetcher="searchAsyncOptions"
            :get-option-value="option => String(option.id)"
            :get-option-label="option => option.name"
            :label="currentFilter.label"
            :placeholder="t('FILTER.INPUT_PLACEHOLDER')"
            :search-placeholder="currentFilter.searchPlaceholder"
            disable-portal
            width="14rem"
            popover-align="start"
            trigger-class="h-9"
            @update:model-value="onAsyncSearchSelect"
          />
          <Select
            v-else-if="inputType === 'booleanSelect'"
            :modal="false"
            :model-value="values?.id != null ? String(values.id) : ''"
            @update:model-value="
              v =>
                (values = booleanOptions.find(o => String(o.id) === v) ?? null)
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
          <MultiTextInput
            v-else-if="inputType === 'multiText'"
            v-model="values"
            :placeholder="
              values.length
                ? t('FILTER.MULTI_VALUE_INPUT_PLACEHOLDER_SHORT')
                : t('FILTER.MULTI_VALUE_INPUT_PLACEHOLDER')
            "
          />
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
        <Button
          variant="destructive"
          size="icon"
          class="flex-shrink-0"
          @click.stop="emit('remove')"
        >
          <Icon icon="i-lucide-trash" />
        </Button>
      </div>
    </div>
    <span v-if="showErrors && validationError" class="text-sm text-n-ruby-11">
      {{ t(`FILTER.ERRORS.${validationError}`) }}
    </span>
  </li>
</template>
