<script setup>
import { ref, computed } from 'vue';
import { parseISO } from 'date-fns';
import { useI18n } from 'vue-i18n';
import { useVuelidate } from '@vuelidate/core';
import { required } from '@vuelidate/validators';
import { DatePicker } from 'dashboard/components-next/ui/date-picker';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  attribute: {
    type: Object,
    required: true,
  },
  isEditingView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update', 'delete']);

const { t } = useI18n();

const isEditingValue = ref(false);
const editedValue = ref(props.attribute.value || '');

const rules = {
  editedValue: {
    required,
    isDate: value => new Date(value).toISOString(),
  },
};

const v$ = useVuelidate(rules, { editedValue });

const formattedDate = computed(() => {
  return props.attribute.value
    ? new Date(props.attribute.value).toLocaleDateString()
    : t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.INPUT');
});

const hasError = computed(() => v$.value.$errors.length > 0);

const defaultDateValue = computed({
  get() {
    const existingDate = editedValue.value ?? props.attribute.value;
    if (existingDate) return new Date(existingDate).toISOString().slice(0, 10);
    return isEditingValue.value && !hasError.value
      ? new Date().toISOString().slice(0, 10)
      : '';
  },
  set(value) {
    editedValue.value = value ? new Date(value).toISOString() : value;
  },
});

const toggleEditValue = value => {
  isEditingValue.value =
    typeof value === 'boolean' ? value : !isEditingValue.value;

  if (isEditingValue.value && !editedValue.value) {
    v$.value.$reset();
    editedValue.value = new Date().toISOString();
  }
};

const handleInputUpdate = async () => {
  const isValid = await v$.value.$validate();
  if (!isValid) return;

  emit('update', parseISO(editedValue.value));
  isEditingValue.value = false;
};
</script>

<template>
  <div
    class="flex items-center w-full min-w-0 gap-2"
    :class="{
      'justify-start': isEditingView,
      'justify-end': !isEditingView,
    }"
  >
    <span
      v-if="!isEditingValue"
      class="min-w-0 text-sm"
      :class="{
        'cursor-pointer text-n-slate-11 hover:text-n-slate-12 py-2 select-none font-medium':
          !isEditingView,
        'text-n-slate-12 truncate': isEditingView,
      }"
      @click="toggleEditValue(!isEditingView)"
    >
      {{ formattedDate }}
    </span>

    <div
      v-if="isEditingView && !isEditingValue"
      class="flex items-center gap-1"
    >
      <Button variant="outline" size="icon" @click="toggleEditValue(true)">
        <Icon :icon="'i-lucide-pencil'" />
      </Button>
      <Button variant="destructive" size="icon" @click="emit('delete')">
        <Icon :icon="'i-lucide-trash'" />
      </Button>
    </div>

    <div
      v-if="isEditingValue"
      v-on-clickaway="() => toggleEditValue(false)"
      class="flex items-center w-full"
    >
      <div class="relative w-full">
        <DatePicker
          v-model="defaultDateValue"
          class="h-8 w-full ltr:rounded-r-none rtl:rounded-l-none"
          :placeholder="t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.INPUT')"
        />
        <p
          v-if="hasError"
          class="absolute mt-0.5 top-8 ltr:left-0 rtl:right-0 text-sm text-n-ruby-9"
        >
          {{ t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.VALIDATIONS.INVALID_DATE') }}
        </p>
      </div>
      <!-- TODO: dynamic color/variant – review manually -->
      <Button variant="default" size="icon" @click="handleInputUpdate">
        <Icon :icon="'i-lucide-check'" />
      </Button>
    </div>
  </div>
</template>
