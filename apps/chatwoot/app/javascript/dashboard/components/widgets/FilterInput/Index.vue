<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button/Select component names */
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { DatePicker } from 'dashboard/components-next/ui/date-picker';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import { Input } from 'dashboard/components-next/ui/input';

export default {
  name: 'FilterInput',
  components: {
    Button,
    Icon,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
    DatePicker,
    AsyncSelect,
    Input,
  },
  props: {
    modelValue: {
      type: Object,
      default: () => {},
    },
    filterAttributes: {
      type: Array,
      default: () => [],
    },
    inputType: {
      type: String,
      default: 'plain_text',
    },
    operators: {
      type: Array,
      default: () => [],
    },
    dropdownValues: {
      type: Array,
      default: () => [],
    },
    showQueryOperator: {
      type: Boolean,
      default: false,
    },
    showUserInput: {
      type: Boolean,
      default: true,
    },
    groupedFilters: {
      type: Boolean,
      default: false,
    },
    filterGroups: {
      type: Array,
      default: () => [],
    },
    customAttributeType: {
      type: String,
      default: '',
    },
    errorMessage: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue', 'removeFilter', 'resetFilter'],
  computed: {
    attributeKey: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.attribute_key;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, attribute_key: value });
      },
    },
    filterOperator: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.filter_operator;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, filter_operator: value });
      },
    },
    values: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.values;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, values: value });
      },
    },
    query_operator: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.query_operator;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, query_operator: value });
      },
    },
    custom_attribute_type: {
      get() {
        if (!this.customAttributeType) return '';
        return this.customAttributeType;
      },
      set() {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', {
          ...payload,
          custom_attribute_type: this.customAttributeType,
        });
      },
    },
    // `multi_select` stores values as an array of `{ id, name }`; AsyncSelect
    // speaks in arrays of id strings, so we map between the two shapes here.
    multiSelectValues() {
      return Array.isArray(this.values)
        ? this.values.map(v => String(v.id))
        : [];
    },
    // `search_select` stores a single `{ id, name }`; AsyncSelect speaks ids.
    searchSelectValue() {
      return this.values?.id != null ? String(this.values.id) : '';
    },
  },
  watch: {
    customAttributeType: {
      handler(value) {
        if (
          value === 'conversation_attribute' ||
          value === 'contact_attribute'
        ) {
          // eslint-disable-next-line vue/no-mutating-props
          this.modelValue.custom_attribute_type = this.customAttributeType;
          // eslint-disable-next-line vue/no-mutating-props
        } else this.modelValue.custom_attribute_type = '';
      },
      immediate: true,
    },
  },
  methods: {
    removeFilter() {
      this.$emit('removeFilter');
    },
    resetFilter() {
      this.$emit('resetFilter');
    },
    getInputErrorClass(errorMessage) {
      return errorMessage
        ? 'bg-n-ruby-8/20 border-n-ruby-5 dark:border-n-ruby-5'
        : 'bg-n-background border-n-weak dark:border-n-weak';
    },
    onMultiSelectUpdate(ids) {
      this.values = (this.dropdownValues ?? [])
        .filter(option => ids.includes(String(option.id)))
        .map(option => ({ id: option.id, name: option.name }));
    },
    onSearchSelectUpdate(value) {
      this.values =
        this.dropdownValues?.find(o => String(o.id) === value) ?? null;
    },
  },
};
</script>

<!-- eslint-disable vue/no-mutating-props -->
<template>
  <div>
    <div
      class="p-2 border border-solid rounded-lg"
      :class="getInputErrorClass(errorMessage)"
    >
      <div class="flex gap-1">
        <!-- Attribute key — grouped -->
        <Select
          v-if="groupedFilters"
          :model-value="attributeKey"
          @update:model-value="
            v => {
              attributeKey = v;
              resetFilter();
            }
          "
        >
          <SelectTrigger class="max-w-[30%]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup v-for="(group, i) in filterGroups" :key="i">
              <SelectLabel>{{ group.name }}</SelectLabel>
              <SelectItem
                v-for="attribute in group.attributes"
                :key="attribute.key"
                :value="attribute.key"
                :disabled="attribute.disabled"
              >
                {{ attribute.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <!-- Attribute key — flat -->
        <Select
          v-else
          :model-value="attributeKey"
          @update:model-value="
            v => {
              attributeKey = v;
              resetFilter();
            }
          "
        >
          <SelectTrigger class="max-w-[30%]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="attribute in filterAttributes"
              :key="attribute.key"
              :value="attribute.key"
              :disabled="attribute.disabled"
            >
              {{ attribute.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Filter operator -->
        <Select
          :model-value="filterOperator"
          @update:model-value="filterOperator = $event"
        >
          <SelectTrigger class="max-w-[20%]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(operator, o) in operators"
              :key="o"
              :value="operator.value"
            >
              {{ $t(`FILTER.OPERATOR_LABELS.${operator.value}`) }}
            </SelectItem>
          </SelectContent>
        </Select>

        <div v-if="showUserInput" class="flex-grow mr-1 filter__answer--wrap">
          <AsyncSelect
            v-if="inputType === 'multi_select'"
            multi
            disable-portal
            popover-align="start"
            :model-value="multiSelectValues"
            :options="dropdownValues"
            :get-option-value="option => String(option.id)"
            :get-option-label="option => option.name"
            :placeholder="$t('FORMS.MULTISELECT.SELECT')"
            @update:model-value="onMultiSelectUpdate"
          />
          <AsyncSelect
            v-else-if="inputType === 'search_select'"
            disable-portal
            popover-align="start"
            :model-value="searchSelectValue"
            :options="dropdownValues"
            :get-option-value="option => String(option.id)"
            :get-option-label="option => option.name"
            :placeholder="$t('FORMS.MULTISELECT.SELECT')"
            @update:model-value="onSearchSelectUpdate"
          />
          <DatePicker v-else-if="inputType === 'date'" v-model="values" />
          <Input
            v-else
            v-model="values"
            type="text"
            class="!mb-0"
            :placeholder="$t('FILTER.INPUT_PLACEHOLDER')"
          />
        </div>
        <Button variant="ghost" size="icon" @click="removeFilter">
          <Icon icon="i-lucide-x" />
        </Button>
      </div>
      <p v-if="errorMessage" class="filter-error">
        {{ errorMessage }}
      </p>
    </div>

    <!-- Query operator separator -->
    <div
      v-if="showQueryOperator"
      class="flex items-center justify-center relative my-2.5 mx-0"
    >
      <hr class="absolute w-full border-b border-solid border-n-weak" />
      <Select
        :model-value="query_operator"
        @update:model-value="query_operator = $event"
      >
        <SelectTrigger class="relative w-auto bg-n-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="and">
            {{ $t('FILTER.QUERY_DROPDOWN_LABELS.AND') }}
          </SelectItem>
          <SelectItem value="or">
            {{ $t('FILTER.QUERY_DROPDOWN_LABELS.OR') }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.filter__answer--wrap {
  input {
    @apply bg-n-background mb-0 text-n-slate-12 border-n-weak;
  }
}

.filter-error {
  @apply text-n-ruby-9 dark:text-n-ruby-9 block my-1 mx-0;
}
</style>
